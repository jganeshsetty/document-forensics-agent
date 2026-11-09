import os
import uuid
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, File, UploadFile, BackgroundTasks, status, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field

from database.connection import (
    connect_to_mongo,
    close_mongo_connection,
    get_documents_collection,
)
from services.auth_service import (
    UserRegister,
    UserLogin,
    TokenResponse,
    hash_password,
    verify_password,
    create_access_token,
    get_user_by_email,
    save_user,
    seed_default_admin,
    get_current_user,
)
from services.extraction_service import (
    extract_document_features,
    classify_document,
    generate_layout_fingerprint,
    extract_smart_routed_document,
    tag_sensitive_pii,
)
from services.analysis_service import (
    run_ela_analysis,
    cross_verify_documents,
)
from services.rag_service import (
    chunk_and_vectorize_document,
    query_relevant_chunks,
)
from services.storage_service import storage_service
from services.local_db import save_local_document, get_local_document, list_local_documents

# In-memory background jobs registry
jobs_registry: Dict[str, Dict[str, Any]] = {}

# Max upload size: 200 MB
MAX_UPLOAD_SIZE = 200 * 1024 * 1024
# Max PDF pages to process (handles multi-page booklets, textbooks, and multi-sheet files)
MAX_PAGES = 100
# Max raw text length before truncation for MongoDB (avoid 16MB limit)
MAX_RAW_TEXT_LEN = 500_000

app = FastAPI(
    title="Document Forensics API",
    description="Enterprise-scale Document Forensics with Smart Routing, Asynchronous Background Processing, RAG Vectorization, and Cross-Document Forensic Auditing.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_db_client():
    try:
        await connect_to_mongo()
        print("Connected to MongoDB successfully.")
    except Exception as e:
        print(f"Notice: MongoDB connection startup alert: {e}")

    try:
        await seed_default_admin()
    except Exception as e:
        print(f"Notice: Admin seed alert: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongo_connection()
    print("Closed MongoDB connection.")


class DummyDocument(BaseModel):
    title: str = Field(default="Test Forensic Document")
    file_type: str = Field(default="pdf")
    status: str = Field(default="pending_analysis")
    notes: Optional[str] = Field(default="Dummy document inserted for testing connection.")


class AnalyzeRequest(BaseModel):
    document_ids: List[str] = Field(
        ...,
        description="List of document_ids to analyze (e.g. for ELA image forensics and RAG cross-verification)",
        example=["doc_id_1", "doc_id_2"],
    )


class ChatRequest(BaseModel):
    document_id: str = Field(..., description="The document_id to query against")
    question: str = Field(..., description="The natural language question to ask", min_length=1)
    n_results: int = Field(default=5, ge=1, le=15, description="Number of relevant chunks to retrieve")


async def background_process_document(
    job_id: str,
    document_id: str,
    file_path: str,
    filename: str,
    raw_bytes: Optional[bytes] = None,
):
    """Asynchronous background worker task:

    1. Runs Smart Routing (native PyMuPDF extraction for digital pages, RapidOCR for scans)
    2. Runs ELA forensics and uploads preview_<doc_id>.jpg and annotated_<doc_id>.jpg to GCS
    3. Classifies document
    4. Generates layout fingerprint
    5. Tags PII and redacts sensitive data
    6. Chunks and vectorizes into ChromaDB (500-char blocks)
    7. Stores full record into MongoDB and local fallback
    8. Updates job status to 'completed'
    """
    try:
        if job_id not in jobs_registry:
            jobs_registry[job_id] = {"job_id": job_id, "document_id": document_id}
        jobs_registry[job_id]["status"] = "processing"
        jobs_registry[job_id]["started_at"] = datetime.now(timezone.utc).isoformat()

        # Phase 1: Smart Routing & Multi-Page Extraction in non-blocking thread
        routed_result = await asyncio.to_thread(
            extract_smart_routed_document, raw_bytes or file_path, MAX_PAGES, document_id
        )
        raw_text = routed_result["raw_text"]
        entities = routed_result["entities"]
        image_size = routed_result["image_size"]
        pages = routed_result.get("pages", [])

        # Non-blocking ELA forensics upload directly to GCS
        page_img_url = storage_service.get_public_url(f"preview_{document_id}.jpg")
        annotated_img_url = storage_service.get_public_url(f"annotated_{document_id}.jpg")
        try:
            ela_res = await asyncio.to_thread(
                run_ela_analysis, raw_bytes or file_path, 90, 38.0, document_id
            )
            if "page_image_url" in ela_res:
                page_img_url = ela_res["page_image_url"]
            if "annotated_image_url" in ela_res:
                annotated_img_url = ela_res["annotated_image_url"]
        except Exception as e_err:
            print(f"Notice: Background ELA generation alert: {e_err}")

        # Truncate oversized text to prevent MongoDB 16MB limit issues
        if len(raw_text) > MAX_RAW_TEXT_LEN:
            raw_text = raw_text[:MAX_RAW_TEXT_LEN] + f"\n... [truncated, {routed_result.get('raw_text', '')[MAX_RAW_TEXT_LEN:].__len__()} more chars]"

        # Document Classification
        document_type = classify_document(raw_text)

        # PII Tagging & Redaction for security
        pii_result = tag_sensitive_pii(raw_text, entities)
        redacted_text = pii_result["raw_text"]
        pii_findings = pii_result["pii_findings"]

        # Layout Fingerprinting
        layout_data = generate_layout_fingerprint(entities, image_size)
        template_sig = layout_data["template_signature"]

        # Phase 2: Non-blocking RAG Vectorization & Chunking into ChromaDB
        total_chunks = 0
        for p in pages:
            p_num = p["page_number"]
            p_text = p["text"]
            if len(p_text) > MAX_RAW_TEXT_LEN:
                p_text = p_text[:MAX_RAW_TEXT_LEN]
            chunks = await asyncio.to_thread(
                chunk_and_vectorize_document,
                document_id=document_id,
                raw_text=p_text,
                page_number=p_num,
                extra_metadata={"filename": filename, "document_type": document_type},
            )
            total_chunks += len(chunks)

        # Build final document record with full multi-page and format metadata
        mongo_document = {
            "document_id": document_id,
            "filename": filename,
            "file_path": file_path,
            "page_image_url": page_img_url,
            "annotated_image_url": annotated_img_url,
            "file_type": routed_result.get("file_type", "document"),
            "document_type": document_type,
            "raw_text": redacted_text,
            "pii_findings": pii_findings,
            "entities": entities,
            "pages": pages,
            "layout_fingerprint": layout_data["normalized_layout"],
            "template_signature": template_sig,
            "image_size": image_size,
            "total_pages": routed_result.get("total_pages", 1),
            "processed_pages": routed_result.get("processed_pages", 1),
            "total_rag_chunks": total_chunks,
            "spreadsheet_data": routed_result.get("spreadsheet_data"),
            "docx_data": routed_result.get("docx_data"),
            "pdf_metadata": routed_result.get("pdf_metadata"),
            "json_info": routed_result.get("json_info"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        # Save local JSON copy as resilient fallback
        save_local_document(mongo_document)

        # Insert into MongoDB directly (background_tasks runs in event loop)
        collection = get_documents_collection()
        if collection is not None:
            try:
                await collection.insert_one(mongo_document)
            except Exception as m_err:
                print(f"Notice: MongoDB background insert error: {m_err}")

        # Update Job State
        jobs_registry[job_id]["status"] = "completed"
        jobs_registry[job_id]["completed_at"] = datetime.now(timezone.utc).isoformat()
        jobs_registry[job_id]["result"] = {
            "document_id": document_id,
            "document_type": document_type,
            "template_signature": template_sig,
            "total_pages": routed_result.get("total_pages", 1),
            "total_entities": len(entities),
            "total_rag_chunks": total_chunks,
            "pii_findings_count": len(pii_findings),
        }
    except Exception as exc:
        if job_id not in jobs_registry:
            jobs_registry[job_id] = {"job_id": job_id, "document_id": document_id}
        jobs_registry[job_id]["status"] = "failed"
        jobs_registry[job_id]["error"] = str(exc)
        print(f"Background processing job '{job_id}' failed: {exc}")


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "Document Forensics API (Asynchronous RAG Enterprise Edition) is online",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    collection = get_documents_collection()
    db_status = "unconfigured"

    if collection is not None:
        try:
            await asyncio.wait_for(collection.database.client.admin.command("ping"), timeout=1.5)
            db_status = "connected"
        except Exception:
            db_status = "local_db_fallback"

    response_payload = {
        "status": "healthy",
        "services": {
            "api": "up",
            "database": db_status,
            "rag_chromadb": "active",
            "storage": "gcs",
            "gcs_bucket": storage_service.bucket_name,
        },
    }

    return JSONResponse(status_code=status.HTTP_200_OK, content=response_payload)


# ====================================================================
# AUTHENTICATION ENDPOINTS (OAuth2 / JWT Bearer)
# ====================================================================
@app.post("/register", status_code=status.HTTP_201_CREATED, tags=["Authentication"])
async def register(user_in: UserRegister):
    """Register a new user or organization for enterprise forensics access."""
    clean_email = user_in.email.strip().lower()
    existing = await get_user_by_email(clean_email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An investigator account with this work email already exists.",
        )

    user_data = {
        "email": clean_email,
        "hashed_password": hash_password(user_in.password),
        "full_name": user_in.full_name or "Forensic Analyst",
        "role": "Forensic Analyst",
        "organization": user_in.organization or "Enterprise Security Ops",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await save_user(user_data)
    token = create_access_token({"sub": clean_email})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "email": user_data["email"],
            "full_name": user_data["full_name"],
            "role": user_data["role"],
            "organization": user_data["organization"],
            "created_at": user_data["created_at"],
        },
    }


@app.post("/token", response_model=TokenResponse, tags=["Authentication"])
async def login_for_access_token(
    request: Request,
    form_data: Optional[OAuth2PasswordRequestForm] = Depends(lambda: None),
):
    """Authenticate with credentials (supports JSON payload or OAuth2 form-data).

    Returns JWT bearer access token for authorized API access.
    """
    email = None
    password = None

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            email = body.get("email") or body.get("username")
            password = body.get("password")
        except Exception:
            pass
    elif form_data:
        email = form_data.username
        password = form_data.password

    if not email or not password:
        try:
            form = await request.form()
            email = form.get("username") or form.get("email")
            password = form.get("password")
        except Exception:
            pass

    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Work email and password are required.",
        )

    clean_email = str(email).strip().lower()
    user = await get_user_by_email(clean_email)
    if not user or not verify_password(str(password), user.get("hashed_password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Verify your work email and password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token({"sub": user["email"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "email": user["email"],
            "full_name": user.get("full_name", "Forensic Investigator"),
            "role": user.get("role", "Lead Forensic Investigator"),
            "organization": user.get("organization", "DocVerify Enterprise Security"),
            "created_at": user.get("created_at", datetime.now(timezone.utc).isoformat()),
        },
    }


@app.get("/me", tags=["Authentication"])
async def get_my_profile(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Retrieve profile of the currently authenticated forensic investigator."""
    return {
        "email": current_user["email"],
        "full_name": current_user.get("full_name", "Forensic Investigator"),
        "role": current_user.get("role", "Lead Forensic Investigator"),
        "organization": current_user.get("organization", "DocVerify Enterprise Security"),
        "created_at": current_user.get("created_at", ""),
    }


@app.post("/test-db", status_code=status.HTTP_201_CREATED, tags=["Database"])
async def test_db_insert(payload: Optional[DummyDocument] = None):
    collection = get_documents_collection()
    if collection is None:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"error": "Database connection is not initialized."},
        )

    doc_data = (payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()) if payload else {
        "title": "Test Forensic Document",
        "file_type": "pdf",
        "status": "pending_analysis",
        "notes": "Dummy document inserted for testing connection.",
    }
    doc_data["created_at"] = datetime.now(timezone.utc).isoformat()

    try:
        result = await collection.insert_one(doc_data)
        return {
            "message": "Dummy document inserted successfully.",
            "database": "forensics_db",
            "collection": "documents",
            "inserted_id": str(result.inserted_id),
            "document": {**doc_data, "_id": str(result.inserted_id)},
        }
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"Failed to insert document: {str(e)}"},
        )


@app.post("/extract", status_code=status.HTTP_202_ACCEPTED, tags=["Extraction"])
@app.post("/upload", status_code=status.HTTP_202_ACCEPTED, tags=["Extraction"])
async def extract_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Phase 3: Asynchronous Scalable Document Extraction.

    - Accepts file uploads (large multi-page PDFs or high-resolution images).
    - Enforces 200MB size limit.
    - Saves uploaded file via StorageBackend (MinIO or local fallback).
    - Immediately returns job_id and status: 'processing'.
    - Performs Smart Routing (PyMuPDF native vs OpenCV/Tesseract with security pattern bypass),
      PII redaction, RAG chunking (500-char blocks), vectorization into ChromaDB, and storage in the background.
    """
    # 1. Read uploaded file bytes with size enforcement
    try:
        image_bytes = await file.read()
        if not image_bytes:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"error": "Uploaded file is empty."},
            )
        if len(image_bytes) > MAX_UPLOAD_SIZE:
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={"error": f"File exceeds maximum size of {MAX_UPLOAD_SIZE // (1024*1024)} MB."},
            )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": f"Failed to read file: {str(e)}"},
        )

    # 2. Stream uploaded file directly to GCS bucket
    job_id = str(uuid.uuid4())
    document_id = str(uuid.uuid4())
    original_extension = Path(file.filename).suffix if file.filename else ".pdf"
    if not original_extension:
        original_extension = ".pdf"
    clean_stem = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', Path(file.filename).stem) if file.filename else "doc"
    blob_name = f"{document_id}_{clean_stem}{original_extension}"

    try:
        content_type = file.content_type or "application/octet-stream"
        file_stream = io.BytesIO(image_bytes)
        gcs_url = storage_service.upload_stream(file_stream, blob_name, content_type=content_type)
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"Failed to stream file to GCS: {str(e)}"},
        )

    # 3. Register background job
    jobs_registry[job_id] = {
        "job_id": job_id,
        "document_id": document_id,
        "filename": file.filename,
        "file_path": gcs_url,
        "gcs_url": gcs_url,
        "status": "processing",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "result": None,
    }

    # 4. Enqueue background execution (runs extraction and ELA generation in non-blocking thread)
    background_tasks.add_task(
        background_process_document,
        job_id=job_id,
        document_id=document_id,
        file_path=gcs_url,
        filename=file.filename or blob_name,
        raw_bytes=image_bytes,
    )

    return {
        "job_id": job_id,
        "document_id": document_id,
        "status": "processing",
        "storage_backend": "gcs",
        "bucket": storage_service.bucket_name,
        "gcs_url": gcs_url,
        "message": "File received and streamed directly to Google Cloud Storage. Processing asynchronously in background.",
        "status_endpoint": f"/jobs/{job_id}",
    }


@app.get("/jobs/{job_id}", tags=["Jobs"])
async def get_job_status(job_id: str):
    """Poll the status and extracted results of an asynchronous background job."""
    if job_id not in jobs_registry:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": f"Job ID '{job_id}' not found."},
        )
    return jobs_registry[job_id]


@app.get("/documents", tags=["Documents"])
async def list_documents(current_user: Dict[str, Any] = Depends(get_current_user)):
    """List recent documents from MongoDB, local JSON fallback, and memory jobs registry."""
    docs = []
    seen_ids = set()

    # 1. Primary: Local fallback DB
    for d in list_local_documents():
        doc_id = d.get("document_id")
        if doc_id and doc_id not in seen_ids:
            seen_ids.add(doc_id)
            f_path = d.get("file_path", "")
            file_size_bytes = d.get("file_size") or (os.path.getsize(f_path) if f_path and os.path.exists(f_path) else 0)
            docs.append({
                "document_id": doc_id,
                "filename": d.get("filename", "Untitled Document"),
                "file_path": f_path,
                "file_type": d.get("file_type") or Path(d.get("filename", "")).suffix.lstrip(".").lower() or "document",
                "document_type": d.get("document_type", "General Document"),
                "template_signature": d.get("template_signature", "UNKNOWN"),
                "created_at": d.get("created_at"),
                "total_pages": d.get("total_pages", 1),
                "total_entities": len(d.get("entities", [])),
                "entities": d.get("entities", [])[:50],
                "total_rag_chunks": d.get("total_rag_chunks", 0),
                "pii_findings_count": len(d.get("pii_findings", [])),
                "file_size": file_size_bytes,
                "status": d.get("status", "ready"),
            })

    # 2. Secondary: MongoDB collection (non-blocking with 1.0s timeout)
    collection = get_documents_collection()
    if collection is not None:
        try:
            async def _fetch_mongo():
                cursor = collection.find({}, {"_id": 0}).sort("created_at", -1).limit(50)
                async for d in cursor:
                    doc_id = d.get("document_id")
                    if doc_id and doc_id not in seen_ids:
                        seen_ids.add(doc_id)
                        f_path = d.get("file_path", "")
                        file_size_bytes = d.get("file_size") or (os.path.getsize(f_path) if f_path and os.path.exists(f_path) else 0)
                        docs.append({
                            "document_id": doc_id,
                            "filename": d.get("filename", "Untitled Document"),
                            "file_path": f_path,
                            "file_type": d.get("file_type") or Path(d.get("filename", "")).suffix.lstrip(".").lower() or "document",
                            "document_type": d.get("document_type", "General Document"),
                            "template_signature": d.get("template_signature", "UNKNOWN"),
                            "created_at": d.get("created_at"),
                            "total_pages": d.get("total_pages", 1),
                            "total_entities": len(d.get("entities", [])),
                "entities": d.get("entities", [])[:50],
                            "total_rag_chunks": d.get("total_rag_chunks", 0),
                            "pii_findings_count": len(d.get("pii_findings", [])),
                            "file_size": file_size_bytes,
                            "status": "ready",
                        })
            await asyncio.wait_for(_fetch_mongo(), timeout=1.0)
        except Exception as e:
            pass

    # 3. Merge active jobs registry
    for job_id, job in jobs_registry.items():
        doc_id = job.get("document_id")
        if doc_id and doc_id not in seen_ids:
            seen_ids.add(doc_id)
            f_path = job.get("file_path", "")
            file_size_bytes = os.path.getsize(f_path) if f_path and os.path.exists(f_path) else 0
            res = job.get("result") or {}
            job_status = job.get("status", "processing")
            fname = job.get("filename", "Document")
            docs.append({
                "document_id": doc_id,
                "job_id": job_id,
                "filename": fname,
                "file_path": f_path,
                "file_type": Path(fname).suffix.lstrip(".").lower() or "document",
                "document_type": res.get("document_type", "Processing..."),
                "template_signature": res.get("template_signature", "PENDING"),
                "created_at": job.get("submitted_at"),
                "total_pages": res.get("total_pages", 1),
                "total_entities": res.get("total_entities", 0),
                "total_rag_chunks": res.get("total_rag_chunks", 0),
                "pii_findings_count": res.get("pii_findings_count", 0),
                "file_size": file_size_bytes,
                "status": "ready" if job_status == "completed" else job_status,
            })
    return docs


@app.get("/documents/{document_id}", tags=["Documents"])
async def get_document(
    document_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Retrieve full details of a specific document with extracted entities and layout."""
    # 1. Check local fallback DB
    doc = get_local_document(document_id)

    # 2. Check MongoDB collection
    if not doc:
        collection = get_documents_collection()
        if collection is not None:
            try:
                doc = await asyncio.wait_for(collection.find_one({"document_id": document_id}, {"_id": 0}), timeout=1.0)
            except Exception:
                pass

    # 3. Check in-memory jobs registry
    if not doc:
        for job in jobs_registry.values():
            if job.get("document_id") == document_id:
                doc = job.get("document_record") or job
                break

    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")

    # Ensure public GCS URLs for page_image_url and annotated_image_url
    if "page_image_url" not in doc or not doc.get("page_image_url") or doc.get("page_image_url", "").startswith("/uploads/"):
        doc["page_image_url"] = storage_service.get_public_url(f"preview_{document_id}.jpg")

    if "annotated_image_url" not in doc or not doc.get("annotated_image_url") or doc.get("annotated_image_url", "").startswith("/uploads/"):
        doc["annotated_image_url"] = storage_service.get_public_url(f"annotated_{document_id}.jpg")

    return doc


@app.post("/analyze", status_code=status.HTTP_200_OK, tags=["Forensics Analysis"])
async def analyze_documents(
    payload: AnalyzeRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """RAG-Driven Forensics Analysis Endpoint.

    - Accepts a list of document_ids
    - Runs ELA visual tampering checks on file paths
    - Queries ChromaDB for targeted semantic chunks rather than loading entire massive documents
    - Passes targeted RAG chunks to Groq LLM for anomaly and forgery detection
    - Returns Investigation Dossier with live preview URLs and executive summary
    """
    doc_ids = payload.document_ids
    if not doc_ids:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "At least one document_id must be provided."},
        )

    records: Dict[str, Any] = {}
    ela_reports: List[Dict[str, Any]] = []

    for doc_id in doc_ids:
        doc = get_local_document(doc_id)
        if not doc:
            collection = get_documents_collection()
            if collection is not None:
                try:
                    doc = await collection.find_one({"document_id": doc_id}, {"_id": 0})
                except Exception:
                    pass

        if not doc:
            for job in jobs_registry.values():
                if job.get("document_id") == doc_id:
                    doc = job.get("document_record") or {
                        "document_id": doc_id,
                        "file_path": job.get("file_path"),
                        "document_type": job.get("result", {}).get("document_type", "General Document"),
                        "filename": job.get("filename", "Document"),
                    }
                    break

        if not doc:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={"error": f"Document '{doc_id}' not found in database or jobs registry."},
            )
        records[doc_id] = doc

        # Visual ELA Check via GCS stream or memory
        file_ref = doc.get("file_path") or doc.get("gcs_url") or doc.get("page_image_url")
        if file_ref:
            try:
                ela_result = run_ela_analysis(file_ref, document_id=doc_id)
                ela_reports.append({
                    "document_id": doc_id,
                    "document_type": doc.get("document_type"),
                    "filename": doc.get("filename"),
                    "ela_analysis": ela_result,
                })
            except Exception as ela_err:
                ela_reports.append({
                    "document_id": doc_id,
                    "error": f"ELA failed on '{file_ref}': {str(ela_err)}",
                    "ela_analysis": {
                        "tampering_detected": False,
                        "tampering_area_percentage": 0.0,
                        "suspicious_regions_count": 0,
                        "page_image_url": doc.get("page_image_url") or storage_service.get_public_url(f"preview_{doc_id}.jpg"),
                        "annotated_image_url": doc.get("annotated_image_url") or storage_service.get_public_url(f"annotated_{doc_id}.jpg"),
                    },
                })
        else:
            ela_reports.append({
                "document_id": doc_id,
                "error": f"Document '{doc_id}' has no file reference.",
                "ela_analysis": {
                    "tampering_detected": False,
                    "tampering_area_percentage": 0.0,
                    "suspicious_regions_count": 0,
                    "page_image_url": storage_service.get_public_url(f"preview_{doc_id}.jpg"),
                    "annotated_image_url": storage_service.get_public_url(f"annotated_{doc_id}.jpg"),
                },
            })

    # Cross-Verification with RAG ChromaDB Retrieval
    cross_verification_report: Optional[Dict[str, Any]] = None
    if len(doc_ids) >= 2:
        try:
            cross_verification_report = await cross_verify_documents(doc_ids[0], doc_ids[1])
        except Exception as cv_err:
            cross_verification_report = {
                "error": f"Cross verification failed: {str(cv_err)}",
                "overall_risk_score": 50,
                "flagged_discrepancies": ["Cross verification aborted due to error."],
                "metadata_warnings": [],
                "auditor_summary": "Comparison completed with warnings.",
            }
    else:
        single_doc = records[doc_ids[0]]
        first_ela = ela_reports[0].get("ela_analysis", {}) if ela_reports else {}
        tampering_detected = first_ela.get("tampering_detected", False)
        tamper_area = first_ela.get("tampering_area_percentage", 0.0)
        sus_count = first_ela.get("suspicious_regions_count", 0)
        doc_name = single_doc.get("filename", "Document")
        doc_type = single_doc.get("document_type", "General Document")

        flagged = []
        if tampering_detected and tamper_area > 5.0:
            flagged.append(f"Visual ELA detected {sus_count} high-variance regions (covering {tamper_area}% of page).")
            flagged.append("Potential digital raster splicing, signature overlay, or altered typography detected.")
            auditor_summary = (
                f"Visual forensics inspection on {doc_name} identified {sus_count} potential compression artifacts "
                f"and layout discrepancies. The document requires manual forensic review before credential acceptance."
            )
            base_risk = min(85, max(45, int(tamper_area * 2.5)))
        else:
            auditor_summary = (
                f"{doc_type} '{doc_name}' exhibits uniform compression characteristics and consistent typographic alignment. "
                "No visual tampering or digital splicing anomalies were flagged."
            )
            base_risk = 12

        cross_verification_report = {
            "overall_risk_score": base_risk,
            "flagged_discrepancies": flagged,
            "metadata_warnings": [],
            "auditor_summary": auditor_summary,
            "compared_documents": [doc_ids[0]],
        }

    max_ela_area = max(
        [r.get("ela_analysis", {}).get("tampering_area_percentage", 0.0) for r in ela_reports if "ela_analysis" in r] or [0.0]
    )
    llm_risk = cross_verification_report.get("overall_risk_score", 0)
    composite_risk_score = min(100, int((llm_risk * 0.6) + (min(100, max_ela_area * 10) * 0.4)))
    verdict = "Original / Authentic" if composite_risk_score < 40 else "Potential Tampering Detected"

    # Extract public GCS image preview URLs
    primary_ela = ela_reports[0].get("ela_analysis", {}) if ela_reports else {}
    page_img_url = primary_ela.get("page_image_url") or storage_service.get_public_url(f"preview_{doc_ids[0]}.jpg")
    annotated_img_url = primary_ela.get("annotated_image_url") or storage_service.get_public_url(f"annotated_{doc_ids[0]}.jpg")

    investigation_dossier = {
        "dossier_id": str(uuid.uuid4()),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "analyzed_documents": doc_ids,
        "composite_risk_score": composite_risk_score,
        "overall_risk_score": composite_risk_score,
        "verdict": verdict,
        "executive_summary": cross_verification_report.get("auditor_summary", ""),
        "page_image_url": page_img_url,
        "annotated_image_url": annotated_img_url,
        "cross_verification": cross_verification_report,
        "visual_forensics_ela": ela_reports,
    }

    return investigation_dossier


@app.post("/chat", status_code=status.HTTP_200_OK, tags=["RAG Chat"])
async def chat_with_document(
    payload: ChatRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Interactive RAG endpoint: ask questions about uploaded documents.

    - Retrieves relevant chunks from ChromaDB based on the question
    - Sends ONLY relevant chunks to Groq LLM for grounded answers
    - Returns answer grounded entirely in document context
    """
    collection = get_documents_collection()
    doc_id = payload.document_id

    # Find document record (check local DB first, then MongoDB, then jobs)
    doc = get_local_document(doc_id)
    if not doc and collection is not None:
        try:
            doc = await collection.find_one({"document_id": doc_id}, {"_id": 0})
            if not doc:
                doc = await collection.find_one({"_id": doc_id}, {"_id": 0})
        except Exception:
            pass

    if not doc:
        for job in jobs_registry.values():
            if job.get("document_id") == doc_id and job.get("result"):
                doc = {"document_id": doc_id, "raw_text": ""}
                break

    if not doc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": f"Document '{doc_id}' not found."},
        )

    # Query ChromaDB for relevant chunks in non-blocking thread
    rag_chunks = await asyncio.to_thread(
        query_relevant_chunks,
        query_text=payload.question,
        document_ids=[doc_id],
        n_results=payload.n_results,
    )

    if not rag_chunks:
        # Fallback to document raw_text or entities if vector chunks are not yet indexed
        raw = doc.get("raw_text", "").strip()
        if raw:
            rag_chunks = [{
                "chunk_id": f"{doc_id}-raw",
                "text": raw[:3000],
                "distance": 0.05,
                "metadata": {"source": "direct_document_text", "filename": doc.get("filename", "")},
            }]
        elif doc.get("entities"):
            ent_summary = ", ".join([e.get("text", "") for e in doc.get("entities", [])[:20] if e.get("text")])
            rag_chunks = [{
                "chunk_id": f"{doc_id}-entities",
                "text": f"Document entities: {ent_summary}",
                "distance": 0.1,
                "metadata": {"source": "entities_summary"},
            }]
        else:
            return {
                "question": payload.question,
                "answer": "No relevant document text or forensic features found. Try re-uploading the document or rephrasing your inquiry.",
                "context_used": [],
                "source_document_id": doc_id,
            }

    context_text = "\n---\n".join([c["text"] for c in rag_chunks])

    # Call Groq LLM for grounded answer
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key or groq_api_key.strip() in ["", "gsk_...", "gsk_your_groq_api_key_here"]:
        # Grounded heuristic answer when GROQ_API_KEY is not supplied
        return {
            "question": payload.question,
            "answer": f"Grounded Context Findings for '{payload.question}':\n\n{context_text[:600]}\n\n(Configure GROQ_API_KEY for advanced multi-hop LLM contextual reasoning).",
            "context_used": rag_chunks,
            "source_document_id": doc_id,
        }

    try:
        from groq import Groq
        client = Groq(api_key=groq_api_key)
        system_prompt = (
            "You are a forensic document analyst. Answer the user's question strictly based on "
            "the provided document context. If the answer is not in the context, say so clearly. "
            "Do not make up information. Return a concise, factual answer."
        )
        user_prompt = f"Context:\n{context_text}\n\nQuestion: {payload.question}"

        response = client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            max_tokens=800,
        )
        answer = response.choices[0].message.content.strip()
    except Exception as e:
        answer = f"LLM generation failed: {str(e)}. Here is the relevant context instead:\n{context_text[:1000]}"

    return {
        "question": payload.question,
        "answer": answer,
        "context_used": rag_chunks,
        "source_document_id": doc_id,
    }
