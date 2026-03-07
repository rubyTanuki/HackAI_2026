from pydantic import BaseModel
from typing import List

class Deadline(BaseModel):
    course: str
    title: str
    type: str
    due_date: str
    points: int
    weight: float

class TimelineRequest(BaseModel):
    syllabi: List[str]

class TimelineResponse(BaseModel):
    deadlines: List[Deadline]