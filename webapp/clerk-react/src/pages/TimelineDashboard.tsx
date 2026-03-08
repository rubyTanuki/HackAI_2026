import { useState, useEffect, useMemo } from 'react';
import type { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import './Timeline.css';


interface TimelineEvent {
  id: string;
  course: string;
  type: string;
  title: string;
  date: string;
  status: 'Not started' | 'In progress' | 'Done';
  sourceFile: string;
  points?: number;
  weight?: number;
}

/* ---------------- helpers ---------------- */

function typeToClass(type: string): string {
  switch (type) {
    case 'Homework': return 'typeHW';
    case 'Quiz': return 'typeQuiz';
    case 'Exam': return 'typeExam';
    case 'Project': return 'typeProject';
    case 'Reading': return 'typeReading';
    default: return 'typeHW';
  }
}

function typeEmoji(type: string): string {
  switch (type) {
    case 'Homework': return '📝';
    case 'Quiz': return '❓';
    case 'Exam': return '🧪';
    case 'Project': return '🚀';
    case 'Reading': return '📖';
    default: return '📌';
  }
}

function getRelativeDate(dateStr: string): { label: string; daysAway: number } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const target = new Date(dateStr);
  if (isNaN(target.getTime())) {
    return { label: 'Invalid date', daysAway: 9999 };
  }

  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diff === 0) return { label: 'Today', daysAway: 0 };
  if (diff === 1) return { label: 'Tomorrow', daysAway: 1 };
  if (diff === -1) return { label: 'Yesterday', daysAway: -1 };
  if (diff > 1) return { label: `in ${diff} days`, daysAway: diff };
  return { label: `${Math.abs(diff)} days ago`, daysAway: diff };
}

function normalizeType(type: string): string {
  const t = (type || '').toLowerCase();

  if (t.includes('homework') || t.includes('assignment') || t.includes('hw')) return 'Homework';
  if (t.includes('quiz')) return 'Quiz';
  if (t.includes('exam') || t.includes('test') || t.includes('midterm') || t.includes('final')) return 'Exam';
  if (t.includes('project')) return 'Project';
  if (t.includes('reading') || t.includes('read')) return 'Reading';

  return 'Homework';
}

function normalizeDate(dateValue: any): string {
  if (!dateValue) return new Date().toISOString().slice(0, 10);

  if (typeof dateValue === 'string') {
    const trimmed = dateValue.trim();

    // already yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
    return dateValue.toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

function normalizeEvent(raw: any, index: number): TimelineEvent {
  return {
    id: String(raw.id || raw._id || crypto.randomUUID() || `event-${index}`),
    course: raw.course || raw.class || raw.subject || 'Unknown Course',
    type: normalizeType(raw.type || raw.category || raw.kind || 'Homework'),
    title: raw.title || raw.name || raw.assignment || raw.task || 'Untitled Task',
    date: normalizeDate(raw.date || raw.dueDate || raw.due_date || raw.deadline),
    status: raw.status === 'Done' || raw.status === 'In progress' || raw.status === 'Not started'
      ? raw.status
      : 'Not started',
    sourceFile: raw.sourceFile || raw.source_file || raw.fileName || raw.filename || '',
    points: raw.points !== undefined ? Number(raw.points) : undefined,
    weight: raw.weight !== undefined ? Number(raw.weight) : undefined
  };
}

function extractEventsFromResponse(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.events)) return data.events;
  if (Array.isArray(data.assignments)) return data.assignments;
  if (Array.isArray(data.timeline)) return data.timeline;
  if (Array.isArray(data.tasks)) return data.tasks;
  return [];
}

/* ---------------- component ---------------- */

interface TimelineDashboardProps {
  view: string;
}

const TimelineDashboard: FC<TimelineDashboardProps> = ({ view }) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [selectedType, setSelectedType] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
  const [mCourse, setMCourse] = useState('');
  const [mType, setMType] = useState('Homework');
  const [mTitle, setMTitle] = useState('');
  const [mDate, setMDate] = useState(new Date().toISOString().slice(0, 10));

  const loadFromLocalStorage = () => {
    const saved = localStorage.getItem('events');

    if (!saved) {
      setEvents([]);
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      const rawEvents = extractEventsFromResponse(parsed);
      const normalized = rawEvents.map(normalizeEvent);
      setEvents(normalized);
    } catch (err) {
      console.error('Failed to parse localStorage events:', err);
      setEvents([]);
    }
  };

  const loadEvents = () => {
    loadFromLocalStorage();
  };

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (view === 'timeline') {
      loadEvents();
    }
  }, [view]);

  const resetAll = () => {
    setEvents([]);
    setSelectedCourses(new Set());
    setSelectedType('all');
    setStatusFilter('all');
    setSortBy('date');
    setUpcomingOnly(false);
    setSearch('');
    localStorage.removeItem('events');
  };

  const toggleCourse = (course: string) => {
    const next = new Set(selectedCourses);
    if (course === '__all') next.clear();
    else if (next.has(course)) next.delete(course);
    else next.add(course);
    setSelectedCourses(next);
  };

  const saveTask = async () => {
    const newEvent: TimelineEvent = {
      id: crypto.randomUUID(),
      course: mCourse.trim() || 'Course',
      type: mType,
      title: mTitle.trim() || 'Task',
      date: mDate || new Date().toISOString().slice(0, 10),
      status: 'Not started',
      sourceFile: ''
    };

    const updated = [...events, newEvent];
    setEvents(updated);
    localStorage.setItem('events', JSON.stringify(updated));

    setIsModalOpen(false);
    setMCourse('');
    setMTitle('');
    setMType('Homework');
    setMDate(new Date().toISOString().slice(0, 10));
  };

  const setStatus = async (id: string, status: 'Not started' | 'In progress' | 'Done') => {
    const updated = events.map(e => e.id === id ? { ...e, status } : e);
    setEvents(updated);
    localStorage.setItem('events', JSON.stringify(updated));

  };

  const toggleStatus = (id: string, current: string) => {
    const nextStatus = current === 'Done' ? 'Not started' : 'Done';
    setStatus(id, nextStatus);
  };

  const removeEvent = async (id: string) => {
    const updated = events.filter(e => e.id !== id);
    setEvents(updated);
    localStorage.setItem('events', JSON.stringify(updated));

  };

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date().toISOString().slice(0, 10);

    let out = [...events];

    if (selectedCourses.size > 0) {
      out = out.filter(e => selectedCourses.has(e.course));
    }

    if (selectedType !== 'all') {
      out = out.filter(e => e.type === selectedType);
    }

    if (statusFilter !== 'all') {
      out = out.filter(e => e.status === statusFilter);
    }

    if (upcomingOnly) {
      out = out.filter(e => e.date >= now);
    }

    if (q) {
      out = out.filter(e =>
        `${e.course} ${e.title} ${e.type}`.toLowerCase().includes(q)
      );
    }

    if (sortBy === 'date') {
      out.sort((a, b) => a.date.localeCompare(b.date));
    } else if (sortBy === 'course') {
      out.sort((a, b) => (a.course + a.date).localeCompare(b.course + b.date));
    } else if (sortBy === 'type') {
      out.sort((a, b) => (a.type + a.date).localeCompare(b.type + b.date));
    }

    return out;
  }, [events, selectedCourses, selectedType, statusFilter, upcomingOnly, search, sortBy]);

  const courses = useMemo(
    () => Array.from(new Set(events.map(e => e.course))).sort(),
    [events]
  );

  return (
    <div className="dashboard">
      <header className="hero tight">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div>
            <h1 className="heroTitle">Your timeline</h1>
            <p className="heroSub">Filter by course, type, status. Add tasks. Sort by due date.</p>
          </div>
        </div>

        <div className="heroActions">
          <button className="btn ghost" onClick={resetAll}>Reset</button>
          <button className="btn ghost" onClick={loadEvents}>
            Refresh timeline
          </button>
          
          <button
            onClick={() => navigate('/availability-quiz')}
            style={{
              background: 'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 100%)',
              color: '#12131a',
              border: 'none',
              padding: '9px 16px',
              borderRadius: '999px',
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(255, 154, 158, 0.4)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.9rem'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 154, 158, 0.6)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(255, 154, 158, 0.4)';
            }}
          >
            ✨ See your custom study guide!
          </button>

          <button
            className="btn primary"
            id="addBtn"
            onClick={() => {
              setIsModalOpen(true);
              setMDate(new Date().toISOString().slice(0, 10));
            }}
          >
            Add task
          </button>
        </div>
      </header>

      {/* Removed errorMsg rendering */}

      <section className="controls cardWide" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        <div className="controlsRow">
          <div className="chipGroup">
            <button
              className={`chip ${selectedCourses.size === 0 ? 'active' : ''}`}
              onClick={() => toggleCourse('__all')}
            >
              All courses
            </button>

            {courses.map(c => (
              <button
                key={c}
                className={`chip ${selectedCourses.has(c) ? 'active' : ''}`}
                onClick={() => toggleCourse(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="controlsRow" style={{ width: '100%' }}>
          <div className="chipGroup">
            {['all', 'Homework', 'Quiz', 'Exam', 'Project', 'Reading'].map(t => (
              <button
                key={t}
                className={`chip ${selectedType === t ? 'active' : ''}`}
                onClick={() => setSelectedType(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All status</option>
            <option value="Not started">Not started</option>
            <option value="In progress">In progress</option>
            <option value="Done">Done</option>
          </select>

          <select className="select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="date">Sort: Due date</option>
            <option value="course">Sort: Course</option>
            <option value="type">Sort: Type</option>
          </select>

          <label className="toggle">
            <input
              type="checkbox"
              checked={upcomingOnly}
              onChange={(e) => setUpcomingOnly(e.target.checked)}
            />
            <span>Upcoming only</span>
          </label>

          <input
            className="input"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: '150px',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,.14)',
              background: 'rgba(255,255,255,.06)',
              color: 'rgba(255,255,255,.86)'
            }}
          />

          <div className="countPill">{filteredEvents.length} items</div>
        </div>
      </section>

      <section className="cardWide timelineWrap">
        {filteredEvents.length === 0 ? (
          <div className="emptyState">No items match your filters.</div>
        ) : (
          <div className="timeline">
            {sortBy === 'date' ? (
              Object.entries(
                filteredEvents.reduce((acc, e) => {
                  const d = new Date(e.date + 'T00:00:00');
                  const m = isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                  if (!acc[m]) acc[m] = [];
                  acc[m].push(e);
                  return acc;
                }, {} as Record<string, TimelineEvent[]>)
              ).map(([month, evs]) => (
                <details key={month} open className="monthGroup">
                  <summary className="monthLabel">
                    <span className="monthLabelText">{month}</span>
                  </summary>
                  <div className="monthContent">
                    {evs.map((e, i) => {
                      const { label: countdownLabel, daysAway } = getRelativeDate(e.date);
                      const typeClass = typeToClass(e.type);
                      const isOverdue = daysAway < 0 && e.status !== 'Done';
                      const isDueSoon = daysAway >= 0 && daysAway <= 3 && e.status !== 'Done';

                      return (
                        <div key={e.id} className={`item ${i % 2 === 0 ? 'left' : 'right'}`}>
                          <div className={`card ${typeClass}`}>
                            <div className="cardTop">
                              <div className="cardTitle">
                                {typeEmoji(e.type)} {e.course} — {e.title}
                              </div>
                              <div className="cardMeta">{e.date}</div>
                            </div>
                            <div className="badges">
                              <span className="badge">{e.type}</span>
                              <span className={`badge ${e.status === 'Done' ? 'statusDone' : e.status === 'In progress' ? 'statusProg' : ''}`}>
                                {e.status}
                              </span>
                              {isOverdue && <span className="badge urgentOverdue">⚠ Overdue</span>}
                              {isDueSoon && <span className="badge urgentSoon">🔥 Due Soon</span>}
                              <span className="countdown">{countdownLabel}</span>
                            </div>
                            <div className="cardActions">
                              <button className="smallBtn" onClick={() => setStatus(e.id, 'In progress')}>In progress</button>
                              <button className="smallBtn" onClick={() => toggleStatus(e.id, e.status)}>
                                {e.status === 'Done' ? 'Undo' : 'Done'}
                              </button>
                              <button className="smallBtn danger" onClick={() => removeEvent(e.id)}>Delete</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              ))
            ) : (
              filteredEvents.map((e, i) => {
                const { label: countdownLabel, daysAway } = getRelativeDate(e.date);
                const typeClass = typeToClass(e.type);
                const isOverdue = daysAway < 0 && e.status !== 'Done';
                const isDueSoon = daysAway >= 0 && daysAway <= 3 && e.status !== 'Done';

                return (
                  <div key={e.id} className={`item ${i % 2 === 0 ? 'left' : 'right'}`}>
                    <div className={`card ${typeClass}`}>
                      <div className="cardTop">
                        <div className="cardTitle">{typeEmoji(e.type)} {e.course} — {e.title}</div>
                        <div className="cardMeta">{e.date}</div>
                      </div>
                      <div className="badges">
                        <span className="badge">{e.type}</span>
                        <span className={`badge ${e.status === 'Done' ? 'statusDone' : e.status === 'In progress' ? 'statusProg' : ''}`}>
                          {e.status}
                        </span>
                        {isOverdue && <span className="badge urgentOverdue">⚠ Overdue</span>}
                        {isDueSoon && <span className="badge urgentSoon">🔥 Due Soon</span>}
                        <span className="countdown">{countdownLabel}</span>
                      </div>
                      <div className="cardActions">
                        <button className="smallBtn" onClick={() => setStatus(e.id, 'In progress')}>In progress</button>
                        <button className="smallBtn" onClick={() => toggleStatus(e.id, e.status)}>
                          {e.status === 'Done' ? 'Undo' : 'Done'}
                        </button>
                        <button className="smallBtn danger" onClick={() => removeEvent(e.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>

      {isModalOpen && (
        <>
          <div className="modalOverlay" onClick={() => setIsModalOpen(false)} />
          <div className="modal">
            <div className="modalTop">
              <div className="modalTitle">Add task</div>
              <button className="iconBtn" onClick={() => setIsModalOpen(false)}>×</button>
            </div>

            <div className="modalGrid">
              <label className="label">
                Course
                <input
                  className="input"
                  value={mCourse}
                  onChange={(e) => setMCourse(e.target.value)}
                  placeholder="CS 1337"
                />
              </label>

              <label className="label">
                Type
                <select className="select" value={mType} onChange={(e) => setMType(e.target.value)}>
                  <option>Homework</option>
                  <option>Quiz</option>
                  <option>Exam</option>
                  <option>Project</option>
                  <option>Reading</option>
                </select>
              </label>

              <label className="label">
                Title
                <input
                  className="input"
                  value={mTitle}
                  onChange={(e) => setMTitle(e.target.value)}
                  placeholder="Homework: Arrays practice"
                />
              </label>

              <label className="label">
                Due date
                <input
                  className="input"
                  type="date"
                  value={mDate}
                  onChange={(e) => setMDate(e.target.value)}
                />
              </label>
            </div>

            <div className="modalActions">
              <button className="btn ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button className="btn primary" onClick={saveTask}>Save</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TimelineDashboard;