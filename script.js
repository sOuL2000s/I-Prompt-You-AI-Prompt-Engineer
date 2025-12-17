// script.js (Client-side)

// Removed: GEMINI_API_KEY and direct Google API URL
const API_ENDPOINT = "/api/generatePrompt";
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025"; // Used for context/logging only if needed

// Get DOM elements
const userInput = document.getElementById('userInput');
const voiceInputBtn = document.getElementById('voiceInputBtn');
const fileInput = document.getElementById('fileInput');
const uploadFileBtn = document.getElementById('uploadFileBtn');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const filePreview = document.getElementById('filePreview');
const generatePromptBtn = document.getElementById('generatePromptBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');
const outputPrompt = document.getElementById('outputPrompt');
const copyPromptBtn = document.getElementById('copyPromptBtn');

// New/Modified DOM elements for header actions
const newPromptRefreshBtn = document.getElementById('newPromptRefreshBtn');
const viewHistoryBtn = document.getElementById('viewHistoryBtn');

// DOM elements for history modal
const historyModal = document.getElementById('historyModal');
const closeHistoryBtn = historyModal.querySelector('.close-button');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// State variables
let attachedFiles = []; // Array to store objects like { id: string, type: 'text'|'image', content: string|base64, mimeType?: string, fileName: string, size: number }
let voiceRecognitionActive = false; // To manage voice input state
let recognition; // Keep recognition object in a broader scope to stop it externally


// --- Helper Functions for UI State Management ---
function showLoading() {
    loadingIndicator.style.display = 'flex';
    generatePromptBtn.disabled = true;
    voiceInputBtn.disabled = true;
    uploadFileBtn.disabled = true;
    userInput.disabled = true; // Disable manual input during loading
    copyPromptBtn.style.display = 'none'; // Hide copy button while loading
    outputPrompt.value = ''; // Clear previous output
    clearError();
}

function hideLoading() {
    loadingIndicator.style.display = 'none';
    // Only disable userInput/uploadFileBtn if voice is actively listening
    userInput.disabled = voiceRecognitionActive;
    uploadFileBtn.disabled = voiceRecognitionActive;
    voiceInputBtn.disabled = false; // Always allow starting/stopping voice recognition
    checkGenerateButtonState(); // Re-enable generate button based on current input
}

function showError(message) {
    errorMessage.innerHTML = `⚠️ ${message}`; // Add emoji for visual cue
    errorMessage.style.display = 'flex'; // Use flex for icon alignment
}

function clearError() {
    errorMessage.textContent = '';
    errorMessage.style.display = 'none';
}

function showCopyButton() {
    if (outputPrompt.value.trim() !== '') {
        copyPromptBtn.style.display = 'flex'; // Use flex for icon and text alignment
    }
}

function generateUniqueId() {
    return 'file-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

function addFileToState(fileData) {
    const newFile = {
        id: generateUniqueId(),
        ...fileData
    };
    attachedFiles.push(newFile);
    // UI rendering and button state update are handled after all files are processed
}

function removeFileFromState(fileId) {
    attachedFiles = attachedFiles.filter(f => f.id !== fileId);
    renderFilePreviews(); // Re-render previews after removal
    checkGenerateButtonState(); // Update generate button state
}

function clearFileInputState() {
    // IMPORTANT: fileInput.value = '' is now handled in uploadFileBtn click handler
    fileNameDisplay.textContent = 'No files chosen';
    filePreview.innerHTML = '';
    filePreview.classList.remove('active'); // Hide preview container
    attachedFiles = [];
    checkGenerateButtonState(); // Update generate button state
}

function renderFilePreviews() {
    filePreview.innerHTML = '';
    if (attachedFiles.length === 0) {
        filePreview.classList.remove('active');
        fileNameDisplay.textContent = 'No files chosen';
        return;
    }

    filePreview.classList.add('active');
    fileNameDisplay.textContent = `${attachedFiles.length} file(s) chosen`;

    attachedFiles.forEach(file => {
        const item = document.createElement('div');
        item.className = 'file-preview-item';
        item.dataset.fileId = file.id;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-file-btn';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeFileFromState(file.id);
        };
        item.appendChild(removeBtn);

        if (file.type === 'image') {
            const img = document.createElement('img');
            img.src = `data:${file.mimeType};base64,${file.content}`;
            img.alt = `Preview of ${file.fileName}`;
            item.appendChild(img);
        } else { // Text or other file types we've extracted content from
            const icon = document.createElement('span');
            icon.className = 'icon';
            icon.textContent = '📄'; // Text file icon
            icon.style.fontSize = '2em'; // Adjust icon size
            item.appendChild(icon);
        }

        const name = document.createElement('span');
        name.className = 'file-name';
        name.textContent = file.fileName;
        item.appendChild(name);

        const size = document.createElement('span');
        size.className = 'file-size';
        size.textContent = `${(file.size / 1024).toFixed(1)} KB`;
        item.appendChild(size);

        filePreview.appendChild(item);
    });
}


// Check if generate button should be enabled
function checkGenerateButtonState() {
    // Generate button is disabled if voice recognition is active, regardless of other inputs
    if (voiceRecognitionActive) {
        generatePromptBtn.disabled = true;
        return;
    }

    // Otherwise, enable if there's text or files
    if (userInput.value.trim() !== '' || attachedFiles.length > 0) {
        generatePromptBtn.disabled = false;
    } else {
        generatePromptBtn.disabled = true;
    }
}

// --- Main Logic: Generate Prompt (Multimodal Support) ---
async function generatePrompt() {
    let inputText = userInput.value.trim();

    if (!inputText && attachedFiles.length === 0) {
        showError("Please enter some text, speak your idea, or upload a file (text/image).");
        return;
    }

    showLoading();

    try {
        // System instruction for the AI prompt engineer
        const systemInstruction = `
            You are an expert AI prompt engineer named "I Prompt You".
            Your task is to take the user's raw input (text, voice transcript, or file content, potentially including multiple images and text files) and convert it into a well-structured, clear, concise, and highly effective prompt suitable for another AI model to understand and execute a specific task.

            Consider the following aspects when refining the prompt:
            1.  **Clarity & Precision:** Ensure the intent is unambiguous and all terms are precisely defined if necessary.
            2.  **Specificity:** Include all necessary details, constraints, and requirements for the task.
            3.  **Context & Background:** Provide sufficient background information for the AI to understand the situation.
            4.  **Desired Output Format:** Specify the expected format (e.g., list, JSON, paragraph, code snippet, specific tone, length).
            5.  **Role Assignment (for the target AI):** If appropriate, suggest a persona or role for the target AI to adopt (e.g., "Act as a senior marketing specialist...").
            6.  **Examples (if applicable):** If the input implies a need for examples, suggest that the user might add them, or structure the prompt to accommodate them.

            Your output should be *only* the refined prompt. Do not add conversational filler, intros, or outros. Focus solely on producing the optimal prompt for the user's intent.
        `;

        const requestParts = [{ text: systemInstruction }];

        if (inputText) {
            requestParts.push({ text: `User's primary textual input: "${inputText}"` });
        }

        const uploadedTextContent = [];
        const uploadedImageParts = [];

        attachedFiles.forEach(file => {
            if (file.type === 'text') {
                uploadedTextContent.push(`--- File: ${file.fileName} ---\n${file.content}`);
            } else if (file.type === 'image') {
                uploadedImageParts.push({
                    inlineData: {
                        mimeType: file.mimeType,
                        data: file.content
                    }
                });
            }
        });

        if (uploadedTextContent.length > 0) {
            requestParts.push({ text: `Additional textual context from uploaded files:\n${uploadedTextContent.join('\n\n')}` });
        }

        if (uploadedImageParts.length > 0) {
            if (uploadedImageParts.length > 10) {
                throw new Error("Too many images uploaded. Please limit to 10 images per prompt for optimal performance with Gemini API.");
            }
            uploadedImageParts.forEach(part => requestParts.push(part));
            requestParts.push({ text: `Carefully analyze the provided image(s) in conjunction with the user's textual request and any other uploaded text to formulate the most effective prompt.` });
        }

        // --- Use local proxy endpoint ---
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: requestParts
                    }
                ]
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
            const generatedText = data.candidates[0].content.parts[0].text;
            outputPrompt.value = generatedText.trim();
            showCopyButton();

            // Save to history upon successful generation
            const attachedFileNames = attachedFiles.map(f => f.fileName);
            savePromptToHistory(inputText, generatedText.trim(), attachedFileNames);

        } else {
            throw new Error("No prompt generated. The AI might have refused, produced empty output, or encountered an internal issue.");
        }

    } catch (error) {
        console.error('Error generating prompt:', error);
        // User-friendly error message, especially if the server fails
        showError(`Failed to generate prompt: ${error.message}. Ensure the server is running and the API key is correct in the .env file.`);
        outputPrompt.value = "Failed to generate prompt. Please check your input or connection.";
    } finally {
        hideLoading();
    }
}

// --- Event Listeners ---
generatePromptBtn.addEventListener('click', generatePrompt);

// Voice Input (Speech Recognition) - Logic remains unchanged
voiceInputBtn.addEventListener('click', () => {
    if (voiceRecognitionActive) {
        if (recognition) {
            recognition.stop();
        }
        return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showError("Your browser does not fully support Speech Recognition (e.g., Chrome, Edge, Firefox). Please use text input.");
        return;
    }

    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();

    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    voiceInputBtn.innerHTML = '<span class="icon">🛑</span> <span class="btn-text">Stop Listening</span>';
    voiceInputBtn.classList.add('active-listening');
    voiceInputBtn.disabled = false;
    uploadFileBtn.disabled = true;
    generatePromptBtn.disabled = true;
    userInput.disabled = true;
    clearError();
    userInput.value = '';

    voiceRecognitionActive = true;
    recognition.start();

    recognition.onresult = (event) => {
        const speechResult = event.results[0][0].transcript;
        userInput.value = speechResult;
        checkGenerateButtonState();
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        showError(`Speech recognition error: ${event.error}. Please try again.`);
        // Reset state
        voiceInputBtn.innerHTML = '<span class="icon">🎤</span> <span class="btn-text">Speak Idea</span>';
        voiceInputBtn.classList.remove('active-listening');
        voiceInputBtn.disabled = false;
        uploadFileBtn.disabled = false;
        userInput.disabled = false;
        voiceRecognitionActive = false;
        checkGenerateButtonState();
    };

    recognition.onend = () => {
        if (voiceRecognitionActive) {
            voiceInputBtn.innerHTML = '<span class="icon">🎤</span> <span class="btn-text">Speak Idea</span>';
            voiceInputBtn.classList.remove('active-listening');
            voiceInputBtn.disabled = false;
            uploadFileBtn.disabled = false;
            userInput.disabled = false;
            voiceRecognitionActive = false;
            checkGenerateButtonState();
        }
    };
});


// File Upload - Logic remains unchanged
uploadFileBtn.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
});

fileInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (files.length === 0) {
        clearFileInputState();
        return;
    }

    clearError();
    clearFileInputState();

    const MAX_FILE_SIZE_MB = 5;
    const processingPromises = [];

    for (const file of files) {
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            showError(`File "${file.name}" is too large (>${MAX_FILE_SIZE_MB}MB). It will be skipped.`);
            continue;
        }

        const isTextFile = file.type.startsWith('text/') ||
                           /\.(txt|md|js|py|json|html|css|xml|csv|log|sh|rb|go|java|cpp|c|h|swift|kt|php|ts|tsx|jsx|scss|less|yaml|ini|cfg|toml|rtf)$/i.test(file.name);

        const isImageFile = file.type.startsWith('image/');

        const isComplexDocument = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i.test(file.name);
        const isAudioVideoFile = file.type.startsWith('audio/') || file.type.startsWith('video/');

        if (isAudioVideoFile || isComplexDocument) {
            showError(`Direct content extraction from "${file.name}" (${file.type}) is not fully supported client-side. Please describe its content in the text box for the AI. This file will be skipped.`);
            continue;
        }

        processingPromises.push(new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const fileData = {
                    fileName: file.name,
                    size: file.size
                };

                if (isTextFile) {
                    fileData.type = 'text';
                    fileData.content = e.target.result;
                } else if (isImageFile) {
                    fileData.type = 'image';
                    fileData.content = e.target.result.split(',')[1];
                    fileData.mimeType = file.type;
                }
                addFileToState(fileData);
                resolve();
            };

            reader.onerror = (e) => {
                console.error("File reading error:", e);
                showError(`Failed to read file "${file.name}".`);
                reject(e);
            };

            if (isTextFile) {
                reader.readAsText(file);
            } else if (isImageFile) {
                reader.readAsDataURL(file);
            }
        }));
    }

    try {
        await Promise.allSettled(processingPromises);
    } catch (error) {
        console.error("One or more files encountered an error during processing:", error);
    }

    renderFilePreviews();
    checkGenerateButtonState();
});


// Copy to Clipboard - Logic remains unchanged
copyPromptBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(outputPrompt.value);
        const originalContent = copyPromptBtn.innerHTML;
        copyPromptBtn.innerHTML = '<span class="icon">✅</span> <span class="btn-text">Copied!</span>';
        setTimeout(() => {
            copyPromptBtn.innerHTML = originalContent;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy text: ', err);
        showError('Failed to copy prompt to clipboard. Please copy manually.');
    }
});


// --- New Prompt / Refresh Functionality ---
function newPromptRefresh() {
    userInput.value = '';
    clearFileInputState();
    outputPrompt.value = '';
    clearError();
    copyPromptBtn.style.display = 'none';
    if (voiceRecognitionActive && recognition) {
        recognition.stop();
    }
    voiceInputBtn.innerHTML = '<span class="icon">🎤</span> <span class="btn-text">Speak Idea</span>';
    voiceInputBtn.classList.remove('active-listening');
    voiceRecognitionActive = false;
    userInput.disabled = false;
    uploadFileBtn.disabled = false;
    checkGenerateButtonState();
}

// Event Listeners for new header buttons
newPromptRefreshBtn.addEventListener('click', newPromptRefresh);
viewHistoryBtn.addEventListener('click', () => {
    renderHistoryModal();
    historyModal.style.display = 'flex';
});


// --- History Management (Unchanged) ---
const HISTORY_KEY = 'aiPromptHistory';
const MAX_HISTORY_ITEMS = 15;

function loadHistoryFromLocalStorage() {
    try {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
        return history.sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
        console.error("Failed to load history from local storage:", e);
        return [];
    }
}

function saveHistoryToLocalStorage(history) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        console.error("Failed to save history to local storage:", e);
        showError("Failed to save prompt to history. Local storage might be full or blocked.");
    }
}

function savePromptToHistory(rawInput, generatedPrompt, attachedFileNames) {
    let history = loadHistoryFromLocalStorage();

    const newEntry = {
        id: generateUniqueId(),
        timestamp: Date.now(),
        rawInputText: rawInput,
        generatedPrompt: generatedPrompt,
        attachedFiles: attachedFileNames
    };

    history.unshift(newEntry);

    if (history.length > MAX_HISTORY_ITEMS) {
        history = history.slice(0, MAX_HISTORY_ITEMS);
    }

    saveHistoryToLocalStorage(history);
}

function renderHistoryModal() {
    const history = loadHistoryFromLocalStorage();
    historyList.innerHTML = '';

    if (history.length === 0) {
        historyList.innerHTML = '<p class="no-history-message">No prompts saved yet. Generate a prompt to see it here!</p>';
        clearHistoryBtn.disabled = true;
        return;
    }

    clearHistoryBtn.disabled = false;

    history.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'history-item';

        const header = document.createElement('div');
        header.className = 'history-item-header';
        const timestamp = new Date(entry.timestamp).toLocaleString();
        header.innerHTML = `<span class="timestamp">${timestamp}</span>`;
        item.appendChild(header);

        const content = document.createElement('div');
        content.className = 'history-item-content';
        content.innerHTML = `
            <p><strong>Your Input:</strong> ${entry.rawInputText.substring(0, 100)}${entry.rawInputText.length > 100 ? '...' : ''}</p>
            <p><strong>Generated Prompt:</strong> ${entry.generatedPrompt.substring(0, 150)}${entry.generatedPrompt.length > 150 ? '...' : ''}</p>
        `;
        if (entry.attachedFiles && entry.attachedFiles.length > 0) {
            content.innerHTML += `<p class="file-note"><strong>Files:</strong> ${entry.attachedFiles.join(', ')} (Note: files are not reloaded)</p>`;
        }
        item.appendChild(content);

        const actions = document.createElement('div');
        actions.className = 'history-item-actions';

        const loadBtn = document.createElement('button');
        loadBtn.className = 'action-btn load-btn';
        loadBtn.textContent = 'Load';
        loadBtn.onclick = () => loadPromptFromHistory(entry.id);
        actions.appendChild(loadBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => deleteHistoryItem(entry.id);
        actions.appendChild(deleteBtn);

        item.appendChild(actions);
        historyList.appendChild(item);
    });
}

function loadPromptFromHistory(id) {
    const history = loadHistoryFromLocalStorage();
    const entry = history.find(item => item.id === id);

    if (entry) {
        newPromptRefresh();

        userInput.value = entry.rawInputText;
        outputPrompt.value = entry.generatedPrompt;

        if (entry.attachedFiles && entry.attachedFiles.length > 0) {
            showError(`Loaded text from history. Note: Original files (${entry.attachedFiles.join(', ')}) are NOT reloaded. Please re-upload if needed to use them.`);
        }

        showCopyButton();
        historyModal.style.display = 'none';
        checkGenerateButtonState();
    } else {
        showError("History item not found.");
    }
}

function deleteHistoryItem(id) {
    if (!confirm('Are you sure you want to delete this prompt from history?')) return;
    let history = loadHistoryFromLocalStorage();
    history = history.filter(item => item.id !== id);
    saveHistoryToLocalStorage(history);
    renderHistoryModal();
}

function clearAllHistory() {
    if (!confirm('Are you sure you want to clear ALL prompt history? This cannot be undone.')) return;
    localStorage.removeItem(HISTORY_KEY);
    renderHistoryModal();
}

// Event Listeners for History Modal
closeHistoryBtn.addEventListener('click', () => {
    historyModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === historyModal) {
        historyModal.style.display = 'none';
    }
});

clearHistoryBtn.addEventListener('click', clearAllHistory);


// Event listeners for input changes to enable/disable generate button
userInput.addEventListener('input', checkGenerateButtonState);

// Initial check on page load
checkGenerateButtonState();