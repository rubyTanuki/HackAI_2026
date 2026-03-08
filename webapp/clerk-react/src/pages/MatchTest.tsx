import React, { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@clerk/react";
import "./MatchTest.css";

type QuizQuestion = {
  question: string;
  options: string[];
  answer?: string;
};

type QuizData = {
  questions?: QuizQuestion[];
  [key: string]: any;
};

export default function MatchTest() {
  const { getToken } = useAuth();

  const [coursePrefix, setCoursePrefix] = useState("MATH");
  const [courseCode, setCourseCode] = useState("3345");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Not Queued");
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [score, setScore] = useState<number>(0);
  const [results, setResults] = useState<any>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>(
    {}
  );

  const pollingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const getHeaders = async () => {
    const token = await getToken();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  const handleQueue = async () => {
    try {
      setStatus("Joining Queue...");
      setResults(null);
      setQuizData(null);
      setSelectedAnswers({});
      setScore(0);

      const res = await fetch(`http://localhost:8000/match/queue`, {
        method: "POST",
        headers: await getHeaders(),
        body: JSON.stringify({
          course_prefix: coursePrefix,
          course_code: courseCode,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to queue");

      setMatchId(data.match_id);
      setStatus(data.status);
      startPollingStatus(data.match_id);
    } catch (e: any) {
      alert(e.message);
      setStatus("Error");
    }
  };

  const handleAbort = async () => {
    if (!matchId) return;

    try {
      await fetch(`http://localhost:8000/match/${matchId}`, {
        method: "DELETE",
        headers: await getHeaders(),
      });

      if (pollingInterval.current) clearInterval(pollingInterval.current);
      setMatchId(null);
      setStatus("Not Queued");
      setQuizData(null);
      setResults(null);
      setSelectedAnswers({});
      setScore(0);
    } catch (e: any) {
      alert("Failed to abort");
    }
  };

  const startPollingStatus = (id: string) => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);

    pollingInterval.current = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8000/match/${id}/status`, {
          headers: await getHeaders(),
        });
        const data = await res.json();
        setStatus(data.status);

        if (data.status === "in_progress") {
          if (pollingInterval.current) clearInterval(pollingInterval.current);
          fetchQuiz(id);
        }
      } catch (e) {
        console.error("Polling error", e);
      }
    }, 3000);
  };

  const fetchQuiz = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:8000/match/${id}/quiz`, {
        headers: await getHeaders(),
      });
      const data = await res.json();
      setQuizData(data);
    } catch (e) {
      console.error("Failed to fetch quiz", e);
    }
  };

  const handleSubmit = async () => {
    if (!matchId) return;

    try {
      setStatus("Score Submitted, waiting for opponent...");
      await fetch(`http://localhost:8000/match/${matchId}/submit`, {
        method: "POST",
        headers: await getHeaders(),
        body: JSON.stringify({ score }),
      });
      startPollingResults(matchId);
    } catch (e) {
      console.error("Submit failed", e);
    }
  };

  const startPollingResults = (id: string) => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);

    pollingInterval.current = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8000/match/${id}/results`, {
          headers: await getHeaders(),
        });
        const data = await res.json();

        if (data.status === "completed") {
          if (pollingInterval.current) clearInterval(pollingInterval.current);
          setResults(data);
          setStatus("Match Finished!");
          fetchRankChange(id);
        }
      } catch (e) {
        console.error("Polling results error", e);
      }
    }, 3000);
  };

  const fetchRankChange = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:8000/match/${id}/rank`, {
        headers: await getHeaders(),
      });
      const rankData = await res.json();
      setResults((prev: any) => ({ ...prev, rank_change: rankData.rank_change }));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    return () => {
      if (pollingInterval.current) clearInterval(pollingInterval.current);
    };
  }, []);

  const questions = useMemo(() => {
    if (!quizData?.questions || !Array.isArray(quizData.questions)) return [];
    return quizData.questions;
  }, [quizData]);

  const progress = useMemo(() => {
    if (!questions.length) return 0;
    return (Object.keys(selectedAnswers).length / questions.length) * 100;
  }, [questions.length, selectedAnswers]);

  const handleSelectAnswer = (questionIndex: number, option: string) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionIndex]: option,
    }));
  };

  const statusClass =
    status === "waiting"
      ? "mt-pill mt-pill--warning"
      : status === "in_progress"
      ? "mt-pill mt-pill--success"
      : status.includes("Submitted")
      ? "mt-pill mt-pill--pink"
      : "mt-pill";

  return (
    <div className="mt-page">
      <div className="mt-shell">
        <div className="mt-topbar">
          <div>
            <p className="mt-kicker">ranked studying</p>
            <h1 className="mt-title">Live Match Tester</h1>
            <p className="mt-subtitle">
              Queue up, get matched, load the quiz, and submit results.
            </p>
          </div>

          <div className={statusClass}>{status}</div>
        </div>

        <div className="mt-queue-card">
          <div className="mt-card-header">
            <div>
              <p className="mt-section-kicker">queue setup</p>
              <h2 className="mt-section-title">Join a match</h2>
            </div>
            <div className="mt-match-id">
              Match ID: <span>{matchId || "None"}</span>
            </div>
          </div>

          <div className="mt-input-row">
            <input
              className="mt-input"
              value={coursePrefix}
              onChange={(e) => setCoursePrefix(e.target.value)}
              placeholder="Prefix (MATH)"
              disabled={status !== "Not Queued" && status !== "Error"}
            />
            <input
              className="mt-input"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              placeholder="Code (3345)"
              disabled={status !== "Not Queued" && status !== "Error"}
            />
          </div>

          <div className="mt-action-row">
            {(status === "Not Queued" || status === "Error") && (
              <button className="mt-btn mt-btn--primary" onClick={handleQueue}>
                Join Queue
              </button>
            )}

            {(status === "waiting" || status === "Joining Queue...") && (
              <button className="mt-btn mt-btn--danger" onClick={handleAbort}>
                Abort Queue
              </button>
            )}
          </div>
        </div>

        <div className="mt-player-row">
          <div className="mt-player-card mt-player-card--you">
            <div className="mt-player-avatar">Y</div>
            <div className="mt-player-meta">
              <div className="mt-player-name">You</div>
              <div className="mt-player-rank">Queued for {coursePrefix} {courseCode}</div>
            </div>
          </div>

          <div className="mt-versus">VS</div>

          <div className="mt-player-card mt-player-card--opp">
            <div className="mt-player-avatar mt-player-avatar--pink">O</div>
            <div className="mt-player-meta">
              <div className="mt-player-name">Opponent</div>
              <div className="mt-player-rank">
                {status === "waiting" || status === "Joining Queue..."
                  ? "Looking for player..."
                  : status === "in_progress" || results
                  ? "Connected"
                  : "Not connected"}
              </div>
            </div>
          </div>
        </div>

       

        {quizData && !results && (
          <>
            <div className="mt-progress-wrap">
              <div
                className="mt-progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-quiz-card">
              <div className="mt-card-header">
                <div>
                  <p className="mt-section-kicker">game started</p>
                  <h2 className="mt-section-title">Quiz Match</h2>
                </div>
                <div className="mt-question-count">
                  {questions.length} question{questions.length === 1 ? "" : "s"}
                </div>
              </div>

              {questions.length > 0 ? (
                <div className="mt-question-list">
                  {questions.map((q, qIndex) => (
                    <div className="mt-question-block" key={qIndex}>
                      <div className="mt-question-badge">
                        Question {qIndex + 1}
                      </div>
                      <h3 className="mt-question-text">{q.question}</h3>

                      <div className="mt-options">
                        {q.options.map((option, optIndex) => {
                          const isSelected = selectedAnswers[qIndex] === option;
                          return (
                            <button
                              key={optIndex}
                              className={`mt-option ${
                                isSelected ? "mt-option--selected" : ""
                              }`}
                              onClick={() => handleSelectAnswer(qIndex, option)}
                              type="button"
                            >
                              <span className="mt-option-letter">
                                {String.fromCharCode(65 + optIndex)}
                              </span>
                              <span className="mt-option-text">{option}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="mt-debug-box">
                  {JSON.stringify(quizData, null, 2)}
                </pre>
              )}

              <div className="mt-submit-card">
                <div>
                  <p className="mt-section-kicker">manual score submit</p>
                  <h3 className="mt-submit-title">Submit your score</h3>
                </div>

                <div className="mt-submit-row">
                  <input
                    className="mt-score-input"
                    type="number"
                    value={score}
                    onChange={(e) => setScore(parseInt(e.target.value || "0", 10))}
                  />
                  <button
                    className="mt-btn mt-btn--pink"
                    onClick={handleSubmit}
                    disabled={status.includes("Submitted")}
                  >
                    Submit Results
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {results && (
          <div
            className={`mt-results-card ${
              results.is_winner
                ? "mt-results-card--win"
                : results.winner === "tie"
                ? "mt-results-card--tie"
                : "mt-results-card--loss"
            }`}
          >
            <div className="mt-results-emoji">
              {results.is_winner
                ? "🏆"
                : results.winner === "tie"
                ? "🤝"
                : "💀"}
            </div>

            <h2 className="mt-results-title">
              {results.is_winner
                ? "You Won!"
                : results.winner === "tie"
                ? "Tie Game!"
                : "You Lost!"}
            </h2>

            <div className="mt-results-grid">
              <div className="mt-results-stat">
                <span className="mt-results-label">Your Score</span>
                <strong>{results.your_score}</strong>
              </div>
              <div className="mt-results-stat">
                <span className="mt-results-label">Opponent Score</span>
                <strong>{results.opponent_score}</strong>
              </div>
              <div className="mt-results-stat">
                <span className="mt-results-label">Rank Change</span>
                <strong>
                  {results.rank_change !== undefined && results.rank_change !== null
                    ? results.rank_change > 0
                      ? `+${results.rank_change}`
                      : results.rank_change
                    : "Calculating..."}
                </strong>
              </div>
            </div>

            <button
              className="mt-btn mt-btn--primary"
              onClick={() => window.location.reload()}
            >
              Play Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}