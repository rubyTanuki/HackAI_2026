import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import sys
import os

# Add the current directory to sys.path to import local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import timeline_endpoint
from models import TimelineRequest

async def test_timeline_persistence():
    print("Starting verification of timeline persistence...")
    
    # Mock data
    mock_user_id = "test_user_123"
    mock_request = TimelineRequest(
        syllabi=[],
        courses=["CS 1337", "MATH 2414"]
    )
    
    # Mock dependencies
    with patch("main.users_collection") as mock_users_collection, \
         patch("main.syllabi_collection") as mock_syllabi_collection, \
         patch("main.GeminiClient") as mock_gemini_client_class:
        
        mock_users_collection.update_one = AsyncMock()
        mock_syllabi_collection.find_one = AsyncMock(return_value=None)
        
        # Call the endpoint
        print(f"Calling timeline_endpoint with user_id: {mock_user_id} and courses: {mock_request.courses}")
        await timeline_endpoint(mock_request, user_id=mock_user_id)
        
        # Verify users_collection.update_one was called with the correct data
        print("Verifying users_collection.update_one call...")
        assert mock_users_collection.update_one.called
        
        args, kwargs = mock_users_collection.update_one.call_args
        filter_arg = args[0]
        update_arg = args[1]
        
        assert filter_arg == {"_id": mock_user_id}
        assert "$addToSet" in update_arg
        assert "courses" in update_arg["$addToSet"]
        assert update_arg["$addToSet"]["courses"] == {"$each": mock_request.courses}
        
        print("✅ SUCCESS: Manual courses are correctly added to set in MongoDB update operation.")

if __name__ == "__main__":
    asyncio.run(test_timeline_persistence())
