import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import sys
import os

# Add the current directory to sys.path to import local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import timeline_endpoint, get_user_courses
from models import TimelineRequest

async def test_course_flow():
    print("Starting verification of course flow...")
    
    # Mock data
    mock_user_id = "test_user_456"
    mock_request = TimelineRequest(
        syllabi=[],
        courses=["CS 1337", "MATH 2414"]
    )
    
    # Mock documents
    mock_user_doc = {
        "_id": mock_user_id,
        "courses": ["CS 1337", "MATH 2414"],
        "enrolled_syllabi": ["hash1"]
    }
    
    mock_syllabus_doc = {
        "_id": "hash1",
        "course_prefix": "PHYS",
        "course_code": "2325",
        "course_name": "Mechanics"
    }
    
    # Mock dependencies
    with patch("main.users_collection") as mock_users, \
         patch("main.syllabi_collection") as mock_syllabi, \
         patch("main.GeminiClient") as mock_gemini:
        
        mock_users.update_one = AsyncMock()
        mock_syllabi.find_one = AsyncMock(return_value=None)
        mock_syllabi.insert_one = AsyncMock()
        
        print("--- Testing timeline_endpoint persistence ---")
        await timeline_endpoint(mock_request, user_id=mock_user_id)
        
        assert mock_users.update_one.called
        update_arg = mock_users.update_one.call_args[0][1]
        assert "courses" in update_arg["$addToSet"]
        assert update_arg["$addToSet"]["courses"] == {"$each": mock_request.courses}
        print("✅ timeline_endpoint correctly saves manual courses.")

        # 2. Test Retrieval in get_user_courses
        mock_users.find_one = AsyncMock(return_value=mock_user_doc)
        
        def find_one_side_effect(query):
            if query.get("_id") == "hash1":
                return mock_syllabus_doc
            return None
            
        mock_syllabi.find_one.side_effect = find_one_side_effect
        
        print("--- Testing get_user_courses retrieval ---")
        response = await get_user_courses(user_id=mock_user_id)
        
        courses = response.get("courses", [])
        print(f"Retrieved courses: {courses}")
        
        # Should have PHYS 2325 (from syllabus) and CS 1337, MATH 2414 (from manual)
        prefixes = [c["course_prefix"] for c in courses]
        assert "PHYS" in prefixes
        assert "CS" in prefixes
        assert "MATH" in prefixes
        assert len(courses) == 3
        
        print("✅ get_user_courses correctly aggregates and formats courses.")

if __name__ == "__main__":
    asyncio.run(test_course_flow())
Line: 71
