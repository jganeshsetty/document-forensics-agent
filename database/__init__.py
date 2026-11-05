from database.connection import (
    connect_to_mongo,
    close_mongo_connection,
    get_database,
    get_documents_collection,
)

__all__ = [
    "connect_to_mongo",
    "close_mongo_connection",
    "get_database",
    "get_documents_collection",
]

