import os
import json
import uuid
from typing import Any, Dict, List, Optional
import chromadb
from chromadb.utils import embedding_functions
from langchain_text_splitters import RecursiveCharacterTextSplitter

# ChromaDB persistence directory
CHROMA_DATA_DIR = os.path.join(os.getcwd(), "chroma_db")
os.makedirs(CHROMA_DATA_DIR, exist_ok=True)

# Initialize ChromaDB Persistent Client
chroma_client = chromadb.PersistentClient(path=CHROMA_DATA_DIR)

# Configure embedding function (Default MiniLM-L6-v2 ONNX embedder in ChromaDB)
embedding_func = embedding_functions.DefaultEmbeddingFunction()

# Collection for forensic document chunks
forensics_collection = chroma_client.get_or_create_collection(
    name="forensics_document_chunks",
    embedding_function=embedding_func,
    metadata={"hnsw:space": "cosine"},
)

# Recursive character text splitter configured for 500-char blocks with 50-char overlap
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50,
    length_function=len,
    separators=["\n\n", "\n", ". ", " ", ""],
)


def chunk_and_vectorize_document(
    document_id: str,
    raw_text: str,
    page_number: int = 1,
    bounding_box: Optional[List[int]] = None,
    extra_metadata: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Splits document text into 500-character blocks, retaining metadata

    (document_id, page_number, bounding_box) and vectorizes them into ChromaDB.
    """
    if not raw_text or not raw_text.strip():
        return []

    chunks = text_splitter.split_text(raw_text)
    if not chunks:
        return []

    ids: List[str] = []
    documents: List[str] = []
    metadatas: List[Dict[str, Any]] = []
    created_chunks: List[Dict[str, Any]] = []

    bbox_str = json.dumps(bounding_box or [0, 0, 0, 0])

    for idx, chunk in enumerate(chunks):
        chunk_id = f"{document_id}_p{page_number}_c{idx}"
        meta = {
            "document_id": document_id,
            "page_number": int(page_number),
            "chunk_index": int(idx),
            "bounding_box": bbox_str,
        }
        if extra_metadata:
            for k, v in extra_metadata.items():
                if isinstance(v, (str, int, float, bool)):
                    meta[k] = v

        ids.append(chunk_id)
        documents.append(chunk)
        metadatas.append(meta)

        created_chunks.append({
            "chunk_id": chunk_id,
            "text": chunk,
            "metadata": meta,
        })

    # Upsert chunks into ChromaDB
    try:
        forensics_collection.upsert(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
        )
    except Exception as e:
        print(f"Warning: Failed to vector store chunks in ChromaDB: {e}")

    return created_chunks


def query_relevant_chunks(
    query_text: str,
    document_ids: Optional[List[str]] = None,
    n_results: int = 6,
) -> List[Dict[str, Any]]:
    """Performs semantic similarity search in ChromaDB to retrieve only the most

    relevant chunks for a given forensic query across specific document_ids.
    """
    where_filter = None
    if document_ids:
        if len(document_ids) == 1:
            where_filter = {"document_id": document_ids[0]}
        else:
            where_filter = {"document_id": {"$in": document_ids}}

    try:
        results = forensics_collection.query(
            query_texts=[query_text],
            n_results=n_results,
            where=where_filter,
        )
    except Exception as e:
        print(f"ChromaDB query error: {e}")
        return []

    retrieved_chunks = []
    if results and "documents" in results and results["documents"]:
        doc_list = results["documents"][0]
        meta_list = results.get("metadatas", [[]])[0]
        id_list = results.get("ids", [[]])[0]
        dist_list = results.get("distances", [[]])[0] if results.get("distances") else [0.0] * len(doc_list)

        for cid, doc_text, meta, dist in zip(id_list, doc_list, meta_list, dist_list):
            retrieved_chunks.append({
                "chunk_id": cid,
                "text": doc_text,
                "metadata": meta,
                "distance": dist,
            })

    return retrieved_chunks

