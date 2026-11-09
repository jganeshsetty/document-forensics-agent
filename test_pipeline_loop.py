"""Integration test for the Document Forensics Pipeline.

Tests: extraction, RAG chunking, ELA forensics, PII tagging, storage backend.
"""
import sys
import os
import json
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from services.extraction_service import (
    extract_smart_routed_document,
    classify_document,
    generate_layout_fingerprint,
    tag_sensitive_pii,
    preprocess_image,
)
from services.analysis_service import run_ela_analysis, cross_verify_documents
from services.rag_service import chunk_and_vectorize_document, query_relevant_chunks
from services.storage_service import storage_service, GCSStorageService

UPLOADS_DIR = Path("uploads")


def test_extraction_pdf():
    print("\n=== TEST: PDF Smart Routing ===")
    pdf_path = str(UPLOADS_DIR / "Module 01.pdf")
    if not os.path.exists(pdf_path):
        print(f"SKIP: {pdf_path} not found")
        return None

    result = extract_smart_routed_document(pdf_path, max_pages=5)
    print(f"  Pages: {result['total_pages']} total, {result['processed_pages']} processed")
    print(f"  Entities: {len(result['entities'])}")
    print(f"  Raw text length: {len(result['raw_text'])}")
    assert result['processed_pages'] <= 5
    assert len(result['entities']) > 0
    assert len(result['raw_text']) > 0
    print("  PASS")
    return result


def test_extraction_image():
    print("\n=== TEST: Image OCR ===")
    img_path = str(UPLOADS_DIR / "10th_marks_card.jpeg")
    if not os.path.exists(img_path):
        print(f"SKIP: {img_path} not found")
        return None

    with open(img_path, "rb") as f:
        img_bytes = f.read()

    result = preprocess_image(img_bytes)
    print(f"  Image shape: {result[0].shape}")
    print(f"  Threshold shape: {result[1].shape}")
    print(f"  Scale factor: {result[2]}")
    print(f"  Is dark: {result[3]}")
    print("  PASS")

    feat_result = extract_smart_routed_document(img_path, max_pages=1)
    print(f"  Entities: {len(feat_result['entities'])}")
    print(f"  Raw text length: {len(feat_result['raw_text'])}")
    assert len(feat_result['entities']) > 0
    print("  PASS")
    return feat_result


def test_ela():
    print("\n=== TEST: ELA Forensics ===")
    img_path = str(UPLOADS_DIR / "10th_marks_card.jpeg")
    if not os.path.exists(img_path):
        print(f"SKIP: {img_path} not found")
        return None

    result = run_ela_analysis(img_path)
    print(f"  Tampering detected: {result['tampering_detected']}")
    print(f"  Tampering area %: {result['tampering_area_percentage']}")
    print(f"  Suspicious regions: {result['suspicious_regions_count']}")
    assert 0.0 <= result['tampering_area_percentage'] <= 100.0, \
        f"Tampering ratio {result['tampering_area_percentage']}% exceeded 100%"
    print("  PASS (ratio within [0, 100])")
    return result


def test_pii_tagging():
    print("\n=== TEST: PII Tagging & Redaction ===")
    test_text = "Contact John at john@example.com or call 9876543210. SSN: 123-45-6789. PAN: ABCDE1234F."
    test_entities = [
        {"text": "john@example.com", "bounding_box": [0, 0, 100, 20]},
        {"text": "9876543210", "bounding_box": [0, 20, 80, 20]},
        {"text": "123-45-6789", "bounding_box": [0, 40, 100, 20]},
        {"text": "ABCDE1234F", "bounding_box": [0, 60, 100, 20]},
    ]

    result = tag_sensitive_pii(test_text, test_entities)
    print(f"  PII findings: {result['pii_count']}")
    print(f"  Findings: {[p['type'] for p in result['pii_findings']]}")
    print(f"  Redacted text: {result['raw_text'][:100]}...")

    assert result['pii_count'] == 4, f"Expected 4 PII findings, got {result['pii_count']}"
    assert "[REDACTED_SSN]" in result['raw_text']
    assert "[REDACTED_PAN]" in result['raw_text']
    assert "[REDACTED_Email]" in result['raw_text']
    assert "[REDACTED_Phone]" in result['raw_text']

    for ent in result['entities']:
        if ent.get('pii_tagged'):
            print(f"  Entity tagged: {ent['text'][:30]}... -> {ent['pii_type']}")
    print("  PASS")
    return result


def test_rag_chunking():
    print("\n=== TEST: RAG Chunking & ChromaDB ===")
    doc_id = "test_rag_doc"
    sample_text = """This is a sample document for forensic analysis testing.
It contains various types of information including names, dates, and financial data.
The document appears to be a standard business record with multiple sections.
Section 1: Introduction - This document serves as a test case for the forensics pipeline.
Section 2: Financial Data - Transaction amount of $1,250 was recorded on 2024-01-15.
Section 3: Personal Information - John Doe, SSN 123-45-6789, email john@example.com.
Section 4: Conclusion - The document has been verified and authenticated."""

    chunks = chunk_and_vectorize_document(doc_id, sample_text, page_number=1)
    print(f"  Chunks created: {len(chunks)}")
    assert len(chunks) > 0, "Expected at least one chunk"

    # Query the chunks back
    results = query_relevant_chunks("financial transaction amount", document_ids=[doc_id], n_results=2)
    print(f"  Query results: {len(results)} chunks")
    assert len(results) > 0, "Expected at least one query result"
    print(f"  Top result distance: {results[0]['distance']:.4f}")
    print("  PASS")
    return chunks


def test_storage_backend():
    print("\n=== TEST: Storage Backend ===")
    backend = StorageBackend()
    test_data = b"Test file content for storage backend verification."

    import io
    source = backend.store("test_file.txt", io.BytesIO(test_data))
    print(f"  Stored at: {source}")
    assert source.startswith("local://") or source.startswith("minio://")

    retrieved = backend.read(source)
    assert retrieved == test_data, "Retrieved data mismatch"
    print(f"  Retrieved: {retrieved[:50]}...")
    print("  PASS")


def test_layout_fingerprint():
    print("\n=== TEST: Layout Fingerprinting ===")
    test_entities = [
        {"type": "Text", "text": "HEADER", "bounding_box": [100, 10, 800, 50], "text_type": "Heading", "alignment": "center"},
        {"type": "Logo", "text": "[Logo]", "bounding_box": [50, 5, 100, 60], "text_type": "Logo", "alignment": "left"},
        {"type": "Text", "text": "Body text line one.", "bounding_box": [100, 100, 400, 30], "text_type": "Body", "alignment": "left"},
        {"type": "Stamp", "text": "[Stamp]", "bounding_box": [700, 500, 150, 150], "text_type": "Stamp", "alignment": "right"},
    ]
    result = generate_layout_fingerprint(test_entities, [1000, 800])
    print(f"  Template signature: {result['template_signature']}")
    print(f"  Anchor count: {result['anchor_count']}")
    print(f"  Normalized layout entries: {len(result['normalized_layout'])}")
    assert len(result['template_signature']) == 16
    assert result['anchor_count'] > 0
    print("  PASS")


def main():
    print("=" * 60)
    print("Document Forensics Pipeline - Integration Tests")
    print("=" * 60)

    passed = 0
    failed = 0
    skipped = 0

    tests = [
        ("PDF Extraction", test_extraction_pdf),
        ("Image OCR", test_extraction_image),
        ("ELA Forensics", test_ela),
        ("PII Tagging", test_pii_tagging),
        ("RAG Chunking", test_rag_chunking),
        ("Storage Backend", test_storage_backend),
        ("Layout Fingerprint", test_layout_fingerprint),
    ]

    for name, test_fn in tests:
        try:
            result = test_fn()
            if result is not None:
                passed += 1
            else:
                skipped += 1
        except Exception as e:
            print(f"  FAIL: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed, {skipped} skipped")
    print("=" * 60)

    if failed > 0:
        sys.exit(1)
    else:
        print("\nAll tests passed!")
        sys.exit(0)


if __name__ == "__main__":
    main()
