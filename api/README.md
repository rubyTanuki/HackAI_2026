# HackAI 2026 Backend API (FastAPI)

The core brain of the HackAI 2026 competitive study platform. Built on **FastAPI** and **MongoDB**, this server acts as the primary orchestrator between the React frontend, Clerk Identity verification, the UTD Nebula API, and Google's Gemini 2.5 AI models.

## Core Features

- **Syllabus Parsing Pipeline (`/timeline`)**: Ingests raw text from uploaded PDFs/Docs, hashes them to prevent duplicate Gemini inferences, and extracts every chronological deadline, grading weight, and curriculum unit using `gemini-2.5-flash`.
- **Nebula Difficulty Engine**: Automatically recognizes UTD course prefixes and section numbers, querying the Nebula API for historical grade distributions to seamlessly append a "difficulty" rating to every assignment.
- **AI Study Planner (`/study_plan`)**: Evaluates a student's entire aggregated timeline of deadlines and uses `gemini-2.5-pro` to generate a structured, day-by-day study roadmap.
- **Competitive Matchmaking Queue (`/match/...`)**: 
  - A comprehensive HTTP-polling matchmaking system.
  - Matches students queuing for the exact same `course_code`.
  - Dynamically reads the cached chronological *topics* from that class's syllabus to guarantee fairness (only selecting units taught *before* the current date).
  - Uses `gemini-2.5-flash` to instantly spawn a competitive, context-aware multiple-choice quiz sent to both players.
- **Dynamic Elo & Leaderboards (`/leaderboard/...`)**: Tracks a comprehensive dictionary of per-class Elo ratings for every user, updating dynamically after every match and calculating true Global Averages. Serves both global and local-class leaderboards.

## Environment Variables

The backend relies on several external services. Create an `.env` file in this directory and populate the following keys:

```env
GEMINI_API_KEY="your_google_gemini_api_key_here"
MONGODB_URL="your_mongodb_cluster_connection_string"
NEBULA_API_KEY="your_utd_nebula_api_key"
CLERK_SECRET_KEY="your_clerk_secret_key"
CLERK_JWKS_URL="your_clerk_jwks_url_for_jwt_verification"
```

## Running the Server

1. **Activate the Virtual Environment**: 
   ```bash
   source venv/bin/activate
   ```
2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
3. **Run the Development Server**:
   ```bash
   uvicorn main:app --reload
   ```

The API will be available at `http://localhost:8000`. You can test endpoints via the interactive Swagger UI at `http://localhost:8000/docs`.
