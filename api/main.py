from fastapi import FastAPI, Depends
from fastapi.security import HTTPBearer
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

load_dotenv()

from clerk import verify_token
from mongo import users_collection
from models import TimelineRequest, TimelineResponse, Deadline
from gemini import GeminiClient

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

gemini = GeminiClient()

@app.post("/timeline")
async def timeline_endpoint(request: TimelineRequest, user_id: str = Depends(verify_token)):
    gemini_responses = await gemini.parse_syllabi(request.syllabi)
    
    all_deadlines = []
    for response in gemini_responses:
        # Handle both dict and Pydantic model returns
        if hasattr(response, 'deadlines'):
            deadlines = response.deadlines
        elif isinstance(response, dict) and "deadlines" in response:
            deadlines = response["deadlines"]
        else:
            continue

        for d in deadlines:
            if isinstance(d, dict):
                all_deadlines.append(Deadline(**d))
            elif hasattr(d, 'model_dump'):
                all_deadlines.append(Deadline(**d.model_dump()))
            else:
                all_deadlines.append(d)

    return TimelineResponse(deadlines=all_deadlines)
