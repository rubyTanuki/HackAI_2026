import React, { useState, useEffect, useMemo } from 'react';
import './Timeline.css';

interface TimelineEvent {
  id: string;
  course: string;
  type: string;
  title: string;
  date: string;
  status: 'Not started' | 'In progress' | 'Done';
  sourceFile: string;
}

const TimelineDashboard: React.FC = () => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'pink');
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [selectedType, setSelectedType] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Modal State
  const [mCourse, setMCourse] = useState('');
  const [mType, setMType] = useState('Homework');
  const [mTitle, setMTitle] = useState('');
  const [mDate, setMDate] = useState(new Date().toISOString().slice(0, 10));

  const refreshEvents = () => {
    const saved = localStorage.getItem('events');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setEvents(Array.isArray(parsed) ? parsed : []);
      } catch (e) {
        console.error("Failed to parse events from localStorage:", e);
        setEvents([]);
      }
    }
  };

  // Load persistence
  useEffect(() => {
    refreshEvents();
    applyTheme(theme);
  }, []);

  // Save persistence
  useEffect(() => {
    localStorage.setItem('events', JSON.stringify(events));
  }, [events]);

  const applyTheme = (t: string) => {
    document.body.classList.remove('pink', 'mint', 'purple');
    document.body.classList.add(t);
  };

  const handleThemeChange = (t: string) => {
    setTheme(t);
    localStorage.setItem('theme', t);
    applyTheme(t);
  };

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
    if (course === '__all') {
      next.clear();
    } else {
      if (next.has(course)) next.delete(course);
      else next.add(course);
    }
    setSelectedCourses(next);
  };

  const saveTask = () => {
    const newEvent: TimelineEvent = {
      id: crypto.randomUUID(),
      course: mCourse.trim() || 'Course',
      type: mType,
      title: mTitle.trim() || 'Task',
      date: mDate || new Date().toISOString().slice(0, 10),
      status: 'Not started',
      sourceFile: ''
    };
    setEvents([...events, newEvent]);
    setIsModalOpen(false);
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
      out = out.filter(e => `${e.course} ${e.title}`.toLowerCase().includes(q));
    }

    if (sortBy === 'date') out.sort((a, b) => a.date.localeCompare(b.date));
    if (sortBy === 'course') out.sort((a, b) => (a.course + a.date).localeCompare(b.course + b.date));
    if (sortBy === 'type') out.sort((a, b) => (a.type + a.date).localeCompare(b.type + b.date));

    return out;
  }, [events, selectedCourses, selectedType, statusFilter, upcomingOnly, search, sortBy]);

  const courses = useMemo(() => {
    return Array.from(new Set(events.map(e => e.course))).sort();
  }, [events]);

  const toggleStatus = (id: string, current: string) => {
    setEvents(events.map(e => {
      if (e.id !== id) return e;
      return { ...e, status: current === 'Done' ? 'Not started' : 'Done' };
    }));
  };

  const setStatus = (id: string, status: any) => {
    setEvents(events.map(e => e.id === id ? { ...e, status } : e));
  };

  const removeEvent = (id: string) => {
    setEvents(events.filter(e => e.id !== id));
  };

  return (
    <div className="dashboard">
      <header className="hero tight">
        <div>
          <h1 className="heroTitle">Your timeline</h1>
          <p className="heroSub">Filter by course, type, status. Add tasks. Sort by due date.</p>
        </div>

        <div className="heroActions">
          <button className="btn ghost" onClick={resetAll}>Reset</button>
          <button className="btn ghost" onClick={refreshEvents}>Build timeline</button>
          <div className="themeWrap" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.9rem', color: '#718096' }}>Theme:</span>
            <select 
              className="select tiny" 
              value={theme} 
              onChange={(e) => handleThemeChange(e.target.value)}
            >
              <option value="pink">Pink</option>
              <option value="mint">Mint</option>
              <option value="purple">Purple</option>
            </select>
          </div>
          <button className="btn primary" id="addBtn" onClick={() => {
            setIsModalOpen(true);
            setMDate(new Date().toISOString().slice(0,10));
          }}>Add task</button>
        </div>
      </header>

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
            <input type="checkbox" checked={upcomingOnly} onChange={(e) => setUpcomingOnly(e.target.checked)} />
            <span>Upcoming only</span>
          </label>

          <input 
            className="input" 
            placeholder="Search…" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            style={{ flex: 1, minWidth: '150px', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0' }}
          />

          <div className="countPill">{filteredEvents.length} items</div>
        </div>
      </section>

      <section className="cardWide timelineWrap">
        {filteredEvents.length === 0 ? (
          <div className="emptyState">No items match your filters.</div>
        ) : (
          <div className="timeline">
            {filteredEvents.map((e, i) => (
              <div key={e.id} className={`item ${i % 2 === 0 ? 'left' : 'right'}`}>
                <div className="card">
                  <div className="cardTop">
                    <div className="cardTitle">{e.course} — {e.title}</div>
                    <div className="cardMeta">{e.date}</div>
                  </div>
                  <div className="badges">
                    <span className="badge">{e.type}</span>
                    <span className={`badge ${e.status === 'Done' ? 'statusDone' : e.status === 'In progress' ? 'statusProg' : ''}`}>
                      {e.status}
                    </span>
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
            ))}
          </div>
        )}
      </section>

      {/* Modal */}
      {isModalOpen && (
        <>
          <div className="modalOverlay" onClick={() => setIsModalOpen(false)}></div>
          <div className="modal">
            <div className="modalTop">
              <div className="modalTitle">Add task</div>
              <button className="iconBtn" onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            <div className="modalGrid">
              <label className="label">Course
                <input className="input" value={mCourse} onChange={(e) => setMCourse(e.target.value)} placeholder="CS 1337" style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0' }} />
              </label>

              <label className="label">Type
                <select className="select" value={mType} onChange={(e) => setMType(e.target.value)}>
                  <option>Homework</option>
                  <option>Quiz</option>
                  <option>Exam</option>
                  <option>Project</option>
                  <option>Reading</option>
                </select>
              </label>

              <label className="label">Title
                <input className="input" value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="Homework: Arrays practice" style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0' }} />
              </label>

              <label className="label">Due date
                <input className="input" type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0' }} />
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
