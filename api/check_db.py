import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

async def check_user_doc():
    MONGODB_URL = os.getenv("MONGODB_URL")
    if not MONGODB_URL:
        print("MONGODB_URL not set")
        return

    client = AsyncIOMotorClient(MONGODB_URL)
    db = client.LockedIn
    users_collection = db.users
    
    # Get the latest updated user or a specific one if possible
    # For now, let's just look at the first one
    user = await users_collection.find_one({})
    if user:
        print("--- User Document Keys ---")
        print(list(user.keys()))
        print("--- User Document Content ---")
        # Strip some fields if they are too big, but let's see for now
        print(user)
    else:
        print("No users found in database.")

if __name__ == "__main__":
    asyncio.run(check_user_doc())
