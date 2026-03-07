from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class TestRequest(BaseModel):
    data: str

@app.post("/test")
async def test_endpoint(request: TestRequest):
    return {"message": "Placeholder endpoint", "received": request.data}
