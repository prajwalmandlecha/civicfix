// frontend/pages/ngo_upload.js

// --- Import shared functions AND the new auth listener ---
import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js';
// --- Import Firebase services ---
import { auth } from '../firebaseConfig.js';
import { onAuthStateChanged, getIdToken } from "firebase/auth";

// --- UPDATED: Use array for multiple files ---
let uploadedFiles = []; // Array to hold multiple image files
let currentToken = null; // Store the token

// --- Fetch Open Issues and Populate Dropdown (No changes needed here) ---
async function loadOpenIssues() {
    const issueSelect = document.getElementById('issue-select');
    if (!issueSelect) {
        console.error("issue-select element not found");
        return;
    }

    if (!currentToken) {
        showToast("⚠️ Authentication token not found. Cannot load issues.");
        // Consider disabling the select here if token is missing
        if (issueSelect) {
             issueSelect.innerHTML = '<option value="">Auth Error</option>';
             issueSelect.disabled = true;
        }
        return;
    }

    // --- Show loading state ---
    issueSelect.innerHTML = '<option value="">Loading open issues...</option>';
    issueSelect.disabled = true;

    try {
        const response = await fetch('http://localhost:8000/api/issues', { // Ensure correct backend URL
             headers: {
                 'Authorization': `Bearer ${currentToken}` // Send token
             }
        });

        if (!response.ok) {
            let errorMsg = `Failed to fetch issues (Status: ${response.status})`;
            try {
                const errData = await response.json();
                errorMsg = errData.detail || errorMsg;
            } catch(e) {/* ignore json parse error */}
            throw new Error(errorMsg);
        }

        const data = await response.json();

        // Filter for "open" issues only
        const openIssues = data.issues.filter(issue => issue.status === 'open');

        // Clear loading text and prepare for options
        issueSelect.innerHTML = '<option value="">-- Select an open issue --</option>';

        if (openIssues.length === 0) {
             issueSelect.innerHTML = '<option value="">No open issues found</option>';
             issueSelect.disabled = true; // Keep disabled if no issues
             return;
        }

        // Populate dropdown
        openIssues.forEach(issue => {
            const issueType = (Array.isArray(issue.issue_types) && issue.issue_types[0]) || 'Issue';
            const shortDesc = (issue.description || issue.auto_caption || 'No description').substring(0, 50);
            const option = document.createElement('option');
            option.value = issue.issue_id;
            // Use the display_address from the backend
            const address = issue.display_address ? ` (${issue.display_address})` : '';
            option.textContent = `[${issueType.replace(/_/g, ' ')}] - ${shortDesc}...${address}`;
            issueSelect.appendChild(option);
        });
        issueSelect.disabled = false; // Enable select ONLY if issues were loaded

    } catch (error) {
        console.error("Error loading open issues:", error);
        issueSelect.innerHTML = '<option value="">Error loading issues</option>';
        issueSelect.disabled = true; // Ensure disabled on error
        showToast(`❌ Error loading issues: ${error.message}`);
    } finally {
        checkSubmitButtonState(); // Check button state after loading finishes or fails
    }
}


// --- UPDATED: Render multiple previews ---
function renderPreviews() {
    const previewContainer = document.getElementById('preview-container');
    const uploadPlaceholder = document.querySelector('.upload-placeholder');
    if (!previewContainer || !uploadPlaceholder) return;

    previewContainer.innerHTML = ''; // Clear previous previews
    uploadPlaceholder.style.display = uploadedFiles.length > 0 ? 'none' : 'block';

    uploadedFiles.forEach((file, index) => {
        // Only render images
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.createElement('div');
                preview.className = 'preview-item';
                preview.innerHTML = `
                    <img src="${e.target.result}" alt="Preview ${index + 1}">
                    <button class="preview-remove" data-index="${index}">&times;</button>
                `;
                previewContainer.appendChild(preview);
            };
            reader.readAsDataURL(file);
        }
    });
    checkSubmitButtonState(); // Update submit button state after rendering
}

// --- UPDATED: Handle multiple files (images only) ---
function handleFiles(files) {
    const fileInput = document.getElementById('file-input'); // Needed to reset if no valid files
    // Filter for image files only
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0 && files.length > 0) {
        showToast('⚠️ No valid image files selected/dropped. Only images are allowed.');
        if (fileInput) fileInput.value = ''; // Reset input if only invalid files were selected
    } else if (imageFiles.length > 0) {
        // Add only the valid image files to our list
        // Prevent adding duplicates if the same file is selected again
        imageFiles.forEach(newFile => {
             if (!uploadedFiles.some(existingFile => existingFile.name === newFile.name && existingFile.size === newFile.size && existingFile.lastModified === newFile.lastModified)) {
                 uploadedFiles.push(newFile);
             } else {
                  console.log(`Skipping duplicate file: ${newFile.name}`);
             }
        });

        // Enforce a limit (e.g., 5 images total)
        const maxFiles = 5;
        if (uploadedFiles.length > maxFiles) {
            const removedCount = uploadedFiles.length - maxFiles;
            showToast(`⚠️ Max ${maxFiles} images allowed. ${removedCount} oldest image(s) removed.`);
            uploadedFiles = uploadedFiles.slice(-maxFiles); // Keep the latest N files
        }
    }
    renderPreviews(); // Render previews for all current valid files
}

// --- UPDATED: Form Validation for multiple files ---
function checkSubmitButtonState() {
    const submitBtn = document.getElementById('submit-btn');
    const issueSelect = document.getElementById('issue-select');
    if (!submitBtn || !issueSelect) return;

    const hasFiles = uploadedFiles.length > 0; // Check if array has files
    const hasIssueSelected = issueSelect.value !== "" && !issueSelect.disabled; // Also check if select is enabled
    submitBtn.disabled = !(hasFiles && hasIssueSelected);
}

// --- Initialize Page ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Call auth listener FIRST
    initializeAuthListener();
    initThemeToggle();
    initMobileMenu();

    // Get elements
    const fixForm = document.getElementById('ngo_fix-form'); // Use underscore
    const issueSelect = document.getElementById('issue-select');
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const descriptionInput = document.getElementById('fix-description');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessageElement = document.getElementById('error-message');

    // Check elements exist
    if (!fixForm || !issueSelect || !uploadArea || !fileInput || !previewContainer || !descriptionInput || !submitBtn || !errorMessageElement) {
         console.error("Failed to initialize NGO upload form. One or more elements are missing.");
         if (submitBtn) submitBtn.disabled = true; // Ensure button is disabled
         if (issueSelect) issueSelect.disabled = true; // Ensure select is disabled
         return;
    }

    // 2. Get User Token and Load Issues
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                currentToken = await getIdToken(user, /* forceRefresh */ true); // Refresh token proactively
                console.log("NGO user token retrieved/refreshed.");
                // Now that we have a token, load the open issues
                loadOpenIssues(); // Trigger loading issues
            } catch (error) {
                console.error("Error getting user token:", error);
                showToast("❌ Could not verify user session. Please log in again.");
                currentToken = null; // Clear token on error
                loadOpenIssues(); // Call again to show auth error state in dropdown
                // Optional: Redirect immediately
                // window.location.replace('/ngo_login.html');
            }
        } else {
            console.log("No user found by onAuthStateChanged, should redirect via auth listener.");
            currentToken = null; // Ensure token is null
            loadOpenIssues(); // Call again to show auth error state in dropdown
            // Redirect happens via initializeAuthListener if this page is protected
        }
    });

    // --- Add File Listeners (Handle multiple files) ---
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files); // Use handleFiles
        // Reset input value to allow selecting the same file again after removing it
        e.target.value = null;
    });
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragging'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragging'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragging');
        handleFiles(e.dataTransfer.files); // Use handleFiles
    });

    // --- UPDATED: Handle preview removal from array ---
    previewContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('preview-remove')) {
            // Use try-catch for safety
            try {
                const indexToRemove = parseInt(e.target.getAttribute('data-index'));
                if (!isNaN(indexToRemove) && indexToRemove >= 0 && indexToRemove < uploadedFiles.length) {
                    uploadedFiles.splice(indexToRemove, 1); // Remove file from array
                    renderPreviews(); // Re-render previews to update indices
                    // Reset file input value to allow re-selecting the same file(s) if needed
                    if (fileInput) fileInput.value = '';
                } else {
                    console.error("Could not remove preview item, invalid index:", indexToRemove);
                }
            } catch (error) {
                 console.error("Error removing preview:", error);
            }
        }
    });

    // --- Add Form Listeners ---
    issueSelect.addEventListener('change', checkSubmitButtonState);

    // --- UPDATED: Submit Logic for multiple files ---
    fixForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (errorMessageElement) errorMessageElement.textContent = ''; // Clear previous errors

        const selectedIssueId = issueSelect.value;
        const fixDescription = descriptionInput.value.trim();

        // Validate form state
        if (!selectedIssueId) { showToast("⚠️ Please select an issue."); return; }
        if (uploadedFiles.length === 0) { showToast("⚠️ Please upload at least one proof image."); return; } // Check array length
        if (!currentToken) {
             showToast("⚠️ Auth token missing. Please refresh or log in again.");
             // Try refreshing token again just before submit
             const user = auth.currentUser;
             if (user) {
                 try { currentToken = await getIdToken(user, true); } catch { currentToken = null; }
             }
             if (!currentToken) return; // Stop if still no token
        }

        submitBtn.disabled = true;
        submitBtn.textContent = `Submitting Fix (${uploadedFiles.length} images)...`; // Update text
        showToast('⏳ Uploading fix images and calling verifier...');

        const formData = new FormData();
        // --- Append MULTIPLE files under the 'files' key ---
        uploadedFiles.forEach((file, index) => {
            // Use unique key names if backend expects 'file1', 'file2' etc.
            // Or use the same key 'files' if backend handles list
            formData.append('files', file, file.name); // Key MUST match backend expected key
        });
        formData.append('description', fixDescription); // Send description

        try {
            // --- Call the submit-fix endpoint (ensure backend handles 'files') ---
            const response = await fetch(`http://localhost:8000/api/issues/${selectedIssueId}/submit-fix`, { // Ensure correct backend URL
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                    // NO 'Content-Type' for FormData
                },
                body: formData,
            });

            if (!response.ok) {
                let errorDetail = `Error ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorDetail = errorData.detail || errorDetail; // Use backend detail
                } catch (e) { /* Ignore JSON parse error */ }

                 // Handle specific errors like auth failure
                if (response.status === 401 || response.status === 403) {
                     errorDetail = "Authentication failed. Please log in again.";
                     // Clear session and redirect
                    localStorage.removeItem('firebaseIdToken');
                    localStorage.removeItem('userEmail');
                    localStorage.removeItem('userType');
                    window.location.href = '/ngo_login.html';
                }
                throw new Error(errorDetail); // Throw error to be caught below
            }

            const result = await response.json();
            console.log("Fix submission successful:", result);
            showToast('✅ Fix submitted! Awaiting verification.');

            // Clear form and redirect on success
            uploadedFiles = [];
            renderPreviews();
            if (descriptionInput) descriptionInput.value = '';
            issueSelect.value = ''; // Reset dropdown
            if (fileInput) fileInput.value = ''; // Clear file input
            checkSubmitButtonState(); // Disable button

            setTimeout(() => { window.location.href = '/feed.html'; }, 1500);

        } catch (error) {
            console.error('Fix submission failed:', error);
            showToast(`❌ Submission failed: ${error.message}`);
            // Re-enable button ONLY if we didn't redirect due to auth error
             if (!error.message.includes("Authentication failed")) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Fix';
            }
        }
    });

    // Initial check in case dropdown loads instantly with no issues
    checkSubmitButtonState();
});