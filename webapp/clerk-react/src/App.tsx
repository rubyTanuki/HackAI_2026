import { useState, useRef, useEffect } from 'react'
import { Show, SignInButton, UserButton, useAuth, useUser } from '@clerk/react'
import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'
import './App.css'
import TimelineDashboard from './pages/TimelineDashboard'

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
  const [view, setView] = useState<'upload' | 'timeline'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            
            // Console logging similar to the original JS
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

  const handleUpload = async () => {
    const readyItems = filesToUpload.filter(f => !f.loading && !f.error && f.text);
    if (readyItems.length === 0) {
      alert('No files are fully extracted or ready to upload yet.');
      return;
    }

    const payload = readyItems.map(item => item.text);
    setIsSending(true);

    console.log("--- FINAL PAYLOAD BEING SENT ---");
    console.log(JSON.stringify(payload, null, 2));

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

      const response = await fetch('http://127.0.0.1:8000/timeline', { 
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ syllabi: payload })
      });

      if (response.ok) {
          const data = await response.json();
          alert('Success! Syllabus texts sent.');
          
          const backendEvents = data.deadlines || data.events || [];
          if (Array.isArray(backendEvents) && backendEvents.length > 0) {
            const normalizedEvents = backendEvents.map((e: any) => ({
              id: e.id || crypto.randomUUID(),
              course: e.course || 'Unknown Course',
              type: e.type || 'Other',
              title: e.title || 'Unknown Task',
              date: e.due_date || e.date || new Date().toISOString().slice(0, 10),
              status: e.status || 'Not started',
              sourceFile: e.sourceFile || '',
              points: e.points,
              weight: e.weight
            }));

            const existingEvents = JSON.parse(localStorage.getItem('events') || '[]');
            const updatedEvents = [...existingEvents, ...normalizedEvents];
            localStorage.setItem('events', JSON.stringify(updatedEvents));
          }
          setFilesToUpload(prev => prev.filter(f => !readyItems.includes(f)));
          setHasUploaded(true);
      } else {
          let data;
          try { data = await response.json(); } catch(e) {}
          alert(`Error: ${data?.message || 'Failed to send data.'}`);
      }
    } catch (err) {
        console.error('Error sending items:', err);
        alert('Check console for the generated output.');
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
        <div className="brand" style={{ cursor: 'pointer' }} onClick={() => setView('upload')}>Syllabus Timeline</div>
        <div className="navLinks">
          <button 
            className={`navBtn ${view === 'upload' ? 'active' : ''}`} 
            onClick={() => setView('upload')}
          >
            Upload
          </button>
          <button 
            className={`navBtn ${view === 'timeline' ? 'active' : ''}`} 
            onClick={() => setView('timeline')}
          >
            Timeline
          </button>
        </div>
        <div className="navRight">
          <Show when="signed-out">
             <SignInButton mode="modal">
                 <button className="btn primary">Sign In</button>
             </SignInButton>
          </Show>
          <Show when="signed-in">
             <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
               <span style={{fontWeight: 500, color: '#4a5568'}}>{user?.fullName}</span>
               <UserButton />
             </div>
          </Show>
        </div>
      </nav>

      {/* Main App Content - Only visible if logged in */}
      <Show when="signed-in">
        {view === 'timeline' ? (
          <TimelineDashboard />
        ) : (
          <>
            <header className="hero">
              <h1 className="heroTitle">Upload your syllabuses</h1>
              <p className="heroSub">Drop files to extract text instantly. Everything runs securely in your browser before sending.</p>
            </header>

            <main className="center">
              <section className="cardWide">
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
                    <svg style={{width: 50, height: 50, color: '#4361ee', marginBottom: 15}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                    </svg>
                    <div className="dzTitle">Drag & drop or <span style={{color: '#4361ee', textDecoration: 'underline'}}>click to browse</span></div>
                    <div className="dzHint">Supports PDF, DOCX, and TXT files</div>
                  </div>

                  <div className="dzFooter">
                    <button className="btn ghost" onClick={(e) => { e.stopPropagation(); setFilesToUpload([]) }}>Clear List</button>
                  </div>
                </div>

                {/* File Upload List */}
                <div className="filePanel">
                  <div className="panelTop">
                    <div className="panelTitle">Extracted Files</div>
                    <div className="panelMeta">{filesToUpload.length}</div>
                  </div>
                  
                  <div className="fileList" id="fileList">
                    {filesToUpload.length === 0 && (
                      <div style={{color: '#a0aec0', textAlign: 'center', padding: '40px 0'}}>
                          No files added yet.<br/>Drag some over!
                      </div>
                    )}
                    
                    {filesToUpload.map((item, idx) => (
                      <div className="fileItem" key={idx}>
                        <div>
                          <div className="fileName" title={item.file.name}>{item.file.name}</div>
                          {item.loading && <span className="fileStatus" style={{color: '#ed8936'}}>⏳ Extracting text...</span>}
                          {item.error && <span className="fileStatus" style={{color: '#e53e3e'}}>❌ {item.error}</span>}
                          {!item.loading && !item.error && item.text && <span className="fileStatus" style={{color: '#38a169'}}>✅ Extracted ({formatBytes(item.text.length)} chars)</span>}
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                          style={{background: 'none', border: 'none', cursor: 'pointer', color: '#a0aec0'}}
                        >
                          <svg style={{width: 20, height: 20}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  {filesToUpload.length > 0 && (
                    <div style={{marginTop: 15, display: 'flex', flexDirection: 'column', gap: '10px'}}>
                      <button className="btn primary" onClick={handleUpload} disabled={isSending} style={{width: '100%'}}>
                          {isSending ? 'Sending...' : 'Upload Syllabus →'}
                      </button>
                    </div>
                  )}

                  {hasUploaded && (
                    <div style={{marginTop: 15, borderTop: '1px solid #edf2f7', paddingTop: '15px'}}>
                      <button className="btn primary" onClick={() => setView('timeline')} style={{width: '100%', background: '#38a169'}}>
                          View Timeline →
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </main>
          </>
        )}
      </Show>

      {/* Main App Content - Only visible if logged OUT */}
      <Show when="signed-out">
        <main className="center" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh'}}>
           <h1 style={{fontSize: '2.5rem', marginBottom: '10px', color: '#4361ee'}}>Welcome to Syllabus Timeline</h1>
           <p style={{fontSize: '1.2rem', color: '#718096', marginBottom: '30px'}}>Please sign in using Clerk to generate your course timeline via text extraction.</p>
           <SignInButton mode="modal">
               <button className="btn primary" style={{padding: '15px 30px', fontSize: '1.2rem'}}>Sign In</button>
           </SignInButton>
        </main>
      </Show>

      <footer className="footerMinimal">Extracting text locally to boost privacy and speed. Replace API endpoint later.</footer>
    </div>
  )
}

export default App
