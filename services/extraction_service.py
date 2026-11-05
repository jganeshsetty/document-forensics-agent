import os
import re
import shutil
import uuid
import hashlib
from typing import Any, Dict, List, Tuple, Optional
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


def detect_visual_elements(image: np.ndarray, text_boxes: List[List[int]]) -> List[Dict[str, Any]]:
    """Detects non-text structural elements such as 'Signature', 'Logo', or 'Stamp'

    using OpenCV contour shape and color analysis, excluding regions already occupied by text.
    """
    orig_h, orig_w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # Text occupancy mask to avoid re-detecting text lines as visual symbols
    text_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)
    for bx, by, bw, bh in text_boxes:
        cv2.rectangle(text_mask, (bx, by), (bx + bw, by + bh), 255, -1)

    # Dilate text mask slightly to cover ascenders/descenders
    kernel_text = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    text_mask = cv2.dilate(text_mask, kernel_text, iterations=1)

    visual_elements: List[Dict[str, Any]] = []

    # 1. Stamp Detection: Colored circular or oval shapes (red / blue / purple stamps)
    # Saturation threshold to find colorful ink
    sat = hsv[:, :, 1]
    _, stamp_mask = cv2.threshold(sat, 80, 255, cv2.THRESH_BINARY)
    stamp_mask = cv2.bitwise_and(stamp_mask, stamp_mask, mask=cv2.bitwise_not(text_mask))
    
    contours_stamp, _ = cv2.findContours(stamp_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours_stamp:
        area = cv2.contourArea(cnt)
        if 800 < area < (orig_w * orig_h * 0.15):
            x, y, w, h = cv2.boundingRect(cnt)
            aspect_ratio = float(w) / float(h)
            if 0.7 <= aspect_ratio <= 1.5:  # Circular or rounded
                # Check solidity or perimeter
                perimeter = cv2.arcLength(cnt, True)
                if perimeter > 0:
                    circularity = 4 * np.pi * (area / (perimeter * perimeter))
                    if circularity > 0.35:
                        visual_elements.append({
                            "type": "Stamp",
                            "text": "[Stamp]",
                            "bounding_box": [int(x), int(y), int(w), int(h)],
                            "confidence": 88.0,
                            "aspect_ratio": round(aspect_ratio, 2),
                        })

    # 2. General Structural Symbols / Logos / Badges
    # Edge detection & morphology to find standalone visual icons / logos
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    kernel_logo = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    closed_edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel_logo)
    closed_edges = cv2.bitwise_and(closed_edges, closed_edges, mask=cv2.bitwise_not(text_mask))

    contours_logo, _ = cv2.findContours(closed_edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours_logo:
        area = cv2.contourArea(cnt)
        if 400 < area < (orig_w * orig_h * 0.08):
            x, y, w, h = cv2.boundingRect(cnt)
            aspect_ratio = float(w) / float(h)
            # Logos are usually reasonably compact (not long lines)
            if 0.4 <= aspect_ratio <= 2.5 and w > 16 and h > 16:
                # Avoid overlapping with existing visual elements
                overlaps = False
                for ex in visual_elements:
                    ebx, eby, ebw, ebh = ex["bounding_box"]
                    if not (x + w < ebx or x > ebx + ebw or y + h < eby or y > eby + ebh):
                        overlaps = True
                        break
                if not overlaps:
                    # Check if signature-like: wide aspect ratio with high stroke variation in lower 40% of document
                    is_signature_zone = y > (orig_h * 0.55) and aspect_ratio > 1.8
                    elem_type = "Signature" if is_signature_zone else "Logo"
                    visual_elements.append({
                        "type": elem_type,
                        "text": f"[{elem_type}]",
                        "bounding_box": [int(x), int(y), int(w), int(h)],
                        "confidence": 82.0,
                        "aspect_ratio": round(aspect_ratio, 2),
                    })

    # Deduplicate and sort by vertical position
    visual_elements.sort(key=lambda elem: (elem["bounding_box"][1], elem["bounding_box"][0]))
    return visual_elements[:10]  # Cap top prominent visual elements


def extract_document_features(image_bytes: bytes) -> Dict[str, Any]:
    """Runs OCR and Phase 1 Deep Metadata Extraction:

    - Groups words line-by-line
    - Calculates font_size, text_type ('Heading' | 'Body'), alignment ('left' | 'center' | 'right')
    - Calculates vertical_spacing and pixel_intensity
    - Detects non-text structural elements (Signature, Logo, Stamp)
    - Returns structured entities and image dimensions
    """
    image, thresh, scale_factor, is_dark = preprocess_image(image_bytes)
    orig_h, orig_w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    custom_config = r"--oem 3 --psm 11"
    try:
        tess_data = pytesseract.image_to_data(
            thresh,
            config=custom_config,
            output_type=Output.DICT,
        )
    except pytesseract.TesseractNotFoundError:
        raise RuntimeError("Tesseract OCR is not installed or not found on PATH.")

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

        orig_left = int(round(int(tess_data["left"][i]) / scale_factor))
        orig_top = int(round(int(tess_data["top"][i]) / scale_factor))
        orig_width = int(round(int(tess_data["width"][i]) / scale_factor))
        orig_height = int(round(int(tess_data["height"][i]) / scale_factor))

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

    # First pass: Build initial lines and gather font sizes (heights) to compute document median
    raw_lines: List[Dict[str, Any]] = []
    font_sizes: List[int] = []

    for line_key in sorted(lines_dict.keys()):
        words = lines_dict[line_key]
        if not words:
            continue

        words.sort(key=lambda w: (w["left"], w["word_num"]))
        line_text = " ".join([w["text"] for w in words])

        line_min_x = min(w["left"] for w in words)
        line_min_y = min(w["top"] for w in words)
        line_max_x = max(w["left"] + w["width"] for w in words)
        line_max_y = max(w["top"] + w["height"] for w in words)

        line_w = line_max_x - line_min_x
        line_h = line_max_y - line_min_y

        line_conf = round(sum(w["confidence"] for w in words) / len(words), 2)
        font_sizes.append(line_h)

        raw_lines.append({
            "text": line_text,
            "bounding_box": [line_min_x, line_min_y, line_w, line_h],
            "confidence": line_conf,
            "h": line_h,
            "y": line_min_y,
            "x": line_min_x,
            "w": line_w,
        })

    # Sort lines primarily top-to-bottom
    raw_lines.sort(key=lambda l: (l["y"], l["x"]))

    # Median font size (height)
    median_font_size = float(np.median(font_sizes)) if font_sizes else 16.0

    entities: List[Dict[str, Any]] = []
    all_line_texts: List[str] = []
    previous_box_bottom: Optional[int] = None
    all_text_boxes: List[List[int]] = []

    for item in raw_lines:
        line_text = item["text"]
        all_line_texts.append(line_text)
        bx, by, bw, bh = item["bounding_box"]
        all_text_boxes.append([bx, by, bw, bh])

        # 1. font_size: Estimated using bounding box height (h)
        font_size = bh

        # 2. text_type: 'Heading' if font_size >= 1.25 * median, else 'Body'
        text_type = "Heading" if font_size >= (median_font_size * 1.25) else "Body"

        # 3. alignment: Based on X center or left boundary relative to document width
        line_center_x = bx + (bw / 2.0)
        doc_center_x = orig_w / 2.0
        # If line center is within 12% of document center, it's centered
        if abs(line_center_x - doc_center_x) < (orig_w * 0.12):
            alignment = "center"
        elif bx > (orig_w * 0.55):
            alignment = "right"
        else:
            alignment = "left"

        # 4. vertical_spacing: pixel distance from bottom of previous box to top of current one
        if previous_box_bottom is not None:
            vertical_spacing = max(0, by - previous_box_bottom)
        else:
            vertical_spacing = 0
        previous_box_bottom = by + bh

        # 5. pixel_intensity: Average grayscale pixel value inside bounding box
        roi = gray[by:by + bh, bx:bx + bw]
        if roi.size > 0:
            pixel_intensity = round(float(np.mean(roi)), 2)
        else:
            pixel_intensity = 0.0

        entities.append({
            "type": "Text",
            "text": line_text,
            "bounding_box": [bx, by, bw, bh],
            "confidence": item["confidence"],
            "font_size": font_size,
            "text_type": text_type,
            "alignment": alignment,
            "vertical_spacing": vertical_spacing,
            "pixel_intensity": pixel_intensity,
        })

    # Detect non-text visual elements (Signatures, Logos, Stamps)
    visual_elements = detect_visual_elements(image, all_text_boxes)
    for elem in visual_elements:
        ebx, eby, ebw, ebh = elem["bounding_box"]
        roi_elem = gray[eby:eby + ebh, ebx:ebx + ebw]
        p_intensity = round(float(np.mean(roi_elem)), 2) if roi_elem.size > 0 else 0.0

        entities.append({
            "type": elem["type"],  # 'Signature', 'Logo', or 'Stamp'
            "text": elem["text"],
            "bounding_box": [ebx, eby, ebw, ebh],
            "confidence": elem["confidence"],
            "font_size": ebh,
            "text_type": elem["type"],
            "alignment": "center" if abs((ebx + ebw/2.0) - (orig_w/2.0)) < (orig_w * 0.15) else ("right" if ebx > orig_w*0.55 else "left"),
            "vertical_spacing": 0,
            "pixel_intensity": p_intensity,
        })

    # Sort final entities top-to-bottom
    entities.sort(key=lambda e: (e["bounding_box"][1], e["bounding_box"][0]))

    raw_text = "\n".join(all_line_texts)

    return {
        "raw_text": raw_text,
        "entities": entities,
        "is_dark": is_dark,
        "image_size": [orig_w, orig_h],
        "median_font_size": round(median_font_size, 2),
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
