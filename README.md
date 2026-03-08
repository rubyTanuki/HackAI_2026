[Locked In Logo] (Locked_In.png)

Welcome to our project for HackAI 2026! 

This platform redefines the university study experience by leveraging Large Language Models to automatically organize a student's entire semester and gamifying the learning process through a live, competitive matchmaking system.

## The Vision

University students waste countless hours cross-referencing half a dozen disorganized PDF syllabi to figure out what they need to study and when. 

Our platform solves this by:
1. Instantly parsing every syllabus a student uploads.
2. Generating a master chronological timeline of deadlines.
3. Automatically querying university APIs to assign difficulty ratings based on historical grade distributions.
4. Using Gemini 2.5 Pro to create a granular, day-by-day study plan.

**And the best part?** Students can queue up in a live, Ranked Matchmaking system against other students taking the exact same class, competing in AI-generated quizzes over the exact material they are currently learning in lecture that week.

## Architecture

This is a monolithic repository containing two core segments:

### `/api` (Backend)
A high-performance Python **FastAPI** application connected to **MongoDB**.
- Authenticates users securely via Clerk JWTs.
- Features an abstracted `GeminiClient` utilizing both `gemini-2.5-flash` (for fast data extraction and quiz generation) and `gemini-2.5-pro` (for deep study-plan reasoning).
- Houses the entire HTTP-polling Multiplayer Matchmaking engine, complete with live status tracking, cross-referenced syllabus topic generation, and a localized per-class Elo system.
- See `/api/README.md` for local setup instructions!

### `/webapp/clerk-react` (Frontend)
A modern, responsive Single Page Application built with **React**, **Vite**, and **Tailwind CSS**.
- Leverages Clerk for rapid, secure user authentication.
- Parses PDF and DOCX files entirely client-side (using `pdf.js` and `mammoth`) before sending pure text to the backend, drastically reducing server costs.
- Dynamically renders chronological timelines, daily study plans, and live global/local Elo leaderboards using React Router.
- Features an isolated Matchmaking Arena (`/#match`) where users can queue, view live poll updates, take their AI-generated quizzes, and watch their rank go up in real time!

## Getting Started

To run the full stack locally, you will need two terminal windows:

**Terminal 1 (Backend API)**
```bash
cd api
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

**Terminal 2 (Frontend React App)**
```bash
cd webapp/clerk-react
npm install
npm run dev
```

*(Ensure you have populated the `.env` files in both directories according to their respective requirements!)*
