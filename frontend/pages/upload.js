// frontend/pages/upload.js
import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js';

// --- MULTI FILE SUPPORT ---
let uploadedFiles = [];

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

    // --- Check submit button state ---
    const checkSubmitButtonState = () => {
        const hasFiles = uploadedFiles.length > 0;
        const hasLocationText = locationInput.value.trim().length > 2;
        submitBtn.disabled = !(hasFiles && hasLocationText);
    };

    // --- Listeners ---
    locationInput.addEventListener('input', checkSubmitButtonState);

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragging');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragging'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragging');
        handleFiles(e.dataTransfer.files);
    });

    // --- Render multiple previews ---
    function renderPreview() {
        previewContainer.innerHTML = '';
        uploadPlaceholder.style.display = uploadedFiles.length ? 'none' : 'block';

        uploadedFiles.forEach((file, index) => {
            if (!file.type.startsWith('image/')) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.createElement('div');
                preview.className = 'preview-item';
                preview.innerHTML = `
                    <img src="${e.target.result}" alt="Preview">
                    <button class="preview-remove" data-index="${index}">&times;</button>
                `;
                previewContainer.appendChild(preview);
            };
            reader.readAsDataURL(file);
        });

        checkSubmitButtonState();
    }

    // --- Handle multiple files ---
    function handleFiles(files) {
        const validImages = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (validImages.length < files.length) {
            showToast('⚠️ Only image files are allowed.');
        }
        uploadedFiles = uploadedFiles.concat(validImages);
        renderPreview();
    }

    // --- Remove preview ---
    previewContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('preview-remove')) {
            const index = parseInt(e.target.dataset.index);
            uploadedFiles.splice(index, 1);
            renderPreview();
        }
    });

    // --- Submit Logic for MULTI ---
    // --- Submit Logic for MULTI ---
submitBtn.addEventListener('click', async () => {
    const isAnonymous = document.getElementById('anonymous-toggle')?.checked || false;
    const descriptionInput = document.getElementById('description-input');
    const description = descriptionInput ? descriptionInput.value.trim() : '';
    const locationText = locationInput.value.trim();

    // Auth Check
    const idToken = localStorage.getItem('firebaseIdToken');
    if (!idToken) {
        showToast('⚠️ Please log in to submit an issue.');
        localStorage.setItem('redirectAfterLogin', window.location.pathname);
        window.location.href = '/login.html';
        return;
    }

    if (!uploadedFiles.length) {
        showToast('⚠️ Please select at least one image.');
        return;
    }
    if (!locationText) {
        showToast('⚠️ Please enter the location.');
        locationInput.focus();
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    showToast('⏳ Uploading images & finding coordinates...');

    const formData = new FormData();
    uploadedFiles.forEach(file => formData.append('files', file, file.name));
    formData.append('description', description);
    formData.append('location_text', locationText);   // ✅ FIXED
    formData.append('is_anonymous', isAnonymous ? 'true' : 'false');  // ✅ correct

    try {
        const response = await fetch('http://localhost:8000/submit-issue-multi', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`
            },
            body: formData,
        });

        if (!response.ok) {
            let errorDetail = `Error ${response.status}`;
            try {
                const errorData = await response.json();
                errorDetail = errorData.detail || errorDetail;
            } catch (e) { }

            if (response.status === 401 || response.status === 403) {
                errorDetail = "Authentication failed. Please log in again.";
            } else if (response.status === 400 && errorDetail.includes("Cannot find coords")) {
                showToast(`❌ Location Error: ${errorDetail}`);
            } else {
                showToast(`❌ Submission failed: ${errorDetail}`);
            }
            throw new Error(errorDetail);
        }

        const result = await response.json();
        console.log("Submit successful, analysis result:", result);

        const message = result.message || (isAnonymous ? '✅ Submitted anonymously!' : '✅ Submitted successfully!');
        showToast(message);

        uploadedFiles = [];
        renderPreview();
        if (descriptionInput) descriptionInput.value = '';
        locationInput.value = '';
        fileInput.value = '';
        checkSubmitButtonState();

        setTimeout(() => { window.location.href = '/feed.html'; }, 1500);
    } catch (error) {
        console.error('Submission failed:', error);
        showToast(`❌ Submission failed: ${error.message}`);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Issue';
    }
});

}

document.addEventListener('DOMContentLoaded', () => {
    initializeAuthListener();
    initThemeToggle();
    initMobileMenu();
    initUploadArea();
});
