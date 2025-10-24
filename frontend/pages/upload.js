// frontend/pages/upload.js
import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js';

const API_BASE = 'https://civicfix-backend-809180458813.asia-south1.run.app';

// --- Reverted to single file variable ---
let uploadedFile = null;

function initUploadArea() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const submitBtn = document.getElementById('submit-btn');
    const locationInput = document.getElementById('location-input');
    const uploadPlaceholder = document.querySelector('.upload-placeholder');

    if (!uploadArea || !fileInput || !previewContainer || !submitBtn || !locationInput || !uploadPlaceholder) {
        console.error("One or more essential upload elements not found!");
        if (submitBtn) submitBtn.disabled = true;
        return;
    }

    // --- UPDATED: Check state for single file ---
    const checkSubmitButtonState = () => {
        const hasFile = uploadedFile != null; // Check single file
        const hasLocationText = locationInput.value.trim().length > 2;
        submitBtn.disabled = !(hasFile && hasLocationText);
    };

    // Add listeners
    locationInput.addEventListener('input', checkSubmitButtonState);
    // --- UPDATED: Handle single file change ---
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0])); // Get first file only

    // --- Upload Area Listeners (Drop updated) ---
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragging'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragging'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragging');
        // --- UPDATED: Handle single dropped file ---
        handleFile(e.dataTransfer.files[0]); // Get first file only
    });

    // --- UPDATED: Render preview for single file ---
    function renderPreview() {
        previewContainer.innerHTML = ''; // Clear previous
        uploadPlaceholder.style.display = uploadedFile ? 'none' : 'block';

        if (uploadedFile && uploadedFile.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.createElement('div');
                preview.className = 'preview-item';
                preview.innerHTML = `
                    <img src="${e.target.result}" alt="Preview">
                    <button class="preview-remove" data-index="0">&times;</button>
                `; // Keep data-index="0" for consistency
                previewContainer.appendChild(preview);
            };
            reader.readAsDataURL(uploadedFile);
        } else if (uploadedFile) {
             console.log(`Skipping non-image file: ${uploadedFile.name}`);
             uploadedFile = null; // Discard non-image file
             showToast('⚠️ Only image files are allowed.');
        }
        checkSubmitButtonState(); // Update submit button
    }

    // --- UPDATED: Handle single file ---
    function handleFile(file) {
        if (!file) { // Handle clearing the file
             uploadedFile = null;
        } else if (file.type.startsWith('image/')) {
            uploadedFile = file; // Store the single valid file
        } else {
            uploadedFile = null; // Reset if invalid type
            showToast('⚠️ Only image files are allowed.');
            fileInput.value = ''; // Clear the input field
        }
        renderPreview(); // Render the single preview (or clear it)
    }

    // --- UPDATED: Handle preview removal for single file ---
    previewContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('preview-remove')) {
            uploadedFile = null; // Clear the single file variable
            fileInput.value = ''; // Clear the actual file input
            renderPreview(); // Re-render (will clear preview)
        }
    });

    // --- UPDATED: Submit Logic for single file ---
    submitBtn.addEventListener('click', async () => {
        const isAnonymous = document.getElementById('anonymous-toggle')?.checked || false;
        const descriptionInput = document.getElementById('description-input');
        const description = descriptionInput ? descriptionInput.value.trim() : ''; // Trim description
        const locationText = locationInput.value.trim();

        // Auth Check
        const idToken = localStorage.getItem('firebaseIdToken');
        if (!idToken) {
            showToast('⚠️ Please log in to submit an issue.');
            localStorage.setItem('redirectAfterLogin', window.location.pathname);
            window.location.href = '/login.html';
            return;
        }

        // --- UPDATED: Check single file ---
        if (!uploadedFile) { showToast('⚠️ Please select an image file.'); return; }
        if (!locationText) { showToast('⚠️ Please enter the location.'); locationInput.focus(); return; }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        showToast(`⏳ Uploading image & finding coordinates...`); // Updated message

        const formData = new FormData();
        // --- UPDATED: Append SINGLE file under 'file' key ---
        formData.append('file', uploadedFile, uploadedFile.name); // Key MUST match /submit-issue backend
        formData.append('description', description);
        // --- UPDATED: Key name to match /submit-issue backend ---
        formData.append('locationstr', locationText); // Use 'locationstr'
        formData.append('is_anonymous', isAnonymous);

        try {
            // --- Point to the SINGLE-FILE backend endpoint ---
            const response = await fetch(`${API_BASE}/submit-issue`, { // Changed URL
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`
                    // NO 'Content-Type' for FormData
                },
                body: formData,
            });

            if (!response.ok) {
                let errorDetail = `Error ${response.status}`;
                 try {
                     const errorData = await response.json();
                     errorDetail = errorData.detail || errorDetail;
                 } catch (e) { /* Ignore if response is not JSON */ }

                if (response.status === 401 || response.status === 403) {
                     errorDetail = "Authentication failed. Please log in again.";
                     // Optionally clear local storage and redirect here too
                } else if (response.status === 400 && errorDetail.includes("Cannot find coords")) {
                    showToast(`❌ Location Error: ${errorDetail}`); // Show specific error for geocoding
                } else {
                    showToast(`❌ Submission failed: ${errorDetail}`);
                }
                throw new Error(errorDetail); // Throw after showing toast
            }

            const result = await response.json();
            console.log("Submit successful, analysis result:", result);
            // Use backend message or default (consider adding first post karma message here later if needed)
            const message = result.message || (isAnonymous ? '✅ Submitted! Analysis running...' : '✅ Submitted! Analysis running...'); // Simplified message
            showToast(message);

            // Clear form on success
            uploadedFile = null;
            renderPreview(); // Clear preview
            if(descriptionInput) descriptionInput.value = '';
            locationInput.value = '';
            fileInput.value = ''; // Clear file input
            checkSubmitButtonState(); // Disable button

            setTimeout(() => { window.location.href = '/feed.html'; }, 1500);

        } catch (error) {
            console.error('Submission failed:', error);
            // Avoid showing redundant toast if already shown in the !response.ok block
            if (!(response && !response.ok)) {
                showToast(`❌ Submission failed: ${error.message}`);
            }
            submitBtn.disabled = false; // Re-enable button on error
            submitBtn.textContent = 'Submit Issue';
        }
    });
}

// initVoiceRecording remains commented out

document.addEventListener('DOMContentLoaded', () => {
    initializeAuthListener();
    initThemeToggle();
    initMobileMenu();
    initUploadArea();
});