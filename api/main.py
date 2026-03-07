from fastapi import FastAPI, Depends
from fastapi.security import HTTPBearer
import os
from dotenv import load_dotenv

load_dotenv()

from clerk import verify_token
from mongo import users_collection
from models import TimelineRequest, TimelineResponse, Deadline
from gemini import GeminiClient

app = FastAPI()
security = HTTPBearer()

gemini = GeminiClient()

@app.post("/timeline")
async def timeline_endpoint(request: TimelineRequest, user_id: str = Depends(verify_token)):
    gemini_responses = await gemini.parse_syllabi(request.syllabi)
    
    all_deadlines = []
    for response in gemini_responses:
        if "deadlines" in response:
            for d in response["deadlines"]:
                # Ensure we construct Pydantic 'Deadline' objects from the dictionary
                all_deadlines.append(Deadline(**d))

    return TimelineResponse(deadlines=all_deadlines)
