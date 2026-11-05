import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, File, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from database.connection import (
    connect_to_mongo,
    close_mongo_connection,
    get_documents_collection,
)
from services.extraction_service import (
    extract_document_features,
    classify_document,
    generate_layout_fingerprint,
)

# Ensure uploads directory exists
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Document Forensics API",
    description="Backend API for document forensics, OCR extraction, and forgery detection.",
    version="1.0.0",
)

@app.on_event("startup")
async def startup_db_client():
    try:
        await connect_to_mongo()
        print("Connected to MongoDB successfully.")
    except Exception as e:
        print(f"Error connecting to MongoDB: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongo_connection()
    print("Closed MongoDB connection.")

class DummyDocument(BaseModel):
    title: str = Field(default="Test Forensic Document")
    file_type: str = Field(default="pdf")
    status: str = Field(default="pending_analysis")
    notes: Optional[str] = Field(default="Dummy document inserted for testing connection.")

@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "Document Forensics API is online",
        "docs": "/docs",
    }

@app.get("/health", tags=["Health"])
async def health_check():
    collection = get_documents_collection()
    db_status = "unconfigured"
    
    if collection is not None:
        try:
            await collection.database.client.admin.command("ping")
            db_status = "connected"
        except Exception as e:
            db_status = f"disconnected ({str(e)})"

    is_healthy = db_status == "connected"
    response_payload = {
        "status": "healthy" if is_healthy else "degraded",
        "services": {
            "api": "up",
            "database": db_status,
        },
    }

    status_code = status.HTTP_200_OK if is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=status_code, content=response_payload)

@app.post("/test-db", status_code=status.HTTP_201_CREATED, tags=["Database"])
async def test_db_insert(payload: Optional[DummyDocument] = None):
    collection = get_documents_collection()
    if collection is None:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"error": "Database connection is not initialized."},
        )

    doc_data = payload.dict() if payload else {
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

@app.post("/extract", status_code=status.HTTP_201_CREATED, tags=["Extraction"])
async def extract_document(file: UploadFile = File(...)):
    """Processes an uploaded document with deep metadata extraction & layout fingerprinting:

    - Saves original image into local /uploads directory with a unique path
    - Extracts deep line metadata: font_size, text_type, alignment, vertical_spacing, pixel_intensity
    - Detects non-text structural symbols (Signature, Logo, Stamp) using OpenCV contour shape analysis
    - Generates resolution-invariant layout_fingerprint and hashed template_signature
    - Compares template_signature against previously stored documents to flag matched_template: true/false
    - Stores the record into MongoDB forensics_db.documents and returns the formatted response.
    """
    collection = get_documents_collection()
    if collection is None:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"error": "Database connection is not initialized."},
        )

    # 1. Read uploaded file bytes
    try:
        image_bytes = await file.read()
        if not image_bytes:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"error": "Uploaded file is empty."},
            )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": f"Failed to read file: {str(e)}"},
        )

    # 2. Save original image to /uploads directory
    unique_id = str(uuid.uuid4())
    original_extension = Path(file.filename).suffix if file.filename else ".jpg"
    if not original_extension:
        original_extension = ".jpg"
    saved_filename = f"{unique_id}_{Path(file.filename).stem}{original_extension}" if file.filename else f"{unique_id}.jpg"
    file_path = str(UPLOADS_DIR / saved_filename)

    try:
        with open(file_path, "wb") as f_out:
            f_out.write(image_bytes)
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"Failed to save image to disk: {str(e)}"},
        )

    # 3. Robust Computer Vision & Deep Metadata Extraction
    try:
        ocr_result = extract_document_features(image_bytes)
    except ValueError as ve:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": str(ve)},
        )
    except Exception as ex:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"OCR extraction failed: {str(ex)}"},
        )

    raw_text = ocr_result["raw_text"]
    entities = ocr_result["entities"]
    image_size = ocr_result["image_size"]

    # 4. Document Classification
    document_type = classify_document(raw_text)

    # 5. Phase 2: Layout Fingerprinting & Template Matching
    layout_data = generate_layout_fingerprint(entities, image_size)
    template_sig = layout_data["template_signature"]

    # Check MongoDB for previously saved documents with the same template_signature
    matched_template = False
    matched_document_id = None
    try:
        existing_doc = await collection.find_one(
            {"template_signature": template_sig},
            projection={"document_id": 1, "document_type": 1}
        )
        if existing_doc:
            matched_template = True
            matched_document_id = existing_doc.get("document_id")
    except Exception as e:
        print(f"Warning: Template match query failed: {e}")

    # 6. MongoDB Schema Assembly
    mongo_document = {
        "document_id": unique_id,
        "file_path": file_path,
        "document_type": document_type,
        "raw_text": raw_text,
        "entities": entities,
        "layout_fingerprint": layout_data["normalized_layout"],
        "template_signature": template_sig,
        "matched_template": matched_template,
        "matched_document_id": matched_document_id,
        "image_size": image_size,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        insert_result = await collection.insert_one(mongo_document)
        mongo_document["_id"] = str(insert_result.inserted_id)
        return mongo_document
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"Failed to save extraction to MongoDB: {str(e)}"},
        )
