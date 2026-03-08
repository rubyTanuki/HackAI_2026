from fastapi import FastAPI, Depends
from fastapi.security import HTTPBearer
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

load_dotenv()

import hashlib
from clerk import verify_token
from mongo import users_collection, syllabi_collection
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
<<<<<<< Updated upstream
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
=======
    all_deadlines = []
    syllabi_to_process = []
    
    for syllabus in request.syllabi:
        text_hash = hashlib.sha256(syllabus.encode('utf-8')).hexdigest()
        
        cached_doc = await syllabi_collection.find_one({"_id": text_hash})
        if cached_doc:
            for d in cached_doc.get("deadlines", []):
                all_deadlines.append(Deadline(**d))
        else:
            syllabi_to_process.append((syllabus, text_hash))
            
    if syllabi_to_process:
        texts = [s[0] for s in syllabi_to_process]
        gemini_responses = await gemini.parse_syllabi(texts)
        
        for (syllabus, text_hash), response in zip(syllabi_to_process, gemini_responses):
            new_deadlines = []
            course_prefix = "Unknown"
            course_code = "Course"
            course_name = ""
            section_number = ""
            pf_first = ""
            pf_last = ""
            
            # response could be a dict (on error) or a Pydantic Syllabus object
            if isinstance(response, dict):
                new_deadlines = response.get("deadlines", [])
                course_prefix = response.get("course_prefix", "Unknown")
                course_code = response.get("course_code", "Course")
                course_name = response.get("course_name", "")
                section_number = response.get("section_number", "")
                pf_first = response.get("professor_first_name", "")
                pf_last = response.get("professor_last_name", "")
            elif hasattr(response, "deadlines"):
                new_deadlines = [d.model_dump() for d in response.deadlines]
                course_prefix = getattr(response, "course_prefix", "Unknown")
                course_code = getattr(response, "course_code", "Course")
                course_name = getattr(response, "course_name", "")
                section_number = getattr(response, "section_number", "")
                pf_first = getattr(response, "professor_first_name", "")
                pf_last = getattr(response, "professor_last_name", "")
                
            combined_course = f"{course_prefix} {course_code}".strip()
            
            # Inject top-level course info into each deadline for frontend convenience
            for d in new_deadlines:
                d["course"] = combined_course
                d["course_prefix"] = course_prefix
                d["course_code"] = course_code
                d["course_name"] = course_name
                d["section_number"] = section_number
                d["professor_first_name"] = pf_first
                d["professor_last_name"] = pf_last
                
            if new_deadlines or not isinstance(response, dict) or "error" not in response:
                # cache it even if empty to avoid calling gemini multiple times for bad text
                await syllabi_collection.insert_one({
                    "_id": text_hash, 
                    "course_prefix": course_prefix,
                    "course_code": course_code,
                    "course_name": course_name,
                    "section_number": section_number,
                    "professor_first_name": pf_first,
                    "professor_last_name": pf_last,
                    "deadlines": new_deadlines
                })
                
            for d in new_deadlines:
>>>>>>> Stashed changes
                all_deadlines.append(Deadline(**d))
            elif hasattr(d, 'model_dump'):
                all_deadlines.append(Deadline(**d.model_dump()))
            else:
                all_deadlines.append(d)

    return TimelineResponse(deadlines=all_deadlines)
