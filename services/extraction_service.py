import os
import re
import shutil
import uuid
from typing import Any, Dict, List, Tuple
import cv2
import numpy as np
import pytesseract
from pytesseract import Output
import httpx

# Configure Tesseract binary and TESSDATA_PREFIX dynamically
def _configure_tesseract():
    if shutil.which("tesseract"):
        return
    common_win_paths = [
        r"C:\Users\Ganesh\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
    ]
    for p in common_win_paths:
        if os.path.exists(p):
            pytesseract.pytesseract.tesseract_cmd = p
            tess_dir = os.path.dirname(p)
            tessdata = os.path.join(tess_dir, "tessdata")
            if os.path.exists(tessdata):
                os.environ["TESSDATA_PREFIX"] = tessdata
            return

_configure_tesseract()


def preprocess_image(image_bytes: bytes):
    """Preprocesses document image bytes dynamically:

    - Decodes image
    - Evaluates brightness to invert dark documents dynamically
    - Upscales 2x using bicubic interpolation for small fonts
    - Applies adjusted adaptive thresholding (blockSize=15, C=4) to preserve fine strokes
    Returns: (original_image, processed_thresh_image, scale_factor, is_dark)
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image. Please upload a valid image file.")

    # 1. Grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # 2. Dynamic Inversion for Dark Theme / Mode
    mean_brightness = float(gray.mean())
    is_dark = mean_brightness < 127.0
    normalized_gray = (255 - gray) if is_dark else gray

    # 3. 2x Upscaling with Bicubic Interpolation
    scale_factor = 2.0
    upscaled = cv2.resize(
        normalized_gray,
        (0, 0),
        fx=scale_factor,
        fy=scale_factor,
        interpolation=cv2.INTER_CUBIC,
    )

    # 4. Adaptive Thresholding with fine stroke preservation
    thresh = cv2.adaptiveThreshold(
        upscaled,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=15,
        C=4,
    )

    return image, thresh, scale_factor, is_dark


def extract_document_features(image_bytes: bytes) -> Dict[str, Any]:
    """Runs OCR and extracts line-level entities with precise tight bounding boxes

    wrapped around each line of text without dropping or aggressively filtering words.
    """
    image, thresh, scale_factor, is_dark = preprocess_image(image_bytes)
    orig_h, orig_w = image.shape[:2]

    # Run PyTesseract with --psm 11 (sparse text) or default block analysis
    custom_config = r"--oem 3 --psm 11"
    try:
        tess_data = pytesseract.image_to_data(
            thresh,
            config=custom_config,
            output_type=Output.DICT,
        )
    except pytesseract.TesseractNotFoundError:
        raise RuntimeError("Tesseract OCR is not installed or not found on PATH.")

    # Group extracted words by their exact line: (block_num, par_num, line_num)
    lines_dict: Dict[Tuple[int, int, int], List[Dict[str, Any]]] = {}
    total_items = len(tess_data["text"])

    for i in range(total_items):
        text = tess_data["text"][i].strip()
        conf_str = tess_data["conf"][i]
        try:
            conf = float(conf_str)
        except (ValueError, TypeError):
            conf = -1.0

        if not text or conf < 0:
            continue

        # Scale coordinates back to original image dimensions with precise rounding
        orig_left = int(round(int(tess_data["left"][i]) / scale_factor))
        orig_top = int(round(int(tess_data["top"][i]) / scale_factor))
        orig_width = int(round(int(tess_data["width"][i]) / scale_factor))
        orig_height = int(round(int(tess_data["height"][i]) / scale_factor))

        # Clamp boundaries within image dimensions
        orig_left = max(0, min(orig_left, orig_w - 1))
        orig_top = max(0, min(orig_top, orig_h - 1))
        orig_width = max(1, min(orig_width, orig_w - orig_left))
        orig_height = max(1, min(orig_height, orig_h - orig_top))

        block_num = int(tess_data["block_num"][i])
        par_num = int(tess_data["par_num"][i])
        line_num = int(tess_data["line_num"][i])
        word_num = int(tess_data["word_num"][i])

        word_obj = {
            "text": text,
            "confidence": conf,
            "left": orig_left,
            "top": orig_top,
            "width": orig_width,
            "height": orig_height,
            "word_num": word_num,
        }

        line_key = (block_num, par_num, line_num)
        if line_key not in lines_dict:
            lines_dict[line_key] = []
        lines_dict[line_key].append(word_obj)

    # Build line-level entities with precise tight bounding boxes
    entities: List[Dict[str, Any]] = []
    all_line_texts: List[str] = []

    for line_key in sorted(lines_dict.keys()):
        words = lines_dict[line_key]
        if not words:
            continue

        # Sort words in natural reading order (left to right)
        words.sort(key=lambda w: (w["left"], w["word_num"]))

        line_text = " ".join([w["text"] for w in words])
        all_line_texts.append(line_text)

        # Precise tight bounding box wrapping this specific line
        line_min_x = min(w["left"] for w in words)
        line_min_y = min(w["top"] for w in words)
        line_max_x = max(w["left"] + w["width"] for w in words)
        line_max_y = max(w["top"] + w["height"] for w in words)

        line_w = line_max_x - line_min_x
        line_h = line_max_y - line_min_y

        # Average confidence for the line
        line_conf = round(sum(w["confidence"] for w in words) / len(words), 2)

        entities.append({
            "text": line_text,
            "bounding_box": [line_min_x, line_min_y, line_w, line_h],
            "confidence": line_conf,
        })

    raw_text = "\n".join(all_line_texts)

    return {
        "raw_text": raw_text,
        "entities": entities,
        "is_dark": is_dark,
        "image_size": [orig_w, orig_h],
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
                    "model": "llama-3.1-8b-instant",
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

    # Keyword Heuristics Fallback
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
