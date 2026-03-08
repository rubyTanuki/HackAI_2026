import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Clock3, BookOpen, CircleCheckBig, Loader2, Download } from "lucide-react";
import { useAuth } from "@clerk/react";
import { useNavigate } from "react-router-dom";
// @ts-ignore
import { createEvents } from "ics";
import "./StudyPlan.css";

// Update this to use window.location.hostname dynamically
const API_URL = `http://${window.location.hostname}:8000/study_plan`;

const COURSE_COLORS: Record<string, { chip: string; soft: string; border: string }> = {
  CS2305: {
    chip: "#131213ff",
    soft: "rgba(254, 207, 239, 0.18)",
    border: "rgba(254, 207, 239, 0.45)",
  },
  default: {
    chip: "#3b2c2dff",
    soft: "rgba(255, 154, 158, 0.18)",
    border: "rgba(255, 154, 158, 0.45)",
  },
};

function getCourseColor(course: string) {
  return COURSE_COLORS[course] || COURSE_COLORS.default;
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatShortDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}



function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildCalendarDays(monthDate: Date) {
  const first = startOfMonth(monthDate);
  const last = endOfMonth(monthDate);

  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));

  const days = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function groupTasksByDate(tasks: any[]) {
  return tasks.reduce((acc, task) => {
    const key = task.suggested_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {} as Record<string, any[]>);
}

function sortTasks(tasks: any[]) {
  return [...tasks].sort((a, b) => {
    if (a.suggested_date !== b.suggested_date) {
      return a.suggested_date.localeCompare(b.suggested_date);
    }
    return a.title.localeCompare(b.title);
  });
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function StudyPlanPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(new Date()));
  const { getToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let ignore = false;

    async function loadPlan() {
      try {
        setStatus("loading");
        setError("");

        const token = await getToken();
        if (!token) {
          throw new Error("You must be signed in to view your study plan.");
        }

        const response = await fetch(API_URL, {
            method: "POST", // Adjust to POST since API uses app.post
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          const msg = errData?.detail || `Request failed: ${response.status}`;
          throw new Error(msg);
        }

        const data = await response.json();
        const incomingTasks = Array.isArray(data?.tasks) ? data.tasks : [];

        if (!ignore) {
          const rawEvents = localStorage.getItem('events');
          const deadlines = rawEvents ? JSON.parse(rawEvents) : [];
          
          const cleanedDeadlines = deadlines.map((d: any) => ({
            id: `deadline-${d.id || Math.random()}`,
            title: d.title,
            suggested_date: d.date || d.dueDate || d.due_date || d.deadline,
            course: d.course || d.class || "General",
            duration: 0,
            completed: d.status === 'Done',
            isDeadline: true
          }));

          const cleaned = incomingTasks.map((task: any, index: number) => ({
            id: `${task.title}-${task.suggested_date}-${index}`,
            title: task.title,
            suggested_date: task.suggested_date,
            course: task.course || "General",
            duration: Number(task.duration || 0),
            completed: Boolean(task.completed),
            isDeadline: false
          }));

          const merged = [...cleaned, ...cleanedDeadlines].filter(t => t.suggested_date);
          const sorted = sortTasks(merged);
          setTasks(sorted);

          const today = new Date();
          setSelectedDate(today);
          setVisibleMonth(startOfMonth(today));

          setStatus("success");
        }
      } catch (err: any) {
        if (!ignore) {
          setError(err.message || "Could not load study plan.");
          setStatus("error");
        }
      }
    }

    loadPlan();
    return () => {
      ignore = true;
    };
  }, [getToken]);

  const taskMap = useMemo(() => groupTasksByDate(tasks), [tasks]);
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);

  const selectedKey = getDateKey(selectedDate);
  const selectedTasks = taskMap[selectedKey] || [];

  const upcomingTasks = useMemo(() => {
    const todayKey = getDateKey(new Date());
    return tasks.filter((task) => task.suggested_date >= todayKey).slice(0, 8);
  }, [tasks]);

  const totalHours = useMemo(
    () => tasks.reduce((sum, task) => sum + (task.duration || 0), 0),
    [tasks]
  );

  const completedCount = useMemo(
    () => tasks.filter((task) => task.completed).length,
    [tasks]
  );

  const activeCourses = useMemo(() => new Set(tasks.map((task) => task.course)).size, [tasks]);

  const handleExportCalendar = () => {
    if (!tasks || tasks.length === 0) return;

    const exportEvents = tasks.map((task: any) => {
      const [year, month, day] = task.suggested_date.split("-").map(Number);
      const hours = Math.floor(task.duration);
      const minutes = Math.round((task.duration - hours) * 60);

      return {
        title: `${task.course} Study: ${task.title}`,
        description: `Scheduled study block for ${task.course}.`,
        start: [year, month, day, 12, 0] as [number, number, number, number, number], // Default 12:00 PM noon
        duration: { hours, minutes },
      };
    });

    createEvents(exportEvents, (error: any, value: string) => {
      if (error) {
        console.error("Failed to generate calendar file", error);
        return;
      }
      const blob = new Blob([value], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "StudyPlan.ics");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  return (
    <div className="sp-container">
      <div className="sp-max-width">
        <div className="sp-header-row">
          <div>
            <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
             
              {status === "success" && tasks.length > 0 && (
                <div 
                  className="sp-back-badge" 
                  onClick={handleExportCalendar} 
                  style={{ 
                    background: "linear-gradient(135deg, #FF9A9E 0%, #FECFEF 100%)", 
                    color: "#222741", 
                    borderColor: "rgba(255, 154, 158, 0.5)" 
                  }}
                >
                  <Download className="sp-icon-small" />
                  Export Calendar
                </div>
              )}
            </div>
            <h1 className="sp-title">
              Your study plan
            </h1>
            
          </div>

          <div className="sp-stats-grid">
            <StatCard label="Tasks" value={String(tasks.length)} icon={CalendarDays} />
            <StatCard label="Hours" value={String(totalHours)} icon={Clock3} />
            <StatCard label="Courses" value={String(activeCourses)} icon={BookOpen} />
            <StatCard label="Done" value={String(completedCount)} icon={CircleCheckBig} />
          </div>
        </div>

        {status === "loading" && (
          <div className="sp-loading-card">
            <div className="sp-loading-content">
              <Loader2 className="sp-spinner" />
              Generating study plan... (this can take up to 20 seconds)
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="sp-error-card">
            <p className="sp-error-title">Could not load your study plan.</p>
            <p className="sp-error-msg">{error}</p>
            <p className="sp-error-tip">
              Make sure your backend returns JSON in the shape of <code>{`{ tasks: [...] }`}</code>.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="sp-layout-grid">
            <section className="sp-calendar-card">
              <div className="sp-calendar-header">
                <button
                  onClick={() => setVisibleMonth((prev) => addMonths(prev, -1))}
                  className="sp-nav-button"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="sp-nav-icon" />
                </button>

                <div className="sp-month-label">
                  <p>Planner month</p>
                  <h2>{formatMonth(visibleMonth)}</h2>
                </div>

                <button
                  onClick={() => setVisibleMonth((prev) => addMonths(prev, 1))}
                  className="sp-nav-button"
                  aria-label="Next month"
                >
                  <ChevronRight className="sp-nav-icon" />
                </button>
              </div>

              <div className="sp-days-row">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="sp-day-name">
                    {day}
                  </div>
                ))}
              </div>

              <div className="sp-calendar-grid">
                {calendarDays.map((day) => {
                  const dayKey = getDateKey(day);
                  const dayTasks = taskMap[dayKey] || [];
                  const inMonth = day.getMonth() === visibleMonth.getMonth();
                  const isToday = isSameDay(day, new Date());
                  const isSelected = isSameDay(day, selectedDate);
                  const load = dayTasks.reduce((sum: any, task: any) => sum + task.duration, 0);

                  return (
                    <button
                      key={dayKey}
                      onClick={() => setSelectedDate(day)}
                      className={`sp-day-cell ${
                        inMonth ? "sp-day-in-month" : "sp-day-out-month"
                      } ${isSelected ? "sp-day-selected" : ""} ${dayTasks.length > 0 ? "has-events" : ""}`}
                    >
                      <div className="sp-day-top">
                        <span
                          className={`sp-day-number ${
                            isToday ? "today" : isSelected ? "selected" : "normal"
                          }`}
                        >
                          {day.getDate()}
                        </span>

                        {dayTasks.length > 0 && (
                          <span className="sp-day-badge">
                            {dayTasks.length}
                          </span>
                        )}
                      </div>

                      <div className="sp-task-list">
                        {dayTasks.slice(0, 2).map((task: any) => {
                          const color = getCourseColor(task.course);
                          return (
                            <div
                              key={task.id}
                              className={task.isDeadline ? "sp-task-item sp-task-deadline" : "sp-task-item"}
                              style={task.isDeadline ? {} : {
                                backgroundColor: color.soft,
                                borderColor: color.border,
                                color: "#222741",
                              }}
                            >
                              {task.isDeadline && <strong>[DUE] </strong>}
                              {task.title}
                            </div>
                          );
                        })}
                        {dayTasks.length > 2 && (
                          <div className="sp-task-more">
                            +{dayTasks.length - 2} more
                          </div>
                        )}
                      </div>

                      {load > 0 && (
                        <div className="sp-day-load">
                          {load}h
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="sp-sidebar">
              <section className="sp-sidebar-card">
                <div className="sp-sidebar-header">
                  <div>
                    <p>Selected day</p>
                    <h3>
                      {new Intl.DateTimeFormat("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      }).format(selectedDate)}
                    </h3>
                  </div>
                  <div className="sp-total-badge">
                    <div className="label">Total</div>
                    <div className="value">
                      {selectedTasks.reduce((sum: any, task: any) => sum + task.duration, 0)}h
                    </div>
                  </div>
                </div>

                <div className="sp-sidebar-content">
                  {selectedTasks.length === 0 ? (
                    <div className="sp-empty-state">
                      Nothing scheduled for this day.
                    </div>
                  ) : (
                    selectedTasks.map((task: any) => {
                      const color = getCourseColor(task.course);
                      return (
                        <div
                          key={task.id}
                          className={task.isDeadline ? "sp-selected-task sp-selected-deadline" : "sp-selected-task"}
                          style={task.isDeadline ? {} : { borderColor: color.border }}
                        >
                          <div className="sp-selected-task-top">
                            <span
                              className={task.isDeadline ? "sp-selected-task-course sp-deadline-chip" : "sp-selected-task-course"}
                              style={task.isDeadline ? {} : {
                                backgroundColor: color.soft,
                                color: "#222741",
                              }}
                            >
                              {task.course}
                            </span>
                            {!task.isDeadline && (
                              <span className="sp-selected-task-duration">
                                {task.duration} hr
                              </span>
                            )}
                          </div>
                          <h4 className="sp-selected-task-title">{task.title}</h4>
                          <p className="sp-selected-task-status">
                            {task.isDeadline 
                              ? (task.completed ? "Submitted" : "Action Required")
                              : (task.completed ? "Completed" : "Planned study block")}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="sp-sidebar-card">
                <div className="sp-sidebar-header">
                  <div>
                    <p>Coming up</p>
                    <h3>Upcoming tasks</h3>
                  </div>
                </div>

                <div className="sp-sidebar-content">
                  {upcomingTasks.map((task) => {
                    const color = getCourseColor(task.course);
                    return (
                      <div
                        key={task.id}
                        className="sp-upcoming-task"
                        style={{ borderColor: color.border }}
                      >
                        <div className="sp-upcoming-task-info">
                          <p className="sp-upcoming-task-title">{task.title}</p>
                          <div className="sp-upcoming-task-meta">
                            <span>{formatShortDate(task.suggested_date)}</span>
                            <span>•</span>
                            <span>{task.course}</span>
                          </div>
                        </div>
                        <span
                          className="sp-upcoming-task-duration"
                          style={{ backgroundColor: color.soft, color: "#222741" }}
                        >
                          {task.duration}h
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="sp-stat-card">
      <div className="sp-stat-content">
        <div className="sp-stat-icon-wrapper">
          <Icon className="sp-stat-icon" />
        </div>
        <div>
          <p className="sp-stat-label">{label}</p>
          <p className="sp-stat-value">{value}</p>
        </div>
      </div>
    </div>
  );
}
