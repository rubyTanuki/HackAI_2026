from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import HTTPBearer
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

import hashlib
import requests
import random
import re
import io
import PyPDF2
from bson import ObjectId
from clerk import verify_token
from mongo import users_collection, syllabi_collection, matches_collection
from models import TimelineRequest, TimelineResponse, Deadline, MatchQueueRequest, MatchSubmitRequest
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
    courses_url="https://api.utdnebula.com/course"
    uris = []
    for course in request.courses:
        print(f"Querying Nebula for {course} Syllabus...")
        match = re.search(r"([A-Za-z]+)[\s-]*(\d{4})", course)
        if not match:
            print(f"Skipping incorrectly formatted course string: {course}")
            continue
            
        course_prefix = match.group(1).upper()
        course_code = match.group(2)

        best_year = 0
        best_year_id=""
        
        params = {
            "subject_prefix": course_prefix,
            "course_number": course_code
        }
                
        headers = {
            "x-api-key": os.getenv("NEBULA_API_KEY", "")
        }
            
        try:
            nebula_response = requests.get(courses_url, params=params, headers=headers, timeout=5)
            if nebula_response.status_code == 200:
                nebula_data = nebula_response.json().get('data') or []
                for section in nebula_data:
                    year = int(section.get('catalog_year'))
                    if year and year > best_year:
                        best_year = year
                        best_year_id = section.get('_id')
        except Exception as e:
            print(f"Warning: Nebula request failed: {e}")

        if best_year_id:
            section_url=f"https://api.utdnebula.com/course/{best_year_id}/sections"
            try:
                course_response = requests.get(section_url, params=params, headers=headers, timeout=5)
                if course_response.status_code == 200:
                    course_data = course_response.json().get('data') or []
                    for section in course_data:
                        uri = section.get('syllabus_uri')
                        if uri:
                            uris.append(uri)
                            break
            except Exception as e:
                print(f"Warning: Nebula request failed: {e}")
        
    for uri in uris:
        try:
            res = requests.get(uri, timeout=10)
            if res.status_code == 200:
                reader = PyPDF2.PdfReader(io.BytesIO(res.content))
                text = ""
                for page in reader.pages:
                    extracted = page.extract_text()
                    if extracted:
                        text += extracted + "\n"
                request.syllabi.append(text)
        except Exception as e:
            print(f"Warning: Failed to parse syllabus at {uri}: {e}")
    
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
            if hasattr(response, "model_dump"):
                syllabus_data = response.model_dump()
            else:
                syllabus_data = response if isinstance(response, dict) else {}
                
            new_deadlines = syllabus_data.get("deadlines", [])
            course_prefix = syllabus_data.get("course_prefix", "Unknown")
            course_code = syllabus_data.get("course_code", "Course")
            course_name = syllabus_data.get("course_name", "")
            section_number = syllabus_data.get("section_number", "")
            pf_first = syllabus_data.get("professor_first_name", "")
            pf_last = syllabus_data.get("professor_last_name", "")
            
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
            
            difficulty = ""
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
                
            if new_deadlines or "error" not in syllabus_data:
                # Add difficulty and ID for caching, and save ALL extracted fields (including topics!)
                syllabus_data["_id"] = text_hash
                if difficulty:
                    syllabus_data["difficulty"] = difficulty
                syllabus_data["deadlines"] = new_deadlines
                
                await syllabi_collection.insert_one(syllabus_data)
                
            for d in new_deadlines:
                all_deadlines.append(Deadline(**d))

    if all_syllabus_hashes:
        await users_collection.update_one(
            {"_id": user_id},
            {
                "$setOnInsert": {
                    "leaderboard_rank": 0,
                    "elo": {"global_avg": 500},
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
        
    # Return cached study plan if it already exists
    existing_plan = user_doc.get("study_plan")
    if existing_plan and existing_plan.get("tasks") and len(existing_plan.get("tasks")) > 0:
        print("Returning cached study plan")
        return existing_plan
    
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

@app.post("/match/queue")
async def match_queue_endpoint(request: MatchQueueRequest, user_id: str = Depends(verify_token)):
    # Look for someone waiting in the same class
    match = await matches_collection.find_one({
        "status": "waiting",
        "course_prefix": request.course_prefix,
        "course_code": request.course_code
    })
    
    if match:
        if match["player1"] == user_id:
            return {"match_id": str(match["_id"]), "status": "waiting"}
            
        await matches_collection.update_one(
            {"_id": match["_id"]},
            {"$set": {"player2": user_id, "status": "in_progress"}}
        )
        return {"match_id": str(match["_id"]), "status": "in_progress"}
        
    # No one waiting, create a new match lobby
    new_match = await matches_collection.insert_one({
        "status": "waiting",
        "course_prefix": request.course_prefix,
        "course_code": request.course_code,
        "player1": user_id,
        "player2": None,
        "player1_score": None,
        "player2_score": None,
        "quiz_data": None
    })
    return {"match_id": str(new_match.inserted_id), "status": "waiting"}

@app.delete("/match/{match_id}")
async def match_abort_endpoint(match_id: str, user_id: str = Depends(verify_token)):
    try:
        match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid match ID format")
        
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
        
    if match["status"] != "waiting":
        raise HTTPException(status_code=400, detail="Cannot abort a match that has already started")
        
    if match["player1"] != user_id:
        raise HTTPException(status_code=403, detail="Not the host of this match")
        
    await matches_collection.delete_one({"_id": ObjectId(match_id)})
    return {"message": "Match aborted and removed from queue"}

@app.get("/match/{match_id}/status")
async def match_status_endpoint(match_id: str, user_id: str = Depends(verify_token)):
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
        
    return {
        "status": match["status"],
        "player1": match["player1"],
        "player2": match.get("player2")
    }

@app.get("/match/{match_id}/quiz")
async def match_quiz_endpoint(match_id: str, user_id: str = Depends(verify_token)):
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
        
    if match.get("quiz_data"):
        return match["quiz_data"]
        
    # PLACEHOLDER GEMINI CALL
    course_prefix = match.get("course_prefix")
    course_code = match.get("course_code")
    
    syllabus = await syllabi_collection.find_one({
        "course_prefix": course_prefix,
        "course_code": course_code
    })
    
    topic_name = "General Knowledge"
    course_name = f"{course_prefix} {course_code}"
    
    if syllabus:
        course_name = syllabus.get("course_name", course_name)
        topics = syllabus.get("topics", [])
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        valid_topics = []
        for t in topics:
            est_date = t.get("estimated_date", "")
            if est_date and est_date <= today:
                valid_topics.append(t.get("name"))
                
        if valid_topics:
            topic_name = random.choice(valid_topics)
        elif topics:
            topic_name = random.choice(topics).get("name")
            
    quiz_data = await gemini.generate_quiz(topic=topic_name, course=course_name, questions=5)
    
    if not quiz_data or "error" in quiz_data:
        raise HTTPException(status_code=500, detail="Failed to generate match quiz")
    
    await matches_collection.update_one(
        {"_id": ObjectId(match_id)},
        {"$set": {"quiz_data": quiz_data}}
    )
    
    return quiz_data

@app.post("/match/{match_id}/submit")
async def match_submit_endpoint(match_id: str, request: MatchSubmitRequest, user_id: str = Depends(verify_token)):
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
        
    update_data = {}
    if match["player1"] == user_id:
        update_data["player1_score"] = request.score
    elif match.get("player2") == user_id:
        update_data["player2_score"] = request.score
    else:
        raise HTTPException(status_code=403, detail="Not a player in this match")
        
    await matches_collection.update_one(
        {"_id": ObjectId(match_id)},
        {"$set": update_data}
    )
    
    # Check if both players have now finished
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if match.get("player1_score") is not None and match.get("player2_score") is not None:
        await matches_collection.update_one(
            {"_id": ObjectId(match_id)},
            {"$set": {"status": "completed"}}
        )
        
    return {"message": "Score submitted"}

@app.get("/match/{match_id}/results")
async def match_results_endpoint(match_id: str, user_id: str = Depends(verify_token)):
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
        
    if match["status"] != "completed":
        return {"status": "waiting_for_opponent"}
        
    p1_score = match.get("player1_score", 0)
    p2_score = match.get("player2_score", 0)
    
    winner = "tie"
    if p1_score > p2_score:
        winner = match["player1"]
    elif p2_score > p1_score:
        winner = match["player2"]
        
    return {
        "status": "completed",
        "your_score": p1_score if match["player1"] == user_id else p2_score,
        "opponent_score": p2_score if match["player1"] == user_id else p1_score,
        "winner": winner,
        "is_winner": winner == user_id
    }

@app.get("/match/{match_id}/rank")
async def match_rank_endpoint(match_id: str, user_id: str = Depends(verify_token)):
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match or match["status"] != "completed":
        return {"rank_change": 0}
        
    p1_score = match.get("player1_score", 0)
    p2_score = match.get("player2_score", 0)
    
    if p1_score == p2_score:
        change = 5
    else:
        is_p1 = match["player1"] == user_id
        if (is_p1 and p1_score > p2_score) or (not is_p1 and p2_score > p1_score):
            change = 15
        else:
            change = -10
            
    # Update per-class Elo safely handling 500-point defaults
    course_key = f"{match.get('course_prefix', 'UNKNOWN')}_{match.get('course_code', '0000')}".replace(' ', '_')
    
    user_doc = await users_collection.find_one({"_id": user_id})
    user_elo = user_doc.get("elo", {}) if user_doc else {}
    
    current_class_elo = user_elo.get(course_key, 500)
    current_global_elo = user_elo.get("global_avg", 500)
    
    await users_collection.update_one(
        {"_id": user_id},
        {"$set": {
            f"elo.{course_key}": current_class_elo + change,
            "elo.global_avg": current_global_elo + change
        }}
    )
    
    return {"rank_change": change}

@app.get("/leaderboard/local/{course_prefix}/{course_code}")
async def get_class_leaderboard(course_prefix: str, course_code: str):
    course_key = f"{course_prefix}_{course_code}".replace(' ', '_')
    # Fetch top 50 users who have an active rank in this specific class
    cursor = users_collection.find({f"elo.{course_key}": {"$exists": True}}).sort(f"elo.{course_key}", -1).limit(50)
    users = await cursor.to_list(length=50)
    
    leaderboard = []
    for u in users:
        leaderboard.append({
            "username": u.get("username", "Unknown"),
            "elo": u.get("elo", {}).get(course_key, 500)
        })
        
    return {"course": f"{course_prefix} {course_code}", "leaderboard": leaderboard}

@app.get("/leaderboard/global")
async def get_global_leaderboard():
    # Fetch top 50 users globally
    cursor = users_collection.find({"elo.global_avg": {"$exists": True}}).sort("elo.global_avg", -1).limit(50)
    users = await cursor.to_list(length=50)
    
    leaderboard = []
    for u in users:
        leaderboard.append({
            "username": u.get("username", "Unknown"),
            "elo": u.get("elo", {}).get("global_avg", 500)
        })
        
    return {"leaderboard": leaderboard}
    
