import { useState, useEffect, useRef, useMemo } from "react";
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
  const { getToken, userId } = useAuth();

  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourseStr, setSelectedCourseStr] = useState<string>("");

  // ── previously missing state ──
  const [mode, setMode] = useState<"random" | "quiz" | "memory">("random");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Not Queued");
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [results, setResults] = useState<any>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [seenActionId, setSeenActionId] = useState<number | null>(null);

  const pollingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const getHeaders = async () => {
    const token = await getToken();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  const fetchCourses = async () => {
    const host = window.location.hostname;
    const headers = await getHeaders();

    // Try 8000 first (matches the timeline/upload backend), then 8001
    const tryFetch = async (port: number) => {
      try {
        const res = await fetch(`http://${host}:${port}/user/courses`, { headers });
        if (res.ok) return res;
        return null;
      } catch {
        return null;
      }
    };

    try {
      const res = (await tryFetch(8000)) ?? (await tryFetch(8001));
      if (!res) throw new Error("Backend not reachable on port 8000 or 8001");

      const data = await res.json();
      if (data.courses && data.courses.length > 0) {
        setCourses(data.courses);
        const first = data.courses[0];
        setSelectedCourseStr(`${first.course_prefix}${first.course_code}`);
      } else {
        setCourses([]);
      }
    } catch (e: any) {
      console.error("Failed to fetch courses", e);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleQueue = async () => {
    if (!selectedCourseStr) {
      alert("Please enter a course code (e.g. CS1137)");
      return;
    }
    
    // Parse CS1137 or CS-1137 or CS 1137
    const match = selectedCourseStr.toUpperCase().match(/([A-Z]+)[-\s]*(\d+)/);
    if (!match) {
      alert("Invalid course format. Please use something like CS1137");
      return;
    }
    
    const prefix = match[1];
    const code = match[2];

    try {
      setStatus("Joining Queue...");
      setResults(null);
      setQuizData(null);
      setSelectedAnswers({});

      const host = window.location.hostname;
      const res = await fetch(`http://${host}:8000/match/queue`, {
        method: "POST",
        headers: await getHeaders(),
        body: JSON.stringify({
          course_prefix: prefix,
          course_code: code,
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
      const host = window.location.hostname;
      await fetch(`http://${host}:8000/match/${matchId}`, {
        method: "DELETE",
        headers: await getHeaders(),
      });
      if (pollingInterval.current) clearInterval(pollingInterval.current);
      setMatchId(null);
      setStatus("Not Queued");
      setQuizData(null);
      setResults(null);
      setSelectedAnswers({});
    } catch {
      alert("Failed to abort");
    }
  };

  const startPollingStatus = (id: string) => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    pollingInterval.current = setInterval(async () => {
      const host = window.location.hostname;
      try {
        const res = await fetch(`http://${host}:8000/match/${id}/status`, {
          headers: await getHeaders(),
        });
        const data = await res.json();
        setStatus(data.status);
        if (data.mode) setMode(data.mode);

        if (data.status === "in_progress") {
          if (pollingInterval.current) clearInterval(pollingInterval.current);
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
      const host = window.location.hostname;
      try {
        const sRes = await fetch(`http://${host}:8000/match/${id}/status`, {
          headers: await getHeaders(),
        });
        const sData = await sRes.json();
        setStatus(sData.status);
        if (sData.mode) setMode(sData.mode);

        if (sData.status === "completed") {
          if (pollingInterval.current) clearInterval(pollingInterval.current);
          startPollingResults(id);
          return;
        }

        const qRes = await fetch(`http://${host}:8000/match/${id}/quiz`, {
          headers: await getHeaders(),
        });
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
    const host = window.location.hostname;
    try {
      const res = await fetch(`http://${host}:8000/match/${id}/quiz`, {
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
        if (
          q.answer !== undefined &&
          q.options &&
          selectedAnswers[index] === q.options[q.answer as unknown as number]
        ) {
          computedScore++;
        }
      });
    }

    try {
      const host = window.location.hostname;
      setStatus("Score Submitted, waiting for opponent...");
      await fetch(`http://${host}:8000/match/${matchId}/submit`, {
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
      const host = window.location.hostname;
      try {
        const res = await fetch(`http://${host}:8000/match/${id}/results`, {
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
    const host = window.location.hostname;
    try {
      const res = await fetch(`http://${host}:8000/match/${id}/rank`, {
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

  // Opponent action flash
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

    const card = quizData.board?.find((c: any) => c.id === cardId);
    if (!card || card.state !== "hidden") return;

    const newSelection = [...selectedCards, cardId];
    setSelectedCards(newSelection);

    if (newSelection.length === 2) {
      try {
        const host = window.location.hostname;
        await fetch(`http://${host}:8000/match/${matchId}/turn`, {
          method: "POST",
          headers: await getHeaders(),
          body: JSON.stringify({ card1_id: newSelection[0], card2_id: newSelection[1] }),
        });
        setTimeout(() => setSelectedCards([]), 800);
      } catch (e) {
        console.error(e);
        setSelectedCards([]);
      }
    }
  };

  const questions = useMemo(() => {
    if (!quizData?.questions || !Array.isArray(quizData.questions)) return [];
    return quizData.questions;
  }, [quizData]);

  const progress = useMemo(() => {
    if (!questions.length) return 0;
    return (Object.keys(selectedAnswers).length / questions.length) * 100;
  }, [questions.length, selectedAnswers]);

  const handleSelectAnswer = (questionIndex: number, option: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionIndex]: option }));
  };

  // Derived booleans — single source of truth
  const isIdle    = status === "Not Queued" || status === "Error";
  const isQueued  = status === "waiting" || status === "Joining Queue...";
  const isInProgress = status === "in_progress";
  const isSubmitted  = status.includes("Submitted");

  const statusClass =
    status === "waiting"      ? "mt-pill mt-pill--warning"
    : isInProgress            ? "mt-pill mt-pill--success"
    : isSubmitted             ? "mt-pill mt-pill--pink"
    :                           "mt-pill";

  return (
    <div className="mt-page">
      <div className="mt-shell">

        {/* ── Topbar ── */}
        <div className="mt-topbar">
          <div>
            <p className="mt-kicker">ranked studying</p>
            <h1 className="mt-title">Lock'o'clock</h1>
            <p className="mt-subtitle">Queue up, get matched, and test your knowledge.</p>
          </div>
          <div className={statusClass}>{status}</div>
        </div>

        {/* ── Queue setup card — hidden once in-progress or submitted or results ── */}
        {!isInProgress && !isSubmitted && !results && (
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

            {/* Course entry input */}
            <div className="mt-input-row" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase" }}>
                Course Code
              </label>
              <input
                type="text"
                className="mt-input"
                placeholder="e.g. CS1137"
                value={selectedCourseStr}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase().replace(/\s/g, "");
                  setSelectedCourseStr(val);
                }}
                disabled={!isIdle}
                style={{ 
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}
              />
              {courses.length > 0 && isIdle && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" }}>
                  {courses.slice(0, 3).map((c, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedCourseStr(`${c.course_prefix}${c.course_code}`)}
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "4px",
                        padding: "4px 8px",
                        fontSize: "0.7rem",
                        color: "rgba(255,255,255,0.6)",
                        cursor: "pointer"
                      }}
                    >
                      {c.course_prefix}{c.course_code}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mode buttons */}
            <div className="mt-action-row" style={{ marginTop: "20px", marginBottom: 0 }}>
              {(["random", "quiz", "memory"] as const).map((m) => (
                <button
                  key={m}
                  className={`mt-btn ${
                    mode === m
                      ? m === "memory" ? "mt-btn--pink" : "mt-btn--primary"
                      : ""
                  }`}
                  onClick={() => setMode(m)}
                  disabled={!isIdle}
                >
                  {m === "random" ? "Any Mode" : m === "quiz" ? "Quiz Mode" : "Memory Mode"}
                </button>
              ))}
            </div>

            {/* Queue / Abort — single instance */}
            <div className="mt-action-row">
              {isIdle && (
                <button className="mt-btn mt-btn--primary" onClick={handleQueue}>
                  Join Queue
                </button>
              )}
              {isQueued && (
                <button className="mt-btn mt-btn--danger" onClick={handleAbort}>
                  Abort Queue
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Player row ── */}
        <div className="mt-player-row">
          <div className="mt-player-card mt-player-card--you">
            <div className="mt-player-avatar">Y</div>
            <div className="mt-player-meta">
              <div className="mt-player-name">You</div>
              <div className="mt-player-rank">
                {selectedCourseStr ? selectedCourseStr.toUpperCase().replace(/([A-Z]+)\s*(\d+)/, "$1 $2") : "—"}
              </div>
            </div>
          </div>

          <div className="mt-versus">VS</div>

          <div className="mt-player-card mt-player-card--opp">
            <div className="mt-player-avatar mt-player-avatar--pink">O</div>
            <div className="mt-player-meta">
              <div className="mt-player-name">Opponent</div>
              <div className="mt-player-rank">
                {isQueued
                  ? "Looking for player..."
                  : isInProgress || results
                    ? "Connected"
                    : "Not connected"}
              </div>
            </div>
          </div>
        </div>

        {/* ── Quiz / Memory board ── */}
        {quizData && !results && (
          <>
            <div className="mt-progress-wrap">
              <div className="mt-progress-bar" style={{ width: `${progress}%` }} />
            </div>

            <div className="mt-quiz-card">
              <div className="mt-card-header">
                <div>
                  <p className="mt-section-kicker">game started</p>
                  <h2 className="mt-section-title">
                    {quizData?.board ? "Memory Match" : "Quiz Match"}
                  </h2>
                </div>
                {!quizData?.board && (
                  <div className="mt-question-count">
                    {questions.length} question{questions.length === 1 ? "" : "s"}
                  </div>
                )}
              </div>

              {/* Quiz questions */}
              {questions.length > 0 && !quizData?.board && (
                <div className="mt-question-list">
                  {questions.map((q, qIndex) => (
                    <div className="mt-question-block" key={qIndex}>
                      <div className="mt-question-badge">Question {qIndex + 1}</div>
                      <h3 className="mt-question-text">{q.question}</h3>
                      <div className="mt-options">
                        {q.options.map((option, optIndex) => (
                          <button
                            key={optIndex}
                            className={`mt-option ${selectedAnswers[qIndex] === option ? "mt-option--selected" : ""}`}
                            onClick={() => handleSelectAnswer(qIndex, option)}
                            type="button"
                          >
                            <span className="mt-option-letter">
                              {String.fromCharCode(65 + optIndex)}
                            </span>
                            <span className="mt-option-text">{option}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Memory board */}
              {quizData?.board && (
                <div style={{ padding: "24px" }}>
                  <div style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ fontSize: "0.85rem", fontWeight: 600, margin: 0 }}>
                      {quizData.turn === userId ? "🟢 Your Turn!" : "⏳ Opponent's Turn..."}
                    </h3>
                    <span style={{ fontSize: "0.75rem" }}>
                      <strong>You:</strong> {quizData.scores?.[userId || ""] || 0} matches
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
                    {quizData.board.map((card: any) => {
                      const isLocalSelected = selectedCards.includes(card.id);
                      const isMatched = card.state === "matched";
                      let isOpponentAction = false;
                      if (
                        quizData.last_action &&
                        quizData.last_action.player !== userId &&
                        quizData.last_action.id !== seenActionId &&
                        (quizData.last_action.card1 === card.id || quizData.last_action.card2 === card.id)
                      ) {
                        isOpponentAction = true;
                      }
                      const showContent = isMatched || isLocalSelected || isOpponentAction;

                      return (
                        <button
                          key={card.id}
                          className="mt-memory-card"
                          onClick={() => handleCardClick(card.id)}
                          disabled={
                            quizData.turn !== userId ||
                            isMatched ||
                            (selectedCards.length >= 2 && !isLocalSelected)
                          }
                          style={{
                            border: isLocalSelected
                              ? "2px solid #ff5bcc"
                              : isMatched
                                ? "2px solid #8ef0bc"
                                : isOpponentAction
                                  ? "2px solid #ffc978"
                                  : "1px solid rgba(255,255,255,0.08)",
                            background: showContent
                              ? "radial-gradient(circle at top left, rgba(88,196,255,0.15), transparent 70%), radial-gradient(circle at bottom right, rgba(255,91,204,0.15), transparent 70%), linear-gradient(180deg, #1e1e24 0%, #12131a 100%)"
                              : "rgba(255,255,255,0.03)",
                            color: showContent ? "#ffffff" : "transparent",
                            fontSize: showContent ? "1.05rem" : "0",
                            cursor: isMatched || quizData.turn !== userId ? "default" : "pointer",
                            boxShadow: showContent ? "0 8px 16px rgba(0,0,0,0.3)" : "none",
                          }}
                        >
                          {showContent ? card.text : "?"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Fallback debug */}
              {!questions.length && !quizData?.board && (
                <pre className="mt-debug-box">{JSON.stringify(quizData, null, 2)}</pre>
              )}

              {/* Submit — quiz mode only */}
              {questions.length > 0 && !quizData?.board && (
                <div className="mt-submit-card">
                  <div>
                    <p className="mt-section-kicker">finish quiz</p>
                    <h3 className="mt-submit-title">Grade your results</h3>
                  </div>
                  <div className="mt-submit-row">
                    <button
                      className="mt-btn mt-btn--pink"
                      onClick={handleSubmit}
                      disabled={isSubmitted || Object.keys(selectedAnswers).length < questions.length}
                      style={{ width: "100%", maxWidth: "340px" }}
                    >
                      {isSubmitted ? "Submitted!" : "Submit Answers"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Results ── */}
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
              {results.is_winner ? "🏆" : results.winner === "tie" ? "🤝" : "💀"}
            </div>
            <h2 className="mt-results-title">
              {results.is_winner ? "You Won!" : results.winner === "tie" ? "Tie Game!" : "You Lost!"}
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
                  {results.rank_change != null
                    ? results.rank_change > 0 ? `+${results.rank_change}` : results.rank_change
                    : "Calculating..."}
                </strong>
              </div>
            </div>
            <button className="mt-btn mt-btn--primary" onClick={() => window.location.reload()}>
              Play Again
            </button>
          </div>
        )}

      </div>
    </div>
  );
}