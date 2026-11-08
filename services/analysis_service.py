import os
import json
import re
from typing import Any, Dict, List, Optional
from pathlib import Path
import cv2
import numpy as np
from dotenv import load_dotenv
from groq import Groq

from database.connection import get_documents_collection
from services.rag_service import query_relevant_chunks

load_dotenv()


def run_ela_analysis(file_path: str, quality: int = 90, threshold: float = 38.0, document_id: Optional[str] = None) -> Dict[str, Any]:
    """1. Visual Forensics: Error Level Analysis (ELA)

    - Supports both PDF pages (rendered via PyMuPDF) and raw images.
    - Compresses copy to temporary JPEG buffer at given quality (default 90%)
    - Calculates absolute difference between original and recompressed image
    - Scales difference and finds high variance / tampering regions
    - Saves clean page image and OpenCV annotated overlay image for frontend preview
    - Returns suspicious bounding boxes [x, y, w, h], tampering ratio, and image URLs
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found for ELA analysis: {file_path}")

    # Generate or sanitize document_id for file saving
    if not document_id:
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        # Extract leading UUID if present
        parts = base_name.split("_", 1)
        document_id = parts[0] if len(parts) > 1 and len(parts[0]) >= 32 else base_name

    uploads_dir = Path("uploads")
    uploads_dir.mkdir(parents=True, exist_ok=True)

    # 1. Load image (render first page if PDF)
    if file_path.lower().endswith(".pdf"):
        import fitz
        doc = fitz.open(file_path)
        if len(doc) == 0:
            raise ValueError(f"PDF document is empty: {file_path}")
        page = doc.load_page(0)
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("png")
        nparr = np.frombuffer(img_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        doc.close()
    else:
        image = cv2.imread(file_path)

    if image is None:
        raise ValueError(f"Could not load image at path: {file_path}")

    h, w = image.shape[:2]

    # Save clean page 1 image
    page_img_path = uploads_dir / f"{document_id}_page_1.png"
    cv2.imwrite(str(page_img_path), image)

    # 2. Recompress in memory at specified JPEG quality
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
    _, compressed_buf = cv2.imencode(".jpg", image, encode_param)
    compressed_image = cv2.imdecode(compressed_buf, cv2.IMREAD_COLOR)

    # Absolute difference between original and recompressed
    diff = cv2.absdiff(image, compressed_image)
    diff_gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)

    # Scale the difference to accentuate high-frequency artifact differences
    scale_multiplier = 15
    diff_scaled = np.clip(diff_gray.astype(np.float32) * scale_multiplier, 0, 255).astype(np.uint8)

    # Threshold to find areas with anomalously high reconstruction error
    _, thresh = cv2.threshold(diff_scaled, int(threshold), 255, cv2.THRESH_BINARY)

    # Morphological dilation to connect nearby noisy pixels into cohesive suspect regions
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    dilated = cv2.dilate(thresh, kernel, iterations=2)

    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Track union area to avoid double-counting overlapping contours from dilation
    combined_mask = np.zeros_like(thresh, dtype=np.uint8)
    suspicious_regions: List[Dict[str, Any]] = []
    total_suspicious_area = 0

    for cnt in contours:
        area = cv2.contourArea(cnt)
        bx, by, bw, bh = cv2.boundingRect(cnt)
        if area > 120 and (bw > 10 and bh > 10):
            cv2.drawContours(combined_mask, [cnt], -1, 255, thickness=cv2.FILLED)
            roi = diff_scaled[by:by + bh, bx:bx + bw]
            variance = float(np.var(roi)) if roi.size > 0 else 0.0
            mean_intensity = float(np.mean(roi)) if roi.size > 0 else 0.0
            total_suspicious_area += bw * bh
            suspicious_regions.append({
                "bounding_box": [int(bx), int(by), int(bw), int(bh)],
                "area": int(area),
                "error_intensity": round(mean_intensity, 2),
                "variance": round(variance, 2),
            })

    # Re-calculate tampering ratio using the actual union mask to prevent >100%
    actual_suspicious_pixels = int(cv2.countNonZero(combined_mask))
    tampering_ratio = round((actual_suspicious_pixels / float(w * h)) * 100, 2)
    # Sort from highest variance/severity to lowest
    suspicious_regions.sort(key=lambda r: r["variance"], reverse=True)

    has_tampering = len(suspicious_regions) > 0 and tampering_ratio > 0.05

    # 3. Create visual annotated overlay image
    annotated = image.copy()
    if has_tampering:
        for idx, reg in enumerate(suspicious_regions[:12]):
            bx, by, bw, bh = reg["bounding_box"]
            # Red bounding box with high contrast
            cv2.rectangle(annotated, (bx, by), (bx + bw, by + bh), (0, 30, 230), 2)
            label = f"ELA #{idx+1} (Var {int(reg['variance'])})"
            cv2.rectangle(annotated, (bx, max(0, by - 20)), (bx + len(label) * 8 + 10, by), (0, 30, 230), cv2.FILLED)
            cv2.putText(
                annotated,
                label,
                (bx + 4, max(14, by - 5)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.38,
                (255, 255, 255),
                1,
                cv2.LINE_AA,
            )
    else:
        # Subtle green verification stamp at top right
        stamp_text = "INTEGRITY VERIFIED - NO ELA ANOMALIES"
        cv2.putText(
            annotated,
            stamp_text,
            (max(20, w - 460), 36),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (0, 160, 40),
            2,
            cv2.LINE_AA,
        )

    ela_img_path = uploads_dir / f"{document_id}_ela.png"
    cv2.imwrite(str(ela_img_path), annotated)

    return {
        "file_path": file_path,
        "image_dimensions": [w, h],
        "tampering_detected": has_tampering,
        "tampering_area_percentage": tampering_ratio,
        "suspicious_regions_count": len(suspicious_regions),
        "suspicious_regions": suspicious_regions[:25],
        "page_image_url": f"/uploads/{document_id}_page_1.png",
        "annotated_image_url": f"/uploads/{document_id}_ela.png",
    }


async def cross_verify_documents(doc_id_1: str, doc_id_2: str) -> Dict[str, Any]:
    """2. Contextual Intelligence: Forensic Cross-Verification using Groq API

    - Fetches full JSON records for doc_id_1 and doc_id_2 from MongoDB
    - Calls Groq LLM (llama3-70b-8192) to act as a forensic auditor
    - Validates consistency (names, dates, amounts, logical contradictions)
    - Examines metadata variations (e.g. font-size changes mid-sentence, inconsistent alignment)
    - Returns structured JSON: overall_risk_score, flagged_discrepancies, metadata_warnings
    """
    collection = get_documents_collection()
    if collection is None:
        raise RuntimeError("Database connection is not initialized.")

    doc1 = await collection.find_one({"document_id": doc_id_1}, {"_id": 0})
    if not doc1:
        # Fallback query if stored under MongoDB ObjectId string
        doc1 = await collection.find_one({"_id": doc_id_1}, {"_id": 0})
    doc2 = await collection.find_one({"document_id": doc_id_2}, {"_id": 0})
    if not doc2:
        doc2 = await collection.find_one({"_id": doc_id_2}, {"_id": 0})

    if not doc1:
        raise ValueError(f"Document record with id '{doc_id_1}' was not found in database.")
    if not doc2:
        raise ValueError(f"Document record with id '{doc_id_2}' was not found in database.")

    # RAG Intelligence: Query ChromaDB for targeted cross-document forensic chunks
    rag_chunks_1 = query_relevant_chunks(
        query_text="financial amounts dates identity names verification summary",
        document_ids=[doc_id_1],
        n_results=4,
    )
    rag_chunks_2 = query_relevant_chunks(
        query_text="financial amounts dates identity names verification summary",
        document_ids=[doc_id_2],
        n_results=4,
    )

    rag_text_1 = "\n---\n".join([c["text"] for c in rag_chunks_1]) if rag_chunks_1 else doc1.get("raw_text", "")[:750]
    rag_text_2 = "\n---\n".join([c["text"] for c in rag_chunks_2]) if rag_chunks_2 else doc2.get("raw_text", "")[:750]

    # Prepare compact forensic summary payloads powered by targeted RAG excerpts
    def prepare_summary(doc: Dict[str, Any], rag_excerpt: str) -> Dict[str, Any]:
        return {
            "document_id": doc.get("document_id"),
            "document_type": doc.get("document_type"),
            "rag_retrieved_excerpts": rag_excerpt,
            "template_signature": doc.get("template_signature"),
            "entities_sample": [
                {
                    "text": e.get("text"),
                    "font_size": e.get("font_size"),
                    "text_type": e.get("text_type"),
                    "alignment": e.get("alignment"),
                    "pixel_intensity": e.get("pixel_intensity"),
                    "confidence": e.get("confidence"),
                }
                for e in doc.get("entities", [])[:15]
            ],
        }

    summary1 = prepare_summary(doc1, rag_text_1)
    summary2 = prepare_summary(doc2, rag_text_2)

    # Check for metadata anomalies locally before calling LLM
    local_metadata_warnings: List[str] = []
    for d_idx, doc in enumerate([doc1, doc2], 1):
        entities = doc.get("entities", [])
        font_sizes = [e.get("font_size", 0) for e in entities if e.get("font_size")]
        if font_sizes:
            std_dev = float(np.std(font_sizes))
            if std_dev > 45.0:
                local_metadata_warnings.append(
                    f"Document {d_idx} ({doc.get('document_id')}) exhibits erratic font size variance (std_dev: {std_dev:.1f}px) across consecutive text elements."
                )

    groq_api_key = os.getenv("GROQ_API_KEY")

    if not groq_api_key or groq_api_key.strip() in ["", "gsk_..."]:
        # Fallback forensic auditor if Groq API key is not yet set by the user
        flagged = []
        if doc1.get("document_type") != doc2.get("document_type"):
            flagged.append(f"Mismatched document types: '{doc1.get('document_type')}' vs '{doc2.get('document_type')}'.")
        if doc1.get("template_signature") != doc2.get("template_signature"):
            flagged.append("Document template signatures differ: Layout structures do not match the same master template.")
        else:
            flagged.append("Template signatures match: Documents originate from identical structural templates.")

        local_metadata_warnings.append("Notice: GROQ_API_KEY is not yet configured. Simulated rule-based forensic analysis returned.")
        risk_score = 45 if len(flagged) > 1 else 15

        return {
            "overall_risk_score": risk_score,
            "flagged_discrepancies": flagged,
            "metadata_warnings": local_metadata_warnings,
            "auditor_summary": "Preliminary heuristic audit complete. Add your GROQ_API_KEY to .env for full Llama3-70b contextual forensic reasoning.",
            "compared_documents": [doc_id_1, doc_id_2],
        }

    # Call Groq LLM (llama3-70b-8192)
    client = Groq(api_key=groq_api_key)

    system_prompt = (
        "You are an elite forensic document auditor and forgery detection specialist.\n"
        "Your task is to thoroughly cross-examine two document records.\n"
        "1. Check for logical consistencies or contradictions (do names, dates, amounts, account details match or conflict?).\n"
        "2. Evaluate if extracted metadata (such as sudden font-size changes mid-sentence, anomalous alignments, or mismatched pixel intensities) suggests copy-paste tampering or font forgery.\n"
        "3. You MUST respond with a valid JSON object ONLY, adhering strictly to this schema:\n"
        "{\n"
        '  "overall_risk_score": <integer from 0 to 100>,\n'
        '  "flagged_discrepancies": [<list of specific contradiction strings>],\n'
        '  "metadata_warnings": [<list of specific metadata tampering warning strings>],\n'
        '  "auditor_summary": "<concise analytical paragraph>"\n'
        "}\n"
        "Do NOT include markdown formatting or backticks around the JSON."
    )

    user_prompt = (
        f"DOCUMENT 1 DATA:\n{json.dumps(summary1, indent=2)}\n\n"
        f"DOCUMENT 2 DATA:\n{json.dumps(summary2, indent=2)}"
    )

    try:
        response = client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            max_tokens=1500,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content.strip()
        parsed = json.loads(content)

        # Merge local metadata warnings if any
        if local_metadata_warnings:
            existing_warns = parsed.get("metadata_warnings", [])
            for w in local_metadata_warnings:
                if w not in existing_warns:
                    existing_warns.append(w)
            parsed["metadata_warnings"] = existing_warns

        parsed["compared_documents"] = [doc_id_1, doc_id_2]
        return parsed

    except Exception as e:
        # Graceful fallback on LLM error
        return {
            "overall_risk_score": 50,
            "flagged_discrepancies": [f"Groq API evaluation encountered an issue: {str(e)}"],
            "metadata_warnings": local_metadata_warnings,
            "auditor_summary": "LLM call failed; fallback heuristic audit provided.",
            "compared_documents": [doc_id_1, doc_id_2],
        }

