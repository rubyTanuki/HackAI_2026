const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const clearBtn = document.getElementById('clearBtn');
const uploadBtn = document.getElementById('uploadBtn');
const fileList = document.getElementById('fileList');
const fileCount = document.getElementById('fileCount');
const emptyState = document.getElementById('emptyState');

let filesToUpload = [];

// pdf.js web worker setup for client-side extraction
if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// ---------------------------
// DRAG & DROP EVENTS
// ---------------------------
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.add('highlight'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.remove('highlight'), false);
});

// Handling files dropped or selected
dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files), false);
// Ensure click explicitly opens file input
dropzone.addEventListener('click', (e) => {
    // Prevent triggering if a button inside the dropzone was clicked
    if (e.target.tagName.toLowerCase() !== 'button') {
        fileInput.click();
    }
});
fileInput.addEventListener('change', () => handleFiles(fileInput.files), false);

clearBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // prevent triggering the dropzone click
    filesToUpload = [];
    renderFileList();
});

// ---------------------------
// FILE HANDLING AND EXTRACTION
// ---------------------------
async function handleFiles(files) {
    const newArr = Array.from(files);

    for (let file of newArr) {
        if (file.name.match(/\.(pdf|doc|docx|txt)$/i)) {
            // Check if file is already added
            if (filesToUpload.find(f => f.file.name === file.name)) continue;

            filesToUpload.push({
                file,
                text: null,
                loading: true,
                error: null
            });
        } else {
            alert(`Unsupported file type: ${file.name}`);
        }
    }

    renderFileList();

    // Begin extracting text concurrently for new files
    for (let i = 0; i < filesToUpload.length; i++) {
        const item = filesToUpload[i];
        if (item.text === null && item.loading) {
            try {
                item.text = await extractText(item.file);
            } catch (err) {
                console.error(`Error extracting text from ${item.file.name}:`, err);
                item.error = err.message || "Failed to read file.";
            } finally {
                item.loading = false;
                renderFileList();

                // Logging the array of strings (for testing)
                if (item.text) {
                    console.log(`--- Extracted Content of ${item.file.name} ---`);
                    console.log(item.text.substring(0, 500) + (item.text.length > 500 ? '...\n(truncated for console)' : ''));
                    console.log("-----------------------------------------");

                    // Show current payload structure as requested
                    const payloadStrings = filesToUpload.filter(f => f.text).map(f => f.text);
                    console.log("Current JSON List of Strings ready to send:", JSON.stringify(payloadStrings));
                }
            }
        }
    }
}

// Update the UI
function renderFileList() {
    fileCount.textContent = filesToUpload.length;

    if (filesToUpload.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        uploadBtn.style.display = 'none';

        // Remove file items
        const items = fileList.querySelectorAll('.fileItem');
        items.forEach(el => el.remove());
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    uploadBtn.style.display = 'inline-block';

    const items = fileList.querySelectorAll('.fileItem');
    items.forEach(el => el.remove());

    filesToUpload.forEach((item, index) => {
        const el = document.createElement('div');
        el.className = 'fileItem';

        // Create labels based on current stat
        let status = '';
        if (item.loading) {
            status = `<span class="fileStatus" style="color: #ed8936;">⏳ Extracting text...</span>`;
        } else if (item.error) {
            status = `<span class="fileStatus" style="color: #e53e3e;">❌ Error</span>`;
        } else {
            status = `<span class="fileStatus" style="color: #38a169;">✅ Extracted (${formatBytes(item.text.length)} chars)</span>`;
        }

        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = `<div class="fileName" title="${item.file.name}">${item.file.name}</div>${status}`;

        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = `
            <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>`;
        removeBtn.style.background = 'none';
        removeBtn.style.border = 'none';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.color = '#a0aec0';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            filesToUpload.splice(index, 1);
            renderFileList();
        };
        removeBtn.onmouseenter = () => removeBtn.style.color = '#e53e3e';
        removeBtn.onmouseleave = () => removeBtn.style.color = '#a0aec0';

        el.appendChild(infoDiv);
        el.appendChild(removeBtn);
        fileList.appendChild(el);
    });
}

function formatBytes(bytes) {
    if (bytes === 0) return '0';
    const k = 1000;
    const sizes = ['', 'K', 'M', 'G'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}


// ---------------------------
// TEXT EXTRACTION LOGIC
// ---------------------------
async function extractText(file) {
    const name = file.name.toLowerCase();

    if (name.endsWith('.txt')) {
        return await extractFromTxt(file);
    } else if (name.endsWith('.pdf')) {
        return await extractFromPdf(file);
    } else if (name.endsWith('.docx')) {
        return await extractFromDocx(file);
    } else if (name.endsWith('.doc')) {
        throw new Error('.doc files are harder to parse directly. Try using .docx or .pdf');
    }

    throw new Error('Unsupported format for text extraction');
}

function extractFromTxt(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsText(file);
    });
}

async function extractFromPdf(file) {
    if (!window.pdfjsLib) throw new Error("PDF.js library failed to load");

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }

    return fullText;
}

async function extractFromDocx(file) {
    if (!window.mammoth) throw new Error("Mammoth.js library failed to load");

    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
}


// ---------------------------
// SENDING DATA TO BACKEND
// ---------------------------
uploadBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    const readyItems = filesToUpload.filter(f => !f.loading && !f.error && f.text);

    if (readyItems.length === 0) {
        alert('No files are fully extracted or ready to upload yet.');
        return;
    }

    const payload = readyItems.map(item => item.text);

    const originalText = uploadBtn.innerHTML;
    uploadBtn.innerHTML = 'Sending...';
    uploadBtn.disabled = true;

    // Output what is being sent
    console.log("--- FINAL PAYLOAD BEING SENT ---");
    console.log(JSON.stringify(payload, null, 2));

    try {
        // Extract the JSON Web Token from Clerk for the backend
        let token = "";
        if (window.Clerk && window.Clerk.session) {
            token = await window.Clerk.session.getToken();
            console.log("Clerk User Session verified. Attached Token to request.");
        } else {
            console.warn("Warning: No Clerk session found. Request sent without an Authorization header!");
        }

        // Dynamically add the Bearer token to headers if the user is authenticated
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Dummy backend endpoint
        const response = await fetch('http://127.0.0.1:8000/timeline', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ syllabi: payload })
        });

        if (response.ok) {
            alert('Success! Syllabus texts successfully sent to the backend.');
            filesToUpload = filesToUpload.filter(f => !readyItems.includes(f));
            renderFileList();
        } else {
            let data;
            try { data = await response.json(); } catch (e) { }
            alert(`Error: ${data?.message || 'Failed to send data.'}`);
        }
    } catch (err) {
        console.error('Error sending items:', err);
        alert('Failed to send texts. Check your console to see the JSON array of strings that was generated.');
    } finally {
        uploadBtn.innerHTML = originalText;
        uploadBtn.disabled = false;
    }
});
