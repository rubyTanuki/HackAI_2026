from pydantic import BaseModel
from typing import List

class Deadline(BaseModel):
    course: str
    course_name: str | None = None
    course_prefix: str | None = None
    course_code: str | None = None
    section_number: str | None = None
    professor_first_name: str | None = None
    professor_last_name: str | None = None
    difficulty: float | None = None
    title: str
    type: str
    due_date: str
    points: int
    weight: float

class TimelineRequest(BaseModel):
    syllabi: List[str]
    courses: List[str]

class TimelineResponse(BaseModel):
    deadlines: List[Deadline]

class MatchQueueRequest(BaseModel):
    course_prefix: str
    course_code: str
    
class MatchSubmitRequest(BaseModel):
    score: int