from fastapi import FastAPI, Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import jwt
from motor.motor_asyncio import AsyncIOMotorClient
from typing import List

app = FastAPI()
security = HTTPBearer()

import os
from dotenv import load_dotenv

load_dotenv()

CLERK_JWKS_URL = "https://new-asp-32.clerk.accounts.dev/.well-known/jwks.json"

MONGODB_URL = os.getenv("MONGODB_URL")
if not MONGODB_URL:
    raise RuntimeError("MONGODB_URL is not set in the environment")

client = AsyncIOMotorClient(MONGODB_URL)
db = client.LockedIn
users_collection = db.users

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        unverified_payload = jwt.decode(token, options={"verify_signature": False})
        user_id = unverified_payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing subject")
        return user_id
    except jwt.DecodeError:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

class TimelineRequest(BaseModel):
    syllabi: List[str]

class TimelineResponse(BaseModel):
    deadlines: List[Deadline]

class Deadline(BaseModel):
    course: str
    title: str
    type: str
    due_date: str
    points: int
    weight: float


@app.post("/timeline")
async def timeline_endpoint(request: TimelineRequest, user_id: str = Depends(verify_token)):
    deadlines = []
    counter = 0
    for syllabus in request.syllabi:
        deadlines.append(
            Deadline(
                course="CS 101",
                title=f"Homework {counter}",
                type="Homework",
                due_date=f"2022-01-{10 + counter}",
                points=10,
                weight=0.1
            )
        )
        counter += 1
    return TimelineResponse(deadlines = deadlines)
