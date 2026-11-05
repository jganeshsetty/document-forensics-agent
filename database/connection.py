import os
import certifi
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorCollection
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")

client: Optional[AsyncIOMotorClient] = None
db: Optional[AsyncIOMotorDatabase] = None
documents_collection: Optional[AsyncIOMotorCollection] = None

async def connect_to_mongo():
    global client, db, documents_collection
    if not MONGO_URI:
        raise ValueError("MONGO_URI environment variable is not configured.")
    
    # Use certifi.where() to provide trusted CA root certificates for SSL/TLS on Windows
    client = AsyncIOMotorClient(
        MONGO_URI,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=10000,
    )
    db = client["forensics_db"]
    documents_collection = db["documents"]
    # Verify the connection with a ping
    await client.admin.command("ping")

async def close_mongo_connection():
    global client
    if client:
        client.close()

def get_database() -> Optional[AsyncIOMotorDatabase]:
    return db

def get_documents_collection() -> Optional[AsyncIOMotorCollection]:
    return documents_collection
