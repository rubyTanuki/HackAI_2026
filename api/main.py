from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import HTTPBearer
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

import hashlib
import requests
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

nebula_url="https://api.utdnebula.com/course/sections"

@app.post("/timeline")
async def timeline_endpoint(request: TimelineRequest, user_id: str = Depends(verify_token)):
    all_deadlines = []
    syllabi_to_process = []
    all_syllabus_hashes = []
    
    for syllabus in request.syllabi:
        text_hash = hashlib.sha256(syllabus.encode('utf-8')).hexdigest()
        all_syllabus_hashes.append(text_hash)
        
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
            difficulty = ""
            
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
                
            combined_course = f"{course_prefix}{course_code}".strip()

            # get difficulty and any missed info from nebula
            params = {}
            if course_prefix and course_prefix != "Unknown":
                params["subject_prefix"] = course_prefix
            if course_code and course_code != "Course":
                params["course_number"] = course_code
                
            headers = {
                "x-api-key": os.getenv("NEBULA_API_KEY", "")
            }
            
            try:
                nebula_response = requests.get(nebula_url, params=params, headers=headers, timeout=5)
                if nebula_response.status_code == 200:
                    nebula_data = nebula_response.json().get('data') or []
                    for section in nebula_data:
                        if section.get('section_number') == section_number:
                            distribution = section.get('grade_distribution') or []
                            if distribution and len(distribution) > 0:
                                total_students = sum(distribution)
                                if total_students > 0:
                                    weighted_sum = sum(i * count for i, count in enumerate(distribution))
                                    avg_index = weighted_sum / total_students
                                    
                                    max_index = len(distribution) - 1
                                    difficulty = (avg_index / max_index) * 10.0
                                    difficulty = round(difficulty, 1)
                            break
            except Exception as e:
                print(f"Warning: Nebula request failed: {e}")
                
            
            
            # Inject top-level course info into each deadline for frontend convenience
            for d in new_deadlines:
                d["course"] = combined_course
                d["course_prefix"] = course_prefix
                d["course_code"] = course_code
                d["course_name"] = course_name
                d["section_number"] = section_number
                d["professor_first_name"] = pf_first
                d["professor_last_name"] = pf_last
                if difficulty:
                    d["difficulty"] = difficulty
                
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
                all_deadlines.append(Deadline(**d))

    if all_syllabus_hashes:
        await users_collection.update_one(
            {"_id": user_id},
            {
                "$setOnInsert": {
                    "leaderboard_rank": 0,
                    "study_plan": {
                        "generated_on": None,
                        "tasks": []
                    }
                },
                "$addToSet": {
                    "enrolled_syllabi": {"$each": all_syllabus_hashes}
                }
            },
            upsert=True
        )

    return TimelineResponse(deadlines=all_deadlines)


@app.post("/study_plan")
async def study_plan_endpoint(user_id: str = Depends(verify_token)):
    user_doc = await users_collection.find_one({"_id": user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    enrolled_syllabi = user_doc.get("enrolled_syllabi", [])
    if not enrolled_syllabi:
        return {"tasks": []}
    
    # call gemini with all enrolled syllabi
    all_deadlines = []
    for sid in enrolled_syllabi:
        doc = await syllabi_collection.find_one({"_id": sid})
        if doc and "deadlines" in doc:
            all_deadlines.extend(doc["deadlines"])
            
    if not all_deadlines:
        return {"tasks": []}
        
    study_plan_data = await gemini.generate_studyplan(all_deadlines)
    
    if isinstance(study_plan_data, dict) and study_plan_data.get("status") == "error":
        raise HTTPException(status_code=500, detail=study_plan_data.get("error", "Failed to generate study plan from Gemini"))

    tasks = []
    if hasattr(study_plan_data, "tasks"):
        for t in study_plan_data.tasks:
            t_dict = t.model_dump()
            t_dict["completed"] = False
            tasks.append(t_dict)
    elif isinstance(study_plan_data, dict):
        for t in study_plan_data.get("tasks", []):
            t["completed"] = False
            tasks.append(t)
            
    # save study plan to db
    study_plan_obj = {
        "generated_on": datetime.utcnow().isoformat() + "Z",
        "tasks": tasks
    }
    await users_collection.update_one(
        {"_id": user_id},
        {"$set": {"study_plan": study_plan_obj}}
    )

    # return study plan
    return study_plan_obj
    
