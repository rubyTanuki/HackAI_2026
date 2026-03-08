import asyncio
import json
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
import time
from typing import List
import os

# from models import Deadline

class Deadline(BaseModel):
    title: str = Field(description="Title of the deadline")
    type: str = Field(description="Type of the deadline (e.g. Homework, Exam, Project)")
    due_date: str = Field(description="Due date in YYYY-MM-DD format")
    points: int = Field(description="Points for the deadline (default to 100 if not specified)")
    weight: float = Field(description="Weight of the deadline (default to 1.0 if not specified)")

class Syllabus(BaseModel):
    course_prefix: str = Field(description="Course prefix (e.g. MATH, CS, HIST). If the prefix has a /, choose the first of the options.")
    course_code: str = Field(description="Course code/number (e.g. 3345, 2414)")
    section_number: str = Field(description="Section number (e.g. 004, 501)")
    course_name: str = Field(description="Course name (e.g. Discrete Mathematics, Calculus II)")
    professor_first_name: str = Field(description="Professor's first name")
    professor_last_name: str = Field(description="Professor's last name")
    deadlines: List[Deadline] = Field(description="List of deadlines extracted from the syllabus")

class GeminiClient:
    def __init__(self):
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        self.semaphore = asyncio.Semaphore(10)
    
    async def parse_syllabi(self, syllabi: List[str]) -> dict:
        return await asyncio.gather(*[self.parse_syllabus(syllabus) for syllabus in syllabi])

    async def parse_syllabus(self, syllabus: str) -> dict:
        model_name = "gemini-2.5-pro"

        system_prompt = """You are a helpful assistant that parses syllabi and extracts deadlines.
        Extract from the syllabus every single assignment, exam, quiz, project, etc. that is due.
        If the assignment is recurring, such as a weekly homework assignment, include all the recurrances seperately as individual 'due dates'.
        Assume the first day of class was January 20th, 2026.
        DO NOT MISS ANY ASSIGNMENTS. A CLASS WILL NOT ONLY HAVE EXAMS.
        Identify the course prefix, course code, section number, full course name, and the professor's first and last name. Attach them to the response object along with the deadlines for all assignments.
        Return the deadlines in JSON format with the following fields:
        title: str
        type: str
        due_date: str
        points: int
        weight: float
        """

        input_data = {
            "syllabus": syllabus
        }

        start_time = time.perf_counter()
        print("Generating Syllabus...")
        
        max_retries = 3
        base_delay = 2
        
        async with self.semaphore:
            for attempt in range(max_retries):
                try: 
                    response = await self.client.aio.models.generate_content(
                        model=model_name,
                        contents=json.dumps(input_data),
                        config=types.GenerateContentConfig(
                            system_instruction=system_prompt,
                            response_mime_type="application/json",
                            response_schema=Syllabus.model_json_schema(),
                            temperature=0.2,
                            max_output_tokens=8192
                        )
                    )
                    end_time = time.perf_counter()
                    elapsed_time = end_time - start_time
                    print(f"✅ Generated Syllabus in {elapsed_time:.4f} seconds.")
                    
                    parsed_data = response.parsed
                    
                    return parsed_data
                    
                except Exception as e:
                    error_str = str(e)
                    if "503" in error_str or "429" in error_str:
                        if attempt < max_retries - 1:
                            sleep_time = base_delay * (2 ** attempt)
                            print(f"⏳ Server busy (503/429). Retrying in {sleep_time}s...")
                            await asyncio.sleep(sleep_time)
                            continue 
                            
                    return {
                        "syllabus": syllabus,
                        "error": error_str,
                        "status": "error"
                    }
