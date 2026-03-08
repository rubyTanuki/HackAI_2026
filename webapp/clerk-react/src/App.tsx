import { useState, useRef, useEffect } from 'react'
import { Show, SignInButton, UserButton, useAuth, useUser } from '@clerk/react'
import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'
import './App.css'
import TimelineDashboard from './pages/TimelineDashboard'
import MatchTest from './pages/MatchTest'
import StudyPlanPage from './pages/StudyPlanPage'
import AvailabilityQuiz from './pages/AvailabilityQuiz'
import { 
  Loader2
} from 'lucide-react'

// Setup PDF worker for Vite
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

type FileItem = {
  file: File;
  text: string | null;
  loading: boolean;
  error: string | null;
}

function App() {
  const { getToken } = useAuth();
  const { user } = useUser();

  const [filesToUpload, setFilesToUpload] = useState<FileItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasUploaded, setHasUploaded] = useState(false);
  const [view, setView] = useState<'upload' | 'timeline' | 'match' | 'studyplan' | 'quiz'>('upload');
  const [showStudyDropdown, setShowStudyDropdown] = useState(false);
  const [hasCompletedQuiz, setHasCompletedQuiz] = useState(false);
  const [manualCourses, setManualCourses] = useState<string[]>([]);
  const [courseInput, setCourseInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.location.hash === '#match') setView('match');
    
    // Check if quiz is completed
    const completed = localStorage.getItem('hasCompletedQuiz') === 'true';
    setHasCompletedQuiz(completed);

    // Listen for storage changes (if quiz is in another tab/route)
    const handleStorage = () => {
      setHasCompletedQuiz(localStorage.getItem('hasCompletedQuiz') === 'true');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Effect to process files whenever filesToUpload changes and there's work to do
  useEffect(() => {
    let unmounted = false;

    const processFiles = async () => {
      const itemsToProcess = filesToUpload.filter(item => item.text === null && item.loading && !item.error);

      if (itemsToProcess.length === 0) return;

      for (const item of itemsToProcess) {
        try {
          const text = await extractText(item.file);
          if (!unmounted) {
            setFilesToUpload(prev => prev.map(f =>
              f.file === item.file ? { ...f, text, loading: false } : f
            ));

            console.log(`--- Extracted Content of ${item.file.name} ---`);
            console.log(text.substring(0, 500) + (text.length > 500 ? '...\n(truncated)' : ''));
          }
        } catch (err: any) {
          if (!unmounted) {
            setFilesToUpload(prev => prev.map(f =>
              f.file === item.file ? { ...f, error: err.message || "Failed to read", loading: false } : f
            ));
          }
        }
      }
    };

    processFiles();

    return () => { unmounted = true; }
  }, [filesToUpload]);

  // Extraction logic
  const extractText = async (file: File): Promise<string> => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.txt')) return await extractFromTxt(file);
    if (name.endsWith('.pdf')) return await extractFromPdf(file);
    if (name.endsWith('.docx')) return await extractFromDocx(file);
    if (name.endsWith('.doc')) throw new Error('.doc files are harder to parse directly. Try using .docx or .pdf');
    throw new Error('Unsupported format');
  }

  const extractFromTxt = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target?.result as string);
      reader.onerror = e => reject(e);
      reader.readAsText(file);
    });
  }

  const extractFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText;
  }

  const extractFromDocx = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  // Handlers
  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const incoming = Array.from(newFiles).filter(f => f.name.match(/\.(pdf|doc|docx|txt)$/i));

    setFilesToUpload(prev => {
      const uniqueNew = incoming.filter(newFile => !prev.some(existing => existing.file.name === newFile.name));
      if (uniqueNew.length === 0) return prev;

      const newItems: FileItem[] = uniqueNew.map(file => ({
        file, text: null, loading: true, error: null
      }));
      setHasUploaded(false);
      return [...prev, ...newItems];
    });
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  }

  const removeFile = (indexToRemove: number) => {
    setFilesToUpload(prev => prev.filter((_, idx) => idx !== indexToRemove));
  }

  const addManualCourse = () => {
    const trimmed = courseInput.trim().toUpperCase();
    const regex = /^[A-Z]{2,4}\s?\d{4}$/;
    if (!regex.test(trimmed)) {
      alert('Invalid course code! Use format like "MATH 3345" or "CS1337".');
      return;
    }
    if (manualCourses.includes(trimmed)) return;
    setManualCourses(prev => [...prev, trimmed]);
    setCourseInput('');
  }

  const removeManualCourse = (code: string) => {
    setManualCourses(prev => prev.filter(c => c !== code));
  }

  const handleUpload = async () => {
    const readyItems = filesToUpload.filter(f => !f.loading && !f.error && f.text);
    if (readyItems.length === 0 && manualCourses.length === 0) {
      alert('Please upload a syllabus or enter a course code.');
      return;
    }

    const payloadSyllabi = readyItems.map(item => item.text);
    const payloadCourses = [...manualCourses];
    setIsSending(true);

    console.log("--- FINAL PAYLOAD BEING SENT ---");
    console.log(JSON.stringify({ syllabi: payloadSyllabi, courses: payloadCourses }, null, 2));

    try {
      const token = await getToken();
      if (!token) {
        alert('You must be signed in to upload syllabuses.');
        setIsSending(false);
        return;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      const response = await fetch(`http://${window.location.hostname}:8000/timeline`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ syllabi: payloadSyllabi, courses: payloadCourses })
      });

      if (response.ok) {
        const data = await response.json();
        const backendEvents = data.deadlines || data.events || [];
        console.log("Raw backendEvents array:", backendEvents);
        
        if (Array.isArray(backendEvents) && backendEvents.length > 0) {
          const normalizedEvents = backendEvents.map((e: any) => ({
            id: e.id || Date.now() + Math.random().toString(36).substring(2),
            course: e.course || 'Unknown Course',
            type: e.type || 'Other',
            title: e.title || 'Unknown Task',
            date: e.due_date || e.date || new Date().toISOString().slice(0, 10),
            status: e.status || 'Not started',
            sourceFile: e.sourceFile || '',
            points: e.points,
            weight: e.weight
          }));
          console.log("Normalized Events before saving:", normalizedEvents);

          try {
            localStorage.setItem('events', JSON.stringify(normalizedEvents));
            console.log("Successfully saved normalizedEvents to localStorage:", normalizedEvents);
          } catch(e) { console.warn("Failed to save to local storage", e); }
        } else {
             console.warn("Backend events was empty or not an array.");
        }
        setFilesToUpload(prev => prev.filter(f => !readyItems.includes(f)));
        setHasUploaded(true);
        setView('timeline');
      } else {
        let errData;
        try { errData = await response.json(); } catch (e) { }
        const msg = errData?.detail ? JSON.stringify(errData.detail) : (errData?.message || `HTTP ${response.status}`);
        console.error(`Backend Error: ${msg}`);
        alert(`Backend Error: ${msg}`);
      }
    } catch (err: any) {
      console.error('Fetch failed or Network Error:', err);
      alert(`Network Error: Make sure the Python backend is running on ${window.location.hostname}:8000. Details: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0';
    const k = 1000;
    const sizes = ['', 'K', 'M', 'G'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
  }

  return (
    <div className="page">
      <nav className="nav">
        <div className="navLeft">
          <div className="brand" onClick={() => setView('upload')}>LOCKED IN</div>
          
          {hasCompletedQuiz && (
            <div className="navItems">
              <button 
                className={`navLink ${view === 'studyplan' ? 'active' : ''}`}
                onClick={() => setView('studyplan')}
              >
                🏠 Home
              </button>
              
              <div 
                className="dropdown"
                onMouseEnter={() => setShowStudyDropdown(true)}
                onMouseLeave={() => setShowStudyDropdown(false)}
              >
                <button className={`navLink ${view === 'match' ? 'active' : ''}`}>
                  📚 Study ▾
                </button>
                {showStudyDropdown && (
                  <div className="dropdownContent">
                    <button onClick={() => { setView('match'); setShowStudyDropdown(false); }}>
                      🏆 Ranked Mode
                    </button>
                    <button onClick={() => { console.log('Solo mode coming soon'); setShowStudyDropdown(false); }}>
                      🧘 Solo
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="navRight">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="btn primary">Sign In</button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <div className="userProfile">
              <span className="userName">{user?.fullName}</span>
              <UserButton />
            </div>
          </Show>
        </div>
      </nav>

      {/* Main App Content - Only visible if logged in */}
      <Show when="signed-in">
        {view === 'match' ? (
          <MatchTest />
        ) : view === 'timeline' ? (
          <TimelineDashboard view={view} onNavigateToQuiz={() => setView('quiz')} />
        ) : view === 'studyplan' ? (
          <StudyPlanPage />
        ) : view === 'quiz' ? (
          <AvailabilityQuiz onComplete={() => {
            localStorage.setItem('hasCompletedQuiz', 'true');
            setHasCompletedQuiz(true);
            setView('studyplan');
          }} />
        ) : (
          <>
            <header className="hero">
              <h1 className="heroTitle">Get Locked In</h1>
              <p className="heroSub">Enter your course codes or upload syllabuses to generate your custom study plan.</p>
            </header>

            <main className="center">
              <section className="cardWide">
                {isSending ? (
                  <div style={{ padding: '80px 20px', textAlign: 'center' }}>
                    <h2 style={{ fontSize: '2rem', color: '#58c4ff', marginBottom: '15px' }}>Analyzing Courses...</h2>
                    <p style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,.6)', marginBottom: '30px' }}>
                      Gathering details and generating your custom timeline. This might take a moment.
                    </p>
                    <svg style={{ width: '50px', height: '50px', animation: 'spin 1s linear infinite', color: '#58c4ff', margin: '0 auto' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="30" strokeLinecap="round"></circle>
                    </svg>
                  </div>
                ) : (
                  <>
                    {/* Dropzone Area */}
                    <div
                      id="dropzone"
                      className={`dropzone ${isDragOver ? 'highlight' : ''}`}
                      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
                      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
                      onDrop={handleDrop}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).tagName.toLowerCase() !== 'button') {
                          fileInputRef.current?.click();
                        }
                      }}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        multiple
                        hidden
                        accept=".pdf,.doc,.docx,.txt"
                        onChange={(e) => handleFiles(e.target.files)}
                      />

                      <div className="dzTop">
                        <svg style={{ width: 50, height: 50, color: '#4361ee', marginBottom: 15 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                        </svg>
                        <div className="dzTitle">Drag & drop or <span style={{ color: '#58c4ff', textDecoration: 'underline' }}>click to browse</span></div>
                        <div className="dzHint">Supports PDF, DOCX, and TXT files</div>
                      </div>

                      <div className="dzFooter">
                        <button className="btn ghost" onClick={(e) => { e.stopPropagation(); setFilesToUpload([]) }}>Clear Files</button>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="uploadDivider">
                      <span>and / or</span>
                    </div>

                    {/* Manual Course Entry */}
                    <div className="courseSection">
                      <p className="courseSectionLabel">📚 Manual Course Entry</p>

                      <div className="courseInputRow">
                        <input
                          type="text"
                          className="courseInput"
                          placeholder="e.g. CS 1337 or MATH3345"
                          value={courseInput}
                          onChange={(e) => setCourseInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addManualCourse()}
                        />
                        <button className="courseAddBtn" onClick={addManualCourse}>
                          + Add
                        </button>
                      </div>

                      {manualCourses.length > 0 && (
                        <div className="courseTags">
                          {manualCourses.map(code => (
                            <span key={code} className="courseTag">
                              {code}
                              <button className="courseTagRemove" onClick={() => removeManualCourse(code)}>×</button>
                            </span>
                          ))}
                          <button className="courseClearAll" onClick={() => setManualCourses([])}>
                            clear all
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Unified Queue Panel */}
                    {(filesToUpload.length > 0 || manualCourses.length > 0) && (
                      <div className="queuePanel">
                        <div className="queuePanelTop">
                          <div className="queuePanelLeft">
                            <span className="queuePanelIcon">✦</span>
                            <span className="queuePanelTitle">Course Queue</span>
                          </div>
                          <div className="queueCount">{filesToUpload.length + manualCourses.length}</div>
                        </div>

                        <div className="queueList">
                          {/* Manual course codes */}
                          {manualCourses.map(code => (
                            <div className="queueItem queueItemCode" key={code}>
                              <div className="queueItemLeft">
                                <span className="queueItemIconWrap queueItemIconCode">📘</span>
                                <div>
                                  <div className="queueItemName">{code}</div>
                                  <span className="queueItemStatus queueItemStatusCode">Course code</span>
                                </div>
                              </div>
                              <button className="queueRemoveBtn" onClick={() => removeManualCourse(code)} title="Remove">×</button>
                            </div>
                          ))}

                          {/* Uploaded files */}
                          {filesToUpload.map((item, idx) => (
                            <div className={`queueItem${item.error ? ' queueItemError' : ''}`} key={idx}>
                              <div className="queueItemLeft">
                                <span className={`queueItemIconWrap${item.loading ? ' queueItemIconLoading' : item.error ? ' queueItemIconError' : ' queueItemIconDone'}`}>
                                  {item.loading ? '⏳' : item.error ? '❌' : '📄'}
                                </span>
                                <div>
                                  <div className="queueItemName" title={item.file.name}>{item.file.name}</div>
                                  {item.loading && <span className="queueItemStatus queueItemStatusLoading">Reading file...</span>}
                                  {item.error && <span className="queueItemStatus queueItemStatusError">{item.error}</span>}
                                  {!item.loading && !item.error && item.text && (
                                    <span className="queueItemStatus queueItemStatusDone">Ready · {formatBytes(item.text.length)} chars</span>
                                  )}
                                </div>
                              </div>
                              <button className="queueRemoveBtn" onClick={(e) => { e.stopPropagation(); removeFile(idx); }} title="Remove">×</button>
                            </div>
                          ))}
                        </div>

                        <button className="btn primary bigBtn" onClick={handleUpload} disabled={isSending} style={{ width: '100%', marginTop: '1.25rem' }}>
                          {isSending ? 'Syncing...' : 'Build my study guide ✦'}
                        </button>

                        {hasUploaded && (
                          <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: '12px' }}>
                            
                          </div>
                        )}
                      </div>
                    )}

                    {/* Empty state when nothing added yet */}
                    {filesToUpload.length === 0 && manualCourses.length === 0 && (
                      <div className="queueEmpty">
                        <span style={{ fontSize: '1.5rem' }}>🗂️</span>
                        <p>Drop files above or add a course code to get started</p>
                      </div>
                    )}
                  </>
                )}
              </section>
            </main>
          </>
        )}
      </Show>

      {/* Main App Content - Only visible if logged OUT */}
      <Show when="signed-out">
        <main className="center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '10px', color: '#58c4ff', fontFamily: "'Bungee', cursive", textTransform: 'uppercase' }}>Welcome to Locked In</h1>
          <p style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,.50)', marginBottom: '30px' }}>Please sign in using Clerk</p>
          <SignInButton mode="modal">
            <button className="btn primary" style={{ padding: '15px 30px', fontSize: '1.2rem' }}>Sign In</button>
          </SignInButton>
        </main>
      </Show>


    </div>
  )
}

export default App