import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import "./StudyPlan.css";
import "./AvailabilityQuiz.css";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const TIME_SLOTS = [
  { id: "early", label: "Early Bird", sub: "6am – 9am" },
  { id: "morning", label: "Morning", sub: "9am – 12pm" },
  { id: "afternoon", label: "Afternoon", sub: "12pm – 5pm" },
  { id: "evening", label: "Evening", sub: "5pm – 9pm" },
  { id: "night", label: "Night Owl", sub: "9pm – 12am" },
];

const HOUR_OPTIONS = [
  { value: 0.5, label: "30 min" },
  { value: 1, label: "1 hr" },
  { value: 2, label: "2 hrs" },
  { value: 3, label: "3 hrs" },
  { value: 4, label: "4+ hrs" },
];

export default function AvailabilityQuiz() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0=intro, 1=days, 2=timeslots, 3=hours
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [hoursPerDay, setHoursPerDay] = useState<number | null>(null);

  const totalWeeklyHours = hoursPerDay ? (selectedDays.length * hoursPerDay).toFixed(1) : 0;

  function toggleDay(i: number) {
    setSelectedDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]);
  }
  function toggleSlot(id: string) {
    setSelectedSlots(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  function handleSave() {
    // Navigate to StudyPlan passing these quiz preferences
    navigate("/study-plan", {
      state: {
        preferences: {
          days: selectedDays.map(i => FULL_DAYS[i]),
          slots: selectedSlots.map(id => TIME_SLOTS.find(s => s.id === id)?.label),
          hoursPerDay,
          totalWeeklyHours,
          vibe: null
        }
      }
    });
  }

  const steps = [
    { label: "Intro" },
    { label: "Days" },
    { label: "Times" },
    { label: "Hours" },
  ];

  return (
    <div className="sp-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* Header back navigation */}
      

      <div className="aq-max-width" style={{ width: '100%', maxWidth: '42rem' }}>
        
        {/* Progress dots */}
        {step > 0 && step < 4 && (
          <div className="aq-progress-row">
            {steps.slice(1, 4).map((_, i) => {
              const actualStep = i + 1;
              const done = step > actualStep;
              const active = step === actualStep;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <div className={`aq-dot ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
                    {done ? "✓" : <span style={{ fontSize: "0.7rem" }}>{actualStep}</span>}
                  </div>
                  {i < 2 && <div className={`aq-progress-line ${done ? 'done' : ''}`} />}
                </div>
              );
            })}
          </div>
        )}

        {/* ─── STEP 0: INTRO ─── */}
        {step === 0 && (
          <div style={{ textAlign: "center" }}>
            <div className="aq-intro-badge">2 min quiz</div>
            <h1 className="aq-intro-title">When's your<br /><span className="aq-grad-text">study time?</span></h1>
            <p className="aq-intro-sub">
              Let's figure out your perfect study schedule! Answer a few questions and we'll build your personalized plan.
            </p>

            <button className="aq-cta-btn" onClick={() => setStep(1)}>
              Let's go!
            </button>

            <div className="aq-intro-footer">
              <span className="aq-footer-pill">Days</span>
              <span className="aq-footer-arrow">→</span>
              <span className="aq-footer-pill">Times</span>
              <span className="aq-footer-arrow">→</span>
              <span className="aq-footer-pill">Hours</span>
            </div>
          </div>
        )}

        {/* ─── STEP 1: DAYS ─── */}
        {step === 1 && (
          <div>
            <div className="sp-card card-padded">
              <div className="aq-step-badge">Step 1 of 3</div>
              <h2 className="aq-card-title">Which days work for you?</h2>
              <p className="aq-card-sub">Pick all the days you could realistically squeeze in some study time.</p>

              <div className="aq-days-grid">
                {DAYS.map((day, i) => {
                  const sel = selectedDays.includes(i);
                  const isWeekend = i >= 5;
                  return (
                    <button
                      key={i}
                      className={`aq-day-pill ${sel ? (isWeekend ? 'sel-blue' : 'sel-pink') : ''}`}
                      onClick={() => toggleDay(i)}
                    >
                      <span className="aq-day-name">{day}</span>
                      <span className="aq-day-full">{isWeekend ? "Weekend" : "Weekday"}</span>
                      {sel && <span className="aq-checkmark">✓</span>}
                    </button>
                  );
                })}
              </div>

              {selectedDays.length > 0 && (
                <div className="aq-selection-hint">
                  {selectedDays.length} day{selectedDays.length > 1 ? "s" : ""} selected —
                  <span style={{ color: "#ff9ce4" }}> {selectedDays.map(i => DAYS[i]).join(", ")}</span>
                </div>
              )}

              <div className="aq-card-actions">
                <button className="aq-back-btn" onClick={() => setStep(0)}>← Back</button>
                <button className="aq-cta-btn" disabled={selectedDays.length === 0} onClick={() => setStep(2)}>
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 2: TIME SLOTS ─── */}
        {step === 2 && (
          <div>
            <div className="sp-card card-padded">
              <div className="aq-step-badge">Step 2 of 3</div>
              <h2 className="aq-card-title">When do you feel most focused?</h2>
              <p className="aq-card-sub">Pick all the time windows that feel natural for you.</p>

              <div className="aq-list-grid">
                {TIME_SLOTS.map((slot) => {
                  const sel = selectedSlots.includes(slot.id);
                  return (
                    <button
                      key={slot.id}
                      className={`aq-list-card ${sel ? 'sel-pink' : ''}`}
                      onClick={() => toggleSlot(slot.id)}
                    >
                      <div className="aq-list-info">
                        <p className={`aq-list-label ${sel ? 'active' : ''}`}>{slot.label}</p>
                        <p className="aq-list-sub">{slot.sub}</p>
                      </div>
                      <div className={`aq-list-check ${sel ? 'active' : ''}`}>✓</div>
                    </button>
                  );
                })}
              </div>

              <div className="aq-card-actions">
                <button className="aq-back-btn" onClick={() => setStep(1)}>← Back</button>
                <button className="aq-cta-btn" disabled={selectedSlots.length === 0} onClick={() => setStep(3)}>
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 3: HOURS ─── */}
        {step === 3 && (
          <div>
            <div className="sp-card card-padded">
              <div className="aq-step-badge">Step 3 of 3</div>
              <h2 className="aq-card-title">How long can you study each day?</h2>
              <p className="aq-card-sub">Consistency beats burning out!</p>

              <div className="aq-hours-grid">
                {HOUR_OPTIONS.map((h) => {
                  const sel = hoursPerDay === h.value;
                  return (
                    <button
                      key={h.value}
                      className={`aq-hour-card ${sel ? 'sel-blue' : ''}`}
                      onClick={() => setHoursPerDay(h.value)}
                    >
                      <p className={`aq-hour-label ${sel ? 'active' : ''}`}>{h.label}</p>
                    </button>
                  );
                })}
              </div>

              {hoursPerDay && selectedDays.length > 0 && (
                <div className="aq-hours-preview">
                  <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(255,255,255,0.7)" }}>
                    That's <strong style={{ color: "#8fdcff" }}>{totalWeeklyHours} hours/week</strong> across {selectedDays.length} days!
                  </p>
                </div>
              )}

              <div className="aq-card-actions">
                <button className="aq-back-btn" onClick={() => setStep(2)}>← Back</button>
                <button className="aq-cta-btn" disabled={!hoursPerDay} onClick={handleSave}>
                  Save Schedule
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
