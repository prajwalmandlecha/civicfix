// frontend/pages/ngo_upload.js

// --- Import shared functions AND the new auth listener ---
import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js';
// --- Import Firebase services ---
import { auth } from '../firebaseConfig.js';
import { onAuthStateChanged, getIdToken } from "firebase/auth";

// --- REMOVED: protectPage() call ---

// --- Define variables in the global scope for this script ---
let uploadedFile = null;
let currentToken = null; // Store the token

// --- 3. Fetch Open Issues and Populate Dropdown ---
async function loadOpenIssues() {
    const issueSelect = document.getElementById('issue-select');
    if (!issueSelect) {
        console.error("issue-select element not found");
        return;
    }
    
    if (!currentToken) {
        showToast("⚠️ Authentication token not found. Cannot load issues.");
        return;
    }

    try {
        const response = await fetch('http://localhost:8000/api/issues', {
             headers: {
                 'Authorization': `Bearer ${currentToken}` // Send token
             }
        });
        
        if (!response.ok) {
            let errorMsg = `Failed to fetch issues (Status: ${response.status})`;
            try {
                const errData = await response.json();
                errorMsg = errData.detail || errorMsg;
            } catch(e) {}
            throw new Error(errorMsg);
        }

        const data = await response.json();
        
        // Filter for "open" issues only
        const openIssues = data.issues.filter(issue => issue.status === 'open');

        issueSelect.innerHTML = '<option value="">-- Select an open issue --</option>'; // Clear loading text
        
        if (openIssues.length === 0) {
             issueSelect.innerHTML = '<option value="">No open issues found</option>';
             issueSelect.disabled = true;
             return;
        }

        // Populate dropdown
        openIssues.forEach(issue => {
            const issueType = (issue.issue_types && issue.issue_types[0]) || 'Issue';
            const shortDesc = (issue.description || issue.auto_caption || 'No description').substring(0, 50);
            const option = document.createElement('option');
            option.value = issue.issue_id;
            // Use the display_address from the backend
            option.textContent = `[${issueType.replace(/_/g, ' ')}] - ${shortDesc}... (${issue.display_address || '...'})`;
            issueSelect.appendChild(option);
        });
        issueSelect.disabled = false; // Enable select

    } catch (error) {
        console.error("Error loading open issues:", error);
        issueSelect.innerHTML = '<option value="">Error loading issues</option>';
        showToast(`❌ ${error.message}`);
    }
}

// --- 4. File Handling (Simplified for one file) ---
function handleFile(file) {
    const previewContainer = document.getElementById('preview-container');
    const uploadPlaceholder = document.querySelector('.upload-placeholder');
    const fileInput = document.getElementById('file-input');
    
    if (!fileInput || !previewContainer || !uploadPlaceholder) {
        console.error("File handling elements not found");
        return;
    }

    if (!file) {
        uploadedFile = null;
        previewContainer.innerHTML = '';
        uploadPlaceholder.style.display = 'block';
        checkSubmitButtonState();
        return;
    }
    
    // Check for image or video
     if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        showToast('⚠️ Please upload an image or video file.');
        fileInput.value = ''; // Reset input
        return;
    }

    uploadedFile = file;
    previewContainer.innerHTML = '';
    uploadPlaceholder.style.display = 'none';

    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.createElement('div');
        preview.className = 'preview-item';
        let mediaElement = '';
        if (file.type.startsWith('image/')) {
            mediaElement = `<img src="${e.target.result}" alt="Preview">`;
        } else if (file.type.startsWith('video/')) {
             mediaElement = `<video controls src="${e.target.result}"></video>`;
        }
        preview.innerHTML = `${mediaElement}<button class="preview-remove" data-index="0">&times;</button>`;
        previewContainer.appendChild(preview);
    };
    reader.readAsDataURL(file);
    checkSubmitButtonState();
}

// --- 5. Form Validation ---
function checkSubmitButtonState() {
    const submitBtn = document.getElementById('submit-btn');
    const issueSelect = document.getElementById('issue-select');
    if (!submitBtn || !issueSelect) return;

    const hasFile = uploadedFile != null;
    const hasIssueSelected = issueSelect.value !== "";
    submitBtn.disabled = !(hasFile && hasIssueSelected);
}

// --- 6. Initialize Page ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Call auth listener FIRST
    initializeAuthListener();
    initThemeToggle();
    initMobileMenu();

    // --- Get all elements INSIDE DOMContentLoaded ---
    // This ensures they exist before we add listeners
    const fixForm = document.getElementById('ngo_fix-form'); // <-- FIX: Use hyphen
    const issueSelect = document.getElementById('issue-select');
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const descriptionInput = document.getElementById('fix-description');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessageElement = document.getElementById('error-message');

    // Check if essential form elements exist
    if (!fixForm || !issueSelect || !uploadArea || !fileInput || !previewContainer || !descriptionInput || !submitBtn || !errorMessageElement) {
         console.error("Failed to initialize NGO upload form. One or more elements are missing.");
         return;
    }

    // --- 2. Get User and Token ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                currentToken = await getIdToken(user);
                console.log("NGO user token retrieved.");
                // Now that we have a token, load the open issues
                loadOpenIssues();
            } catch (error) {
                console.error("Error getting user token:", error);
                showToast("❌ Could not verify user session. Please log in again.");
                window.location.replace('/ngo_login.html');
            }
        } else {
            // No user found. initializeAuthListener should have already redirected.
            // This is a fallback.
            console.log("No user found by onAuthStateChanged, redirecting.");
            window.location.replace('/ngo_login.html');
        }
    });

    // --- Add File Listeners ---
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragging'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragging'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragging');
        handleFile(e.dataTransfer.files[0]);
    });
    previewContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('preview-remove')) {
            fileInput.value = ''; // Clear file input
            handleFile(null); // Clear file
        }
    });

    // --- Add Form Listeners ---
    issueSelect.addEventListener('change', checkSubmitButtonState);

    fixForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessageElement.textContent = '';

        const selectedIssueId = issueSelect.value;
        const fixDescription = descriptionInput.value.trim();

        if (!selectedIssueId) { showToast("⚠️ Please select an issue."); return; }
        if (!uploadedFile) { showToast("⚠️ Please upload a proof file."); return; }
        if (!currentToken) { showToast("⚠️ Auth token missing. Please refresh."); return; }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting Fix...';
        showToast('⏳ Uploading fix and calling verifier...');

        const formData = new FormData();
        formData.append('file', uploadedFile);
        formData.append('description', fixDescription);

        try {
            const response = await fetch(`http://localhost:8000/api/issues/${selectedIssueId}/submit-fix`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                },
                body: formData,
            });

            if (!response.ok) {
                let errorDetail = `Error ${response.status}`;
                try { const errorData = await response.json(); errorDetail = errorData.detail || errorData.detail; } catch (e) { /* Ignore */ }
                throw new Error(errorDetail);
            }

            const result = await response.json();
            console.log("Fix submission successful:", result);
            showToast('✅ Fix submitted! Awaiting verification.');

            setTimeout(() => { window.location.href = '/feed.html'; }, 1500);

        } catch (error) {
            console.error('Fix submission failed:', error);
            showToast(`❌ Submission failed: ${error.message}`);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Fix';
        }
    });
});