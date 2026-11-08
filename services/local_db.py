import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

LOCAL_DB_FILE = Path("database/local_db.json")


def _read_db() -> Dict[str, Any]:
    if not LOCAL_DB_FILE.exists():
        return {}
    try:
        with open(LOCAL_DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _write_db(data: Dict[str, Any]):
    LOCAL_DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp_file = LOCAL_DB_FILE.with_suffix(".tmp")
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    temp_file.replace(LOCAL_DB_FILE)


def save_local_document(doc: Dict[str, Any]):
    doc_id = doc.get("document_id")
    if not doc_id:
        return
    data = _read_db()
    # Normalize dictionary
    cleaned = dict(doc)
    if "_id" in cleaned:
        del cleaned["_id"]
    data[doc_id] = cleaned
    _write_db(data)


def get_local_document(doc_id: str) -> Optional[Dict[str, Any]]:
    data = _read_db()
    return data.get(doc_id)


def list_local_documents() -> List[Dict[str, Any]]:
    data = _read_db()
    return list(data.values())
