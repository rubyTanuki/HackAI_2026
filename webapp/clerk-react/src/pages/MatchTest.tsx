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
  const [mode, setMode] = useState<"quiz" | "memory" | "random">("random");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Not Queued");
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [score, setScore] = useState<number>(0);
  const [results, setResults] = useState<any>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>(
    {}
  );
  const [selectedCards, setSelectedCards] = useState<number[]>([]);

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
          mode: mode,
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
        if (data.mode) setMode(data.mode);

        if (data.status === "in_progress") {
          if (data.mode === "memory") {
            startPollingMemoryGame(id);
          } else {
            fetchQuiz(id);
          }
        }
      } catch (e) {
        console.error("Polling error", e);
      }
    }, 3000);
  };

  const startPollingMemoryGame = (id: string) => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);

    pollingInterval.current = setInterval(async () => {
      try {
        const sRes = await fetch(`http://localhost:8000/match/${id}/status`, { headers: await getHeaders() });
        const sData = await sRes.json();
        setStatus(sData.status);
        if (sData.mode) setMode(sData.mode);

        if (sData.status === "completed") {
          startPollingResults(id);
          return;
        }

        const qRes = await fetch(`http://localhost:8000/match/${id}/quiz`, { headers: await getHeaders() });
        if (qRes.ok) {
          const qData = await qRes.json();
          setQuizData(qData);
        }
      } catch (e) {
        console.error("Polling memory game error", e);
      }
    }, 2500);
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

    let computedScore = 0;
    let totalQuestions = 5;

    if (quizData?.questions && Array.isArray(quizData.questions)) {
      totalQuestions = quizData.questions.length;
      quizData.questions.forEach((q, index) => {
        // The backend Pydantic schema returns an integer index for the answer
        if (q.answer !== undefined && q.options && selectedAnswers[index] === q.options[q.answer as unknown as number]) {
          computedScore++;
        }
      });
    }

    try {
      setStatus("Score Submitted, waiting for opponent...");
      await fetch(`http://localhost:8000/match/${matchId}/submit`, {
        method: "POST",
        headers: await getHeaders(),
        body: JSON.stringify({ score: computedScore, total: totalQuestions }),
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

  const { userId } = useAuth();
  const [seenActionId, setSeenActionId] = useState<number | null>(null);

  useEffect(() => {
    if (quizData?.last_action && quizData.last_action.player !== userId) {
      if (quizData.last_action.id !== seenActionId) {
        const timer = setTimeout(() => {
          setSeenActionId(quizData.last_action.id);
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [quizData?.last_action, userId, seenActionId]);

  const handleCardClick = async (cardId: number) => {
    if (!quizData || !matchId) return;
    if (quizData.turn !== userId) return;
    if (selectedCards.length >= 2) return;
    if (selectedCards.includes(cardId)) return;

    // Find card to ensure it's not already matched
    const card = quizData.board?.find((c: any) => c.id === cardId);
    if (!card || card.state !== "hidden") return;

    const newSelection = [...selectedCards, cardId];
    setSelectedCards(newSelection);

    if (newSelection.length === 2) {
      // Submit Turn
      try {
        const res = await fetch(`http://localhost:8000/match/${matchId}/turn`, {
          method: "POST",
          headers: await getHeaders(),
          body: JSON.stringify({ card1_id: newSelection[0], card2_id: newSelection[1] })
        });
        const _data = await res.json();

        // Clear local selection after a delay to allow polling to sync board state
        setTimeout(() => {
          setSelectedCards([]);
        }, 800);
      } catch (e) {
        console.error(e);
        setSelectedCards([]);
      }
    }
  };

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
            <h1 className="mt-title">Lock'o'clock</h1>
            <p className="mt-subtitle">
              Queue up, get matched, and test your knowledge.
            </p>
          </div>

          <div className={statusClass}>{status}</div>
        </div>

        {status !== "in_progress" && !status.includes("Submitted") && !results && (
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
              />
            </div>

            <div className="mt-action-row" style={{ marginTop: "16px", marginBottom: "16px", display: "flex", gap: "8px" }}>
              <button
                className={`mt-btn ${mode === "random" ? "mt-btn--primary" : ""}`}
                onClick={() => setMode("random")}
                disabled={status !== "Not Queued" && status !== "Error"}
              >
                Any Mode
              </button>
              <button
                className={`mt-btn ${mode === "quiz" ? "mt-btn--primary" : ""}`}
                onClick={() => setMode("quiz")}
                disabled={status !== "Not Queued" && status !== "Error"}
              >
                Quiz Mode
              </button>
              <button
                className={`mt-btn ${mode === "memory" ? "mt-btn--pink" : ""}`}
                onClick={() => setMode("memory")}
                disabled={status !== "Not Queued" && status !== "Error"}
              >
                Memory Mode
              </button>
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
        )}

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
                              className={`mt-option ${isSelected ? "mt-option--selected" : ""
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
              ) : quizData?.board ? (
                <div style={{ padding: "24px" }}>
                  <div style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ fontSize: "1.2rem", fontWeight: "600" }}>
                      {quizData.turn === userId ? "🟢 Your Turn!" : "⏳ Opponent's Turn..."}
                    </h3>
                    <div style={{ display: "flex", gap: "16px", fontSize: "1.1rem" }}>
                      <span><strong>You:</strong> {quizData.scores?.[userId || ""] || 0} matches</span>
                    </div>
                  </div>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: "16px"
                  }}>
                    {quizData.board.map((card: any) => {
                      const isLocalSelected = selectedCards.includes(card.id);

                      // Determine visibility based on backend state OR local selection
                      const isRevealed = card.state === "matched" || isLocalSelected;
                      const isMatched = card.state === "matched";

                      // Check if opponent is currently selecting it via last_action mapping
                      let isOpponentAction = false;
                      if (quizData.last_action && quizData.last_action.player !== userId && quizData.last_action.id !== seenActionId) {
                        if (quizData.last_action.card1 === card.id || quizData.last_action.card2 === card.id) {
                          isOpponentAction = true;
                        }
                      }

                      const showContent = isRevealed || isOpponentAction;

                      return (
                        <button
                          key={card.id}
                          className="mt-memory-card"
                          onClick={() => handleCardClick(card.id)}
                          disabled={quizData.turn !== userId || isMatched || (selectedCards.length >= 2 && !isLocalSelected)}
                          style={{
                            border: isLocalSelected ? "2px solid var(--mt-pink, #ff5bcc)" : isMatched ? "2px solid var(--mt-success, #8ef0bc)" : isOpponentAction ? "2px solid var(--mt-warning, #ffc978)" : "1px solid rgba(255,255,255,0.08)",
                            background: showContent
                              ? "radial-gradient(circle at top left, rgba(88, 196, 255, 0.15), transparent 70%), radial-gradient(circle at bottom right, rgba(255, 91, 204, 0.15), transparent 70%), linear-gradient(180deg, #1e1e24 0%, #12131a 100%)"
                              : "rgba(255,255,255,0.03)",
                            color: showContent ? "#ffffff" : "transparent",
                            fontSize: showContent ? "1.05rem" : "0",
                            cursor: (isMatched || quizData.turn !== userId) ? "default" : "pointer",
                            boxShadow: showContent ? "0 8px 16px rgba(0,0,0,0.3)" : "none",
                            textShadow: showContent ? "0 2px 4px rgba(0,0,0,0.5)" : "none"
                          }}
                        >
                          {showContent ? card.text : "?"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <pre className="mt-debug-box">
                  {JSON.stringify(quizData, null, 2)}
                </pre>
              )}

              <div className="mt-submit-card">
                <div>
                  <p className="mt-section-kicker">finish quiz</p>
                  <h3 className="mt-submit-title">Grade your results</h3>
                </div>

                <div className="mt-submit-row">
                  <button
                    className="mt-btn mt-btn--pink"
                    onClick={handleSubmit}
                    disabled={status.includes("Submitted") || Object.keys(selectedAnswers).length < questions.length}
                    style={{ width: "100%", maxWidth: "340px" }}
                  >
                    {status.includes("Submitted") ? "Submitted!" : "Submit Answers"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {results && (
          <div
            className={`mt-results-card ${results.is_winner
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