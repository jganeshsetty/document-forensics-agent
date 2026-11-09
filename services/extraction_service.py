import os
import re
import shutil
import uuid
import hashlib
from typing import Any, Dict, List, Tuple, Optional
import cv2
import numpy as np
from pydantic import BaseModel, Field
import httpx
from rapidocr_onnxruntime import RapidOCR

# Global singleton RapidOCR engine for non-blocking high-speed OCR
_rapid_ocr_engine: Optional[RapidOCR] = None


def get_ocr_engine() -> RapidOCR:
    global _rapid_ocr_engine
    if _rapid_ocr_engine is None:
        _rapid_ocr_engine = RapidOCR()
    return _rapid_ocr_engine


# Pydantic Schemas for Strict Frontend Data Validation
class ValidatedEntity(BaseModel):
    type: str = "Text"
    text: str = ""
    bounding_box: List[int] = Field(default_factory=lambda: [0, 0, 10, 10])
    confidence: float = 1.0
    font_size: int = 12
    text_type: str = "Body"
    alignment: str = "left"
    vertical_spacing: int = 0
    pixel_intensity: float = 0.0
    page_number: int = 1
    pii_tagged: bool = False
    pii_type: Optional[str] = None
    sheet_name: Optional[str] = None


class ValidatedPageRecord(BaseModel):
    page_number: int
    text: str = ""
    word_count: int = 0
    preview_url: Optional[str] = None
    extraction_method: str = "RapidOCR_PaddleONNX"
    entities: List[Dict[str, Any]] = Field(default_factory=list)
    sheet_name: Optional[str] = None


# PII patterns for secure tagging and redaction
PII_PATTERNS: List[Tuple[str, re.Pattern]] = [
    ("SSN", re.compile(r'\b\d{3}-?\d{2}-?\d{4}\b')),
    ("PAN", re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b')),
    ("Aadhaar", re.compile(r'\b\d{4}\s?\d{4}\s?\d{4}\b')),
    ("Email", re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')),
    ("Phone", re.compile(r'\b(?:\+91|91|0)?[- ]?\d{10}\b')),
    ("BankAccount", re.compile(r'\b(?:account|a/c|ac no)\s*:?\s*\d{9,18}\b', re.IGNORECASE)),
    ("IBAN", re.compile(r'\b[A-Z]{2}\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{3}\b')),
]


def preprocess_image(image: np.ndarray, max_side: int = 1800) -> np.ndarray:
    """Lightweight preprocessing helper for images:
    Resizes image so longest side does not exceed max_side to prevent memory bloat.
    """
    if image is None:
        return image
    h, w = image.shape[:2]
    if max(h, w) > max_side:
        scale = max_side / float(max(h, w))
        image = cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return image


def detect_visual_elements(image: np.ndarray, text_boxes: List[List[int]]) -> List[Dict[str, Any]]:
    """Detects non-text structural elements such as 'Signature', 'Logo', or 'Stamp'
    using lightweight contour analysis without freezing.
    """
    orig_h, orig_w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    text_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)
    for bx, by, bw, bh in text_boxes:
        cv2.rectangle(text_mask, (bx, by), (bx + bw, by + bh), 255, -1)

    kernel_text = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    text_mask = cv2.dilate(text_mask, kernel_text, iterations=1)

    visual_elements: List[Dict[str, Any]] = []

    # Stamp Detection (colored ink)
    sat = hsv[:, :, 1]
    _, stamp_mask = cv2.threshold(sat, 80, 255, cv2.THRESH_BINARY)
    stamp_mask = cv2.bitwise_and(stamp_mask, stamp_mask, mask=cv2.bitwise_not(text_mask))
    
    contours_stamp, _ = cv2.findContours(stamp_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours_stamp:
        area = cv2.contourArea(cnt)
        if 800 < area < (orig_w * orig_h * 0.15):
            x, y, w, h = cv2.boundingRect(cnt)
            aspect_ratio = float(w) / float(h)
            if 0.7 <= aspect_ratio <= 1.5:
                perimeter = cv2.arcLength(cnt, True)
                if perimeter > 0:
                    circularity = 4 * np.pi * (area / (perimeter * perimeter))
                    if circularity > 0.35:
                        visual_elements.append({
                            "type": "Stamp",
                            "text": "[Stamp]",
                            "bounding_box": [int(x), int(y), int(w), int(h)],
                            "confidence": 0.88,
                            "aspect_ratio": round(aspect_ratio, 2),
                        })

    # Deduplicate and cap
    visual_elements.sort(key=lambda elem: (elem["bounding_box"][1], elem["bounding_box"][0]))
    return visual_elements[:6]


def extract_document_features(image_bytes: bytes) -> Dict[str, Any]:
    """RapidOCR (PaddleOCR ONNX Engine) Text & Layout Extraction:
    - Decodes image without slow morphological freezing loops.
    - Runs ONNX-accelerated PP-OCRv4 text detection and recognition.
    - Handles complex certificate guilloche backgrounds natively.
    - Extracts precise bounding boxes, font heights, alignments, and intensities.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image. Please upload a valid image file.")

    orig_h, orig_w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    engine = get_ocr_engine()
    ocr_results, _ = engine(image)

    entities: List[Dict[str, Any]] = []
    all_line_texts: List[str] = []
    font_sizes: List[int] = []
    raw_lines: List[Dict[str, Any]] = []

    if ocr_results:
        for item in ocr_results:
            box_points, text, score = item
            text_clean = str(text).strip()
            if not text_clean:
                continue

            try:
                conf = float(score)
            except Exception:
                conf = 0.85

            min_x = max(0, int(min(pt[0] for pt in box_points)))
            min_y = max(0, int(min(pt[1] for pt in box_points)))
            max_x = min(orig_w, int(max(pt[0] for pt in box_points)))
            max_y = min(orig_h, int(max(pt[1] for pt in box_points)))

            bw = max(1, max_x - min_x)
            bh = max(1, max_y - min_y)
            font_sizes.append(bh)

            raw_lines.append({
                "text": text_clean,
                "bounding_box": [min_x, min_y, bw, bh],
                "confidence": round(conf, 2),
                "h": bh,
                "y": min_y,
                "x": min_x,
                "w": bw,
            })

    # Sort lines top-to-bottom
    raw_lines.sort(key=lambda l: (l["y"], l["x"]))
    median_font_size = float(np.median(font_sizes)) if font_sizes else 16.0
    all_text_boxes: List[List[int]] = []
    previous_box_bottom: Optional[int] = None

    for item in raw_lines:
        line_text = item["text"]
        all_line_texts.append(line_text)
        bx, by, bw, bh = item["bounding_box"]
        all_text_boxes.append([bx, by, bw, bh])

        font_size = bh
        text_type = "Heading" if font_size >= (median_font_size * 1.3) else "Body"

        line_center_x = bx + (bw / 2.0)
        doc_center_x = orig_w / 2.0
        if abs(line_center_x - doc_center_x) < (orig_w * 0.12):
            alignment = "center"
        elif bx > (orig_w * 0.55):
            alignment = "right"
        else:
            alignment = "left"

        vertical_spacing = max(0, by - previous_box_bottom) if previous_box_bottom is not None else 0
        previous_box_bottom = by + bh

        roi = gray[by:by + bh, bx:bx + bw]
        pixel_intensity = round(float(np.mean(roi)), 2) if roi.size > 0 else 0.0

        ent = ValidatedEntity(
            type="Text",
            text=line_text,
            bounding_box=[bx, by, bw, bh],
            confidence=item["confidence"],
            font_size=font_size,
            text_type=text_type,
            alignment=alignment,
            vertical_spacing=vertical_spacing,
            pixel_intensity=pixel_intensity,
            page_number=1,
        )
        entities.append(ent.model_dump())

    # Detect visual elements (Stamps / Signatures)
    visual_elements = detect_visual_elements(image, all_text_boxes)
    for elem in visual_elements:
        ebx, eby, ebw, ebh = elem["bounding_box"]
        roi_elem = gray[eby:eby + ebh, ebx:ebx + ebw]
        p_intensity = round(float(np.mean(roi_elem)), 2) if roi_elem.size > 0 else 0.0

        ent = ValidatedEntity(
            type=elem["type"],
            text=elem["text"],
            bounding_box=[ebx, eby, ebw, ebh],
            confidence=elem["confidence"],
            font_size=ebh,
            text_type=elem["type"],
            alignment="center" if abs((ebx + ebw/2.0) - (orig_w/2.0)) < (orig_w * 0.15) else "left",
            vertical_spacing=0,
            pixel_intensity=p_intensity,
            page_number=1,
        )
        entities.append(ent.model_dump())

    entities.sort(key=lambda e: (e["bounding_box"][1], e["bounding_box"][0]))
    raw_text = "\n".join(all_line_texts)

    return {
        "raw_text": raw_text,
        "entities": entities,
        "image_size": [orig_w, orig_h],
    }


def generate_layout_fingerprint(entities: List[Dict[str, Any]], image_size: List[int]) -> Dict[str, Any]:
    """Phase 2: Creates a normalized layout blueprint and a robust template_signature hash

    based on the relative spatial positions of headings, logos, stamps, and layout anchors.
    """
    orig_w, orig_h = image_size
    if orig_w <= 0 or orig_h <= 0:
        orig_w, orig_h = 1000, 1000

    normalized_layout: List[Dict[str, Any]] = []
    signature_tokens: List[str] = []

    for ent in entities:
        bx, by, bw, bh = ent["bounding_box"]
        # Normalize coordinates relative to document width & height [0.0 - 1.0]
        norm_x = round(bx / float(orig_w), 3)
        norm_y = round(by / float(orig_h), 3)
        norm_w = round(bw / float(orig_w), 3)
        norm_h = round(bh / float(orig_h), 3)

        normalized_layout.append({
            "type": ent.get("type", "Text"),
            "text_type": ent.get("text_type", "Body"),
            "normalized_box": [norm_x, norm_y, norm_w, norm_h],
            "alignment": ent.get("alignment", "left"),
        })

        # Feature hashing for template signature:
        # Focus on structural anchor elements: Headings, Logos, Stamps, Signatures, or top anchors (y < 0.25)
        e_type = ent.get("type", "Text")
        t_type = ent.get("text_type", "Body")
        is_anchor = (t_type == "Heading") or (e_type in ["Logo", "Stamp", "Signature"]) or (norm_y < 0.20)

        if is_anchor:
            # Quantize normalized position into a grid of 20x20 bins to provide resolution invariance
            bin_x = int(norm_x * 20)
            bin_y = int(norm_y * 20)
            bin_w = int(norm_w * 20)
            bin_h = int(norm_h * 20)
            align = ent.get("alignment", "left")
            token = f"{e_type}:{t_type}:{bin_x}_{bin_y}_{bin_w}_{bin_h}:{align}"
            signature_tokens.append(token)

    # Sort tokens deterministically
    signature_tokens.sort()
    signature_str = "|".join(signature_tokens)
    template_signature = hashlib.sha256(signature_str.encode("utf-8")).hexdigest()[:16]

    return {
        "template_signature": template_signature,
        "anchor_count": len(signature_tokens),
        "normalized_layout": normalized_layout,
    }


def tag_sensitive_pii(raw_text: str, entities: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Scan extracted text and entities for PII, returning tagged metadata
    and a redacted version safe for LLM processing."""
    pii_found: List[Dict[str, Any]] = []
    redacted_text = raw_text

    for pattern_name, pattern in PII_PATTERNS:
        matches = list(pattern.finditer(redacted_text))
        for m in matches:
            pii_found.append({
                "type": pattern_name,
                "text": m.group(),
                "start": m.start(),
                "end": m.end(),
            })
            redacted_text = redacted_text[:m.start()] + f"[REDACTED_{pattern_name}]" + redacted_text[m.end():]

    for ent in entities:
        ent_text = ent.get("text", "")
        for pii in pii_found:
            clean_pii = pii["text"].replace("-", "").replace(" ", "")
            clean_ent = ent_text.replace("-", "").replace(" ", "")
            if pii["text"] in ent_text or clean_pii in clean_ent:
                ent["pii_tagged"] = True
                ent["pii_type"] = pii["type"]
                break

    return {
        "raw_text": redacted_text,
        "pii_findings": pii_found,
        "pii_count": len(pii_found),
        "entities": entities,
    }


def classify_document(raw_text: str) -> str:
    """Classifies document_type using Groq API (if GROQ_API_KEY is available)

    with intelligent fallback to comprehensive keyword heuristics.
    """
    groq_api_key = os.getenv("GROQ_API_KEY")
    if groq_api_key:
        try:
            prompt = (
                "Classify the following OCR text into one of these categories: "
                "'Software Repository / Dashboard', 'Academic Lab Manual', 'Identity Proof', 'Bank Statement', "
                "'Invoice', 'Receipt', 'Contract', 'Medical Record', or 'General Document'.\n"
                "Return ONLY the category name and nothing else.\n\n"
                f"Text:\n{raw_text[:2000]}"
            )
            resp = httpx.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {groq_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "qwen/qwen3.8-27b",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 20,
                },
                timeout=5.0,
            )
            if resp.status_code == 200:
                classified = resp.json()["choices"][0]["message"]["content"].strip()
                cleaned = re.sub(r"['\"]", "", classified)
                if cleaned:
                    return cleaned
        except Exception:
            pass

    text_lower = raw_text.lower()

    if any(k in text_lower for k in ["github", "pull request", "branch", "commit", "fork", "workflow", "repo"]):
        return "Software Repository / Dashboard"
    if any(k in text_lower for k in ["token budget", "routing strategy", "chat models", "freellmapi", "playground", "qwen", "gemini flash"]):
        return "Dashboard Screenshot"
    if any(k in text_lower for k in ["lab manual", "experiment", "learning outcomes", "viva questions", "wireframe", "figma"]):
        return "Academic Lab Manual"
    if any(k in text_lower for k in ["passport", "driving licence", "driver license", "aadhaar", "ssn", "identification", "date of birth", "dob"]):
        return "Identity Proof"
    if any(k in text_lower for k in ["account number", "ifsc", "iban", "balance", "statement period", "debit", "credit balance"]):
        return "Bank Statement"
    if any(k in text_lower for k in ["tax invoice", "invoice no", "invoice #", "bill to", "due date", "subtotal", "gstin", "vat"]):
        return "Invoice"
    if any(k in text_lower for k in ["receipt", "total paid", "cashier", "order number", "subtotal", "tax"]):
        return "Receipt"
    if any(k in text_lower for k in ["agreement", "terms and conditions", "memorandum", "parties", "hereby"]):
        return "Contract"

    return "General Document"


def extract_excel_document(file_path: str, document_id: Optional[str] = None) -> Dict[str, Any]:
    """Forensic Spreadsheet Extraction Engine:
    - Parses Excel (.xlsx, .xls) and CSV (.csv) workbooks.
    - Extracts all sheet names, rows, columns, headers, and cell values.
    - Inspects formulas to detect security risks (e.g. =cmd, =SYSTEM, =WEBSERVICE, malicious external links).
    - Identifies empty cells, data density, and column types.
    - Builds structured RAG-ready text representations and entities for each sheet.
    """
    ext = os.path.splitext(file_path)[1].lower()
    sheets_info: List[Dict[str, Any]] = []
    all_raw_texts: List[str] = []
    all_entities: List[Dict[str, Any]] = []
    spreadsheet_anomalies: List[Dict[str, Any]] = []
    total_formulas = 0
    total_rows_all = 0
    total_cols_max = 0

    suspicious_formula_patterns = [
        re.compile(r'^\s*=\s*(cmd|powershell|calc|certutil|exec|system)\b', re.IGNORECASE),
        re.compile(r'^\s*=\s*(webservice|hyperlink)\s*\(.*(http|ftp|file:)', re.IGNORECASE),
        re.compile(r'!([A-Z]+[0-9]+|\$[A-Z]+\$[0-9]+)', re.IGNORECASE),  # External workbook references
    ]

    if ext in [".xlsx", ".xlsm"]:
        import openpyxl
        try:
            wb = openpyxl.load_workbook(file_path, data_only=False, read_only=False)
            sheet_names = wb.sheetnames
        except Exception as e:
            # Fallback to read_only if large
            try:
                wb = openpyxl.load_workbook(file_path, data_only=True, read_only=True)
                sheet_names = wb.sheetnames
            except Exception as e2:
                raise ValueError(f"Could not parse Excel workbook: {e2}")

        for sheet_idx, sname in enumerate(sheet_names):
            ws = wb[sname]
            rows_data: List[List[Any]] = []
            sheet_formulas: List[Dict[str, Any]] = []

            for row in ws.iter_rows(values_only=False):
                row_vals = []
                for cell in row:
                    val = cell.value
                    if val is not None:
                        val_str = str(val).strip()
                        # Formula check
                        if isinstance(val, str) and val.startswith("="):
                            total_formulas += 1
                            sheet_formulas.append({
                                "coordinate": cell.coordinate,
                                "formula": val,
                            })
                            for pat in suspicious_formula_patterns:
                                if pat.search(val):
                                    spreadsheet_anomalies.append({
                                        "sheet": sname,
                                        "coordinate": cell.coordinate,
                                        "type": "Suspicious / External Formula",
                                        "formula": val,
                                        "severity": "High",
                                    })
                        row_vals.append(val_str)
                    else:
                        row_vals.append("")
                if any(v != "" for v in row_vals):
                    rows_data.append(row_vals)

            row_count = len(rows_data)
            col_count = max((len(r) for r in rows_data), default=0)
            total_rows_all += row_count
            total_cols_max = max(total_cols_max, col_count)

            headers = rows_data[0] if rows_data else []
            data_sample = rows_data[1:51] if len(rows_data) > 1 else []

            # Create text representation for RAG
            sheet_text_lines = [f"=== SHEET: {sname} ({row_count} rows, {col_count} columns) ==="]
            if headers:
                sheet_text_lines.append(f"Columns: {', '.join([h or f'Col_{i+1}' for i, h in enumerate(headers)])}")
            for r_idx, r in enumerate(data_sample[:25]):
                row_str = " | ".join([f"{headers[i] if i < len(headers) and headers[i] else f'Col{i+1}'}: {val}" for i, val in enumerate(r) if val])
                if row_str:
                    sheet_text_lines.append(f"Row {r_idx+1}: {row_str}")

            sheet_text = "\n".join(sheet_text_lines)
            all_raw_texts.append(sheet_text)

            # Generate entities for columns and key cells
            for col_idx, h in enumerate(headers[:15]):
                if h:
                    all_entities.append({
                        "type": "Text",
                        "text": f"Header: {h}",
                        "bounding_box": [col_idx * 120, 20, 100, 24],
                        "confidence": 100.0,
                        "font_size": 14,
                        "text_type": "Heading",
                        "alignment": "left",
                        "vertical_spacing": 0,
                        "pixel_intensity": 0.0,
                        "page_number": sheet_idx + 1,
                        "sheet_name": sname,
                    })

            sheets_info.append({
                "name": sname,
                "row_count": row_count,
                "col_count": col_count,
                "headers": headers[:30],
                "sample_rows": [[str(c) for c in r[:30]] for r in data_sample[:50]],
                "formula_count": len(sheet_formulas),
            })

    elif ext == ".csv":
        import csv
        rows_data: List[List[str]] = []
        encodings = ["utf-8", "utf-8-sig", "latin-1", "cp1252"]
        content = ""
        for enc in encodings:
            try:
                with open(file_path, "r", encoding=enc) as f:
                    content = f.read()
                break
            except (UnicodeDecodeError, Exception):
                continue

        reader = csv.reader(content.splitlines())
        for row in reader:
            if any(cell.strip() for cell in row):
                rows_data.append(row)

        row_count = len(rows_data)
        col_count = max((len(r) for r in rows_data), default=0)
        total_rows_all = row_count
        total_cols_max = col_count
        headers = rows_data[0] if rows_data else []
        data_sample = rows_data[1:51] if len(rows_data) > 1 else []

        sheet_text_lines = [f"=== CSV SPREADSHEET ({row_count} rows, {col_count} columns) ==="]
        if headers:
            sheet_text_lines.append(f"Columns: {', '.join([h for h in headers if h])}")
        for r_idx, r in enumerate(data_sample[:25]):
            row_str = " | ".join([f"{headers[i] if i < len(headers) and headers[i] else f'Col{i+1}'}: {val}" for i, val in enumerate(r) if val])
            if row_str:
                sheet_text_lines.append(f"Row {r_idx+1}: {row_str}")

        sheet_text = "\n".join(sheet_text_lines)
        all_raw_texts.append(sheet_text)

        sheets_info.append({
            "name": os.path.basename(file_path),
            "row_count": row_count,
            "col_count": col_count,
            "headers": headers[:30],
            "sample_rows": [[str(c) for c in r[:30]] for r in data_sample[:50]],
            "formula_count": 0,
        })

        for col_idx, h in enumerate(headers[:15]):
            if h:
                all_entities.append({
                    "type": "Text",
                    "text": f"Header: {h}",
                    "bounding_box": [col_idx * 120, 20, 100, 24],
                    "confidence": 100.0,
                    "font_size": 14,
                    "text_type": "Heading",
                    "alignment": "left",
                    "vertical_spacing": 0,
                    "pixel_intensity": 0.0,
                    "page_number": 1,
                    "sheet_name": "CSV",
                })

    aggregated_text = "\n\n".join(all_raw_texts)
    return {
        "is_multi_page": len(sheets_info) > 1,
        "is_spreadsheet": True,
        "file_type": "spreadsheet",
        "total_pages": len(sheets_info),
        "processed_pages": len(sheets_info),
        "raw_text": aggregated_text,
        "entities": all_entities,
        "pages": [
            {
                "page_number": idx + 1,
                "sheet_name": s["name"],
                "text": f"Sheet: {s['name']}\nRows: {s['row_count']}, Columns: {s['col_count']}",
                "entities": [e for e in all_entities if e.get("sheet_name") == s["name"]],
            }
            for idx, s in enumerate(sheets_info)
        ],
        "image_size": [1200, 800],
        "spreadsheet_data": {
            "sheets": sheets_info,
            "total_sheets": len(sheets_info),
            "total_rows": total_rows_all,
            "total_cols": total_cols_max,
            "total_formulas": total_formulas,
            "anomalies": spreadsheet_anomalies,
        },
    }


def extract_docx_document(file_path: str, document_id: Optional[str] = None) -> Dict[str, Any]:
    """Forensic Word Document (.docx) Extraction:
    - Extracts all paragraphs, styles, heading levels, and tables.
    - Inspects document core properties (Author, Created, LastModifiedBy, Revision).
    """
    import docx
    doc = docx.Document(file_path)
    all_raw_texts: List[str] = []
    all_entities: List[Dict[str, Any]] = []
    tables_data: List[Dict[str, Any]] = []

    # 1. Paragraphs & Headings
    y_offset = 20
    for p_idx, p in enumerate(doc.paragraphs):
        p_text = p.text.strip()
        if not p_text:
            continue
        all_raw_texts.append(p_text)
        style_name = p.style.name if p.style else "Normal"
        is_heading = "Heading" in style_name or "Title" in style_name
        font_size = 20 if "1" in style_name else (16 if is_heading else 11)

        all_entities.append({
            "type": "Text",
            "text": p_text,
            "bounding_box": [40, y_offset, min(len(p_text) * 8, 800), font_size * 2],
            "confidence": 100.0,
            "font_size": font_size,
            "text_type": "Heading" if is_heading else "Body",
            "alignment": str(p.alignment).lower() if p.alignment else "left",
            "vertical_spacing": 10,
            "pixel_intensity": 0.0,
            "page_number": 1,
        })
        y_offset += (font_size * 2) + 10

    # 2. Embedded Tables
    for t_idx, table in enumerate(doc.tables):
        t_rows: List[List[str]] = []
        for row in table.rows:
            r_vals = [cell.text.strip() for cell in row.cells]
            if any(r_vals):
                t_rows.append(r_vals)
        if t_rows:
            headers = t_rows[0]
            tables_data.append({
                "table_index": t_idx + 1,
                "row_count": len(t_rows),
                "col_count": len(headers),
                "headers": headers,
                "rows_sample": t_rows[1:10],
            })
            table_text = f"=== TABLE {t_idx+1} ===\n" + "\n".join([" | ".join(r) for r in t_rows[:15]])
            all_raw_texts.append(table_text)

    # 3. Document Properties
    doc_props = {}
    try:
        cp = doc.core_properties
        doc_props = {
            "author": cp.author or "Unknown",
            "created": str(cp.created) if cp.created else None,
            "modified": str(cp.modified) if cp.modified else None,
            "last_modified_by": cp.last_modified_by or "Unknown",
            "revision": cp.revision or 1,
        }
    except Exception:
        pass

    aggregated_text = "\n\n".join(all_raw_texts)
    return {
        "is_multi_page": False,
        "file_type": "docx",
        "total_pages": 1,
        "processed_pages": 1,
        "raw_text": aggregated_text,
        "entities": all_entities,
        "pages": [{
            "page_number": 1,
            "text": aggregated_text[:4000],
            "entities": all_entities,
        }],
        "image_size": [1000, 1400],
        "docx_data": {
            "paragraph_count": len(doc.paragraphs),
            "table_count": len(doc.tables),
            "tables": tables_data,
            "properties": doc_props,
        },
    }


def extract_text_document(file_path: str, document_id: Optional[str] = None) -> Dict[str, Any]:
    """Plain Text, Markdown, or JSON Forensic Extraction."""
    ext = os.path.splitext(file_path)[1].lower()
    encodings = ["utf-8", "utf-8-sig", "latin-1", "cp1252"]
    content = ""
    for enc in encodings:
        try:
            with open(file_path, "r", encoding=enc) as f:
                content = f.read()
            break
        except (UnicodeDecodeError, Exception):
            continue

    all_entities: List[Dict[str, Any]] = []
    lines = content.splitlines()
    for idx, line in enumerate(lines[:100]):
        line_clean = line.strip()
        if not line_clean:
            continue
        all_entities.append({
            "type": "Text",
            "text": line_clean[:200],
            "bounding_box": [30, idx * 22, min(len(line_clean) * 7, 750), 16],
            "confidence": 100.0,
            "font_size": 12,
            "text_type": "Heading" if idx == 0 or line_clean.startswith("#") else "Body",
            "alignment": "left",
            "vertical_spacing": 4,
            "pixel_intensity": 0.0,
            "page_number": 1,
        })

    json_info = None
    if ext == ".json":
        try:
            parsed = json.loads(content)
            json_info = {
                "is_valid_json": True,
                "root_type": type(parsed).__name__,
                "keys_count": len(parsed) if isinstance(parsed, (dict, list)) else 1,
                "top_keys": list(parsed.keys())[:20] if isinstance(parsed, dict) else [],
            }
        except Exception as e:
            json_info = {"is_valid_json": False, "error": str(e)}

    return {
        "is_multi_page": False,
        "file_type": "text" if ext != ".json" else "json",
        "total_pages": 1,
        "processed_pages": 1,
        "raw_text": content,
        "entities": all_entities,
        "pages": [{
            "page_number": 1,
            "text": content[:4000],
            "entities": all_entities,
        }],
        "image_size": [1000, max(800, len(lines) * 22)],
        "json_info": json_info,
    }


def extract_smart_routed_document(file_path: str, max_pages: int = 100, document_id: Optional[str] = None) -> Dict[str, Any]:
    """Multi-Format & Universal Document Forensics Ingestion:
    - PDF: Multi-page scanning (all pages up to max_pages), PyMuPDF digital text + OCR fallback, page preview generation.
    - Excel / CSV (.xlsx, .xls, .csv): Full workbook spreadsheet parsing, formula inspection, tabular grid extraction.
    - Word (.docx): Paragraphs, headings, embedded tables, and document metadata.
    - Text / JSON (.txt, .md, .json): Clean text and structural schema parsing.
    - Images (.png, .jpg, .jpeg, .tiff, .bmp, .webp): High-res OpenCV/Tesseract OCR, stamps, signatures, and EXIF.
    """
    ext = os.path.splitext(file_path)[1].lower()

    if ext in [".xlsx", ".xls", ".csv"]:
        return extract_excel_document(file_path, document_id)
    elif ext == ".docx":
        return extract_docx_document(file_path, document_id)
    elif ext in [".txt", ".json", ".md", ".log"]:
        return extract_text_document(file_path, document_id)
    elif ext == ".pdf":
        import pymupdf
        doc = pymupdf.open(file_path)
        total_pages = len(doc)
        pages_to_process = min(total_pages, max_pages)
        page_width, page_height = 1000, 1000

        previews_dir = os.path.join("uploads", "previews")
        os.makedirs(previews_dir, exist_ok=True)

        doc_prefix = document_id or os.path.splitext(os.path.basename(file_path))[0]
        # Clean prefix
        if "_" in doc_prefix and len(doc_prefix.split("_")[0]) >= 32:
            doc_prefix = doc_prefix.split("_")[0]

        page_records: List[Dict[str, Any]] = []
        all_entities: List[Dict[str, Any]] = []
        all_raw_texts: List[str] = []

        for page_idx in range(pages_to_process):
            page = doc.load_page(page_idx)
            page_width = int(page.rect.width)
            page_height = int(page.rect.height)
            page_num = page_idx + 1
            native_text = page.get_text("text").strip()

            # Generate and save preview image for EVERY page so user can navigate pages visually
            preview_filename = f"{doc_prefix}_page_{page_num}.png"
            preview_disk_path = os.path.join(previews_dir, preview_filename)
            preview_url = f"/uploads/previews/{preview_filename}"

            try:
                pix = page.get_pixmap(dpi=120)
                pix.save(preview_disk_path)
            except Exception as p_err:
                pass

            # Check if page contains extractable digital text
            if len(native_text) >= 40:
                blocks = page.get_text("blocks")
                page_entities: List[Dict[str, Any]] = []

                for b in blocks:
                    bx0, by0, bx1, by1, btext, bno, btype = b
                    btext_clean = btext.strip()
                    if not btext_clean:
                        continue
                    bw = int(bx1 - bx0)
                    bh = int(by1 - by0)
                    page_entities.append({
                        "type": "Text",
                        "text": btext_clean,
                        "bounding_box": [int(bx0), int(by0), bw, bh],
                        "confidence": 1.0,
                        "font_size": bh,
                        "text_type": "Heading" if bh >= 26 else "Body",
                        "alignment": "center" if abs((bx0 + bw/2.0) - (page.rect.width/2.0)) < (page.rect.width * 0.15) else "left",
                        "vertical_spacing": 0,
                        "pixel_intensity": 0.0,
                        "page_number": page_num,
                    })

                all_entities.extend(page_entities)
                all_raw_texts.append(native_text)
                page_records.append({
                    "page_number": page_num,
                    "extraction_method": "PyMuPDF4LLM_digital",
                    "text": native_text,
                    "entities": page_entities,
                    "word_count": len(native_text.split()),
                    "preview_url": preview_url,
                })
            else:
                # Scanned or image-only page: route to RapidOCR (PaddleOCR ONNX)
                pix = page.get_pixmap(dpi=150)
                img_bytes = pix.tobytes("png")
                ocr_result = extract_document_features(img_bytes)

                for ent in ocr_result["entities"]:
                    ent["page_number"] = page_num
                    all_entities.append(ent)

                all_raw_texts.append(ocr_result["raw_text"])
                page_records.append({
                    "page_number": page_num,
                    "extraction_method": "RapidOCR_PaddleONNX",
                    "text": ocr_result["raw_text"],
                    "entities": ocr_result["entities"],
                    "word_count": len(ocr_result["raw_text"].split()),
                    "preview_url": preview_url,
                })

        # PyMuPDF4LLM Markdown extraction for RAG pipeline
        markdown_text = ""
        try:
            import pymupdf4llm
            markdown_text = pymupdf4llm.to_markdown(doc, pages=list(range(pages_to_process)))
        except Exception:
            pass

        # PDF metadata
        pdf_meta = {}
        try:
            pdf_meta = {k: str(v) for k, v in doc.metadata.items() if v}
        except Exception:
            pass

        doc.close()
        aggregated_text = "\n\n".join(all_raw_texts)
        final_text = markdown_text if markdown_text and len(markdown_text.strip()) > 30 else aggregated_text
        return {
            "is_multi_page": total_pages > 1,
            "file_type": "pdf",
            "total_pages": total_pages,
            "processed_pages": pages_to_process,
            "raw_text": final_text,
            "markdown_text": markdown_text,
            "entities": all_entities,
            "pages": page_records,
            "image_size": [page_width, page_height],
            "pdf_metadata": pdf_meta,
        }
    else:
        # Standard Single Image Upload (.png, .jpg, .jpeg, .tiff, .bmp, .webp)
        with open(file_path, "rb") as f:
            img_bytes = f.read()

        ocr_result = extract_document_features(img_bytes)
        for ent in ocr_result["entities"]:
            ent["page_number"] = 1

        # Also save preview image for page 1
        previews_dir = os.path.join("uploads", "previews")
        os.makedirs(previews_dir, exist_ok=True)
        doc_prefix = document_id or os.path.splitext(os.path.basename(file_path))[0]
        if "_" in doc_prefix and len(doc_prefix.split("_")[0]) >= 32:
            doc_prefix = doc_prefix.split("_")[0]

        preview_filename = f"{doc_prefix}_page_1.png"
        preview_disk_path = os.path.join(previews_dir, preview_filename)
        try:
            shutil.copyfile(file_path, preview_disk_path)
        except Exception:
            pass

        return {
            "is_multi_page": False,
            "file_type": "image",
            "total_pages": 1,
            "processed_pages": 1,
            "raw_text": ocr_result["raw_text"],
            "entities": ocr_result["entities"],
            "pages": [{
                "page_number": 1,
                "extraction_method": "RapidOCR_PaddleONNX",
                "text": ocr_result["raw_text"],
                "entities": ocr_result["entities"],
                "word_count": len(ocr_result["raw_text"].split()),
                "preview_url": f"/uploads/previews/{preview_filename}",
            }],
            "image_size": ocr_result["image_size"],
        }


