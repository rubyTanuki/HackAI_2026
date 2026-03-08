import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URL = os.getenv("MONGODB_URL")
if not MONGODB_URL:
    raise RuntimeError("MONGODB_URL is not set in the environment")

client = AsyncIOMotorClient(MONGODB_URL)
db = client.LockedIn
users_collection = db.users
syllabi_collection = db.syllabi