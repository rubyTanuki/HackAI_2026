import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/react';

export default function MatchTest() {
  const { getToken } = useAuth();
  
  const [coursePrefix, setCoursePrefix] = useState('MATH');
  const [courseCode, setCourseCode] = useState('3345');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Not Queued');
  const [quizData, setQuizData] = useState<any>(null);
  const [score, setScore] = useState<number>(0);
  const [results, setResults] = useState<any>(null);
  
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  const getHeaders = async () => {
    const token = await getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const handleQueue = async () => {
    try {
      setStatus('Joining Queue...');
      const res = await fetch(`http://localhost:8000/match/queue`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ course_prefix: coursePrefix, course_code: courseCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to queue');
      
      setMatchId(data.match_id);
      setStatus(data.status); // 'waiting' or 'in_progress'
      
      startPollingStatus(data.match_id);
    } catch (e: any) {
      alert(e.message);
      setStatus('Error');
    }
  };

  const handleAbort = async () => {
    if (!matchId) return;
    try {
      await fetch(`http://localhost:8000/match/${matchId}`, {
        method: 'DELETE',
        headers: await getHeaders()
      });
      if (pollingInterval.current) clearInterval(pollingInterval.current);
      setMatchId(null);
      setStatus('Not Queued');
    } catch (e: any) {
      alert('Failed to abort');
    }
  };

  const startPollingStatus = (id: string) => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    
    pollingInterval.current = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8000/match/${id}/status`, {
          headers: await getHeaders()
        });
        const data = await res.json();
        setStatus(data.status);
        
        if (data.status === 'in_progress') {
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
        headers: await getHeaders()
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
      setStatus('Score Submitted, waiting for opponent...');
      await fetch(`http://localhost:8000/match/${matchId}/submit`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ score })
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
          headers: await getHeaders()
        });
        const data = await res.json();
        
        if (data.status === 'completed') {
          if (pollingInterval.current) clearInterval(pollingInterval.current);
          setResults(data);
          setStatus('Match Finished!');
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
            headers: await getHeaders()
        });
        const rankData = await res.json();
        setResults((prev: any) => ({...prev, rank_change: rankData.rank_change}));
    } catch (e) {
        console.error(e);
    }
  }

  useEffect(() => {
    return () => {
      if (pollingInterval.current) clearInterval(pollingInterval.current);
    };
  }, []);

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', color: 'white' }}>
      <h1>Matchmaking Polling Tester</h1>
      
      <div style={{ background: '#222', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>Queue Settings</h3>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <input 
            value={coursePrefix} 
            onChange={e => setCoursePrefix(e.target.value)} 
            placeholder="Prefix (MATH)"
            disabled={status !== 'Not Queued'}
            style={{ padding: '8px' }}
          />
          <input 
            value={courseCode} 
            onChange={e => setCourseCode(e.target.value)} 
            placeholder="Code (3345)"
            disabled={status !== 'Not Queued'}
            style={{ padding: '8px' }}
          />
        </div>
        
        {status === 'Not Queued' || status === 'Error' ? (
          <button className="btn primary" onClick={handleQueue}>Join Queue</button>
        ) : status === 'waiting' || status === 'Joining Queue...' ? (
          <button className="btn ghost" style={{background: '#ff4444', color: 'white'}} onClick={handleAbort}>Abort Queue</button>
        ) : null}
      </div>

      <div style={{ background: '#111', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #333' }}>
        <h3>Match State</h3>
        <p><strong>Status:</strong> <span style={{color: status === 'waiting' ? 'orange' : status === 'in_progress' ? 'green' : 'white'}}>{status}</span></p>
        <p><strong>Match ID:</strong> {matchId || 'None'}</p>
      </div>

      {quizData && !results && (
        <div style={{ background: '#2d3748', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3 style={{color: '#63b3ed'}}>Game Started! Quiz Payload:</h3>
          <pre style={{ background: '#1a202c', padding: '10px', borderRadius: '4px', overflowX: 'auto' }}>
            {JSON.stringify(quizData, null, 2)}
          </pre>
          
          <div style={{ marginTop: '20px' }}>
            <h4>Submit your score:</h4>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="number" 
                value={score} 
                onChange={e => setScore(parseInt(e.target.value))} 
                style={{ padding: '8px', width: '100px' }}
              />
              <button 
                className="btn primary" 
                onClick={handleSubmit} 
                disabled={status.includes('Submitted')}
              >
                Submit Results
              </button>
            </div>
          </div>
        </div>
      )}

      {results && (
        <div style={{ background: '#surface_color', padding: '20px', borderRadius: '8px', border: `2px solid ${results.is_winner ? '#48bb78' : '#e53e3e'}` }}>
          <h2>{results.is_winner ? '🏆 YOU WON!' : results.winner === 'tie' ? '🤝 TIE!' : '💀 YOU LOST!'}</h2>
          <p><strong>Your Score:</strong> {results.your_score}</p>
          <p><strong>Opponent Score:</strong> {results.opponent_score}</p>
          <p><strong>Rank Change:</strong> {results.rank_change ? (results.rank_change > 0 ? `+${results.rank_change}` : results.rank_change) : 'Calculating...'} Elo</p>
          
          <button className="btn primary" style={{marginTop: '15px'}} onClick={() => window.location.reload()}>Play Again</button>
        </div>
      )}
    </div>
  );
}
