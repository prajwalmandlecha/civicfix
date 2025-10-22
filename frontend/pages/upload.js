// import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initThemeToggle, initMobileMenu, showToast, protectPage } from './shared.js';

protectPage(); // This will check for auth and redirect if needed

let uploadedFiles = []; // Array to hold multiple files

function initUploadArea() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const submitBtn = document.getElementById('submit-btn');
    const locationInput = document.getElementById('location-input');
    const uploadPlaceholder = document.querySelector('.upload-placeholder'); // Get placeholder

    if (!uploadArea || !fileInput || !previewContainer || !submitBtn || !locationInput || !uploadPlaceholder) {
        console.error("One or more essential upload elements not found!");
        if (submitBtn) submitBtn.disabled = true;
        return;
    }

    // Function to check if submit should be enabled
    const checkSubmitButtonState = () => {
        const hasFiles = uploadedFiles.length > 0;
        const hasLocationText = locationInput.value.trim().length > 2;
        // Optional: Add file count limit check here if needed
        // const maxFiles = 5;
        // if (uploadedFiles.length > maxFiles) {
        //     showToast(`⚠️ Max ${maxFiles} images. ${uploadedFiles.length - maxFiles} removed.`);
        //     uploadedFiles = uploadedFiles.slice(0, maxFiles); // Enforce limit
        //     renderPreviews(); // Re-render after slicing
        // }
        submitBtn.disabled = !(hasFiles && hasLocationText);
    };

    // Add listeners to check state
    locationInput.addEventListener('input', checkSubmitButtonState);
    // --- UPDATED: Handle multiple files from input ---
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    // --- Upload Area Listeners ---
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragging'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragging'));
    // --- UPDATED: Handle multiple dropped files ---
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragging');
        handleFiles(e.dataTransfer.files); // Pass all dropped files
    });

    // --- NEW: Render multiple previews ---
    function renderPreviews() {
        previewContainer.innerHTML = ''; // Clear previous
        uploadPlaceholder.style.display = uploadedFiles.length > 0 ? 'none' : 'block';

        uploadedFiles.forEach((file, index) => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const preview = document.createElement('div');
                    preview.className = 'preview-item';
                    preview.innerHTML = `
                        <img src="${e.target.result}" alt="Preview ${index + 1}">
                        {/* Ensure data-index corresponds to the file's index in the array */}
                        <button class="preview-remove" data-index="${index}">&times;</button>
                    `;
                    previewContainer.appendChild(preview);
                };
                reader.readAsDataURL(file);
            } else {
                 // Skip non-images for multi-upload
                 console.log(`Skipping non-image file: ${file.name}`);
            }
        });
        checkSubmitButtonState(); // Update submit button after rendering
    }

    // --- UPDATED: Handle multiple files ---
    function handleFiles(files) {
        // Filter incoming files for images and append to existing array
        const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        if (imageFiles.length === 0 && files.length > 0) {
            showToast('⚠️ No valid image files selected/dropped.');
        }

        // Add the new valid files to our list
        uploadedFiles.push(...imageFiles);

        // Optional: Enforce a limit (e.g., 5 images total)
        const maxFiles = 5;
        if (uploadedFiles.length > maxFiles) {
            showToast(`⚠️ Maximum ${maxFiles} images allowed. Keeping the first ${maxFiles}.`);
            uploadedFiles = uploadedFiles.slice(0, maxFiles); // Keep only the first 5
        }

        renderPreviews(); // Render all current previews
    }

    // --- UPDATED: Handle preview removal from array ---
    previewContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('preview-remove')) {
            // Get index directly from the button attribute
            const indexToRemove = parseInt(e.target.getAttribute('data-index'));
            if (!isNaN(indexToRemove) && indexToRemove >= 0 && indexToRemove < uploadedFiles.length) {
                uploadedFiles.splice(indexToRemove, 1); // Remove file from array at the specific index
                renderPreviews(); // Re-render previews (indices will be updated)
            } else {
                console.error("Could not remove preview item, invalid index:", indexToRemove);
            }
        }
    });

    // --- UPDATED: Submit Logic to send multiple files ---
    submitBtn.addEventListener('click', async () => {
        const isAnonymous = document.getElementById('anonymous-toggle')?.checked || false;
        const descriptionInput = document.getElementById('description-input');
        const description = descriptionInput ? descriptionInput.value : '';
        const locationText = locationInput.value.trim();

        // Filter again just before upload to be sure
        const imageFilesToUpload = uploadedFiles.filter(file => file.type.startsWith('image/'));

        if (imageFilesToUpload.length === 0) { showToast('⚠️ Please select at least one image.'); return; }
        if (!locationText) { showToast('⚠️ Please enter the location.'); locationInput.focus(); return; }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        showToast(`⏳ Uploading ${imageFilesToUpload.length} image(s) & finding coordinates...`);

        const formData = new FormData();
        // --- Append MULTIPLE files under the 'files' key ---
        imageFilesToUpload.forEach((file) => {
            formData.append('files', file, file.name); // Key MUST match backend expectation
        });
        formData.append('description', description);
        formData.append('location_text', locationText); // Send text location
        // formData.append('is_anonymous', isAnonymous);

        try {
            // --- Point to the MULTI-FILE backend endpoint ---
            const response = await fetch('http://localhost:8000/submit-issue-multi', { // Ensure this endpoint exists
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                let errorDetail = `Error ${response.status}`;
                try { const errorData = await response.json(); errorDetail = errorData.detail || errorDetail; } catch (e) { /* Ignore */ }
                if (response.status === 400 && errorDetail.includes("Could not find coordinates")) showToast(`❌ Location Error: ${errorDetail}`);
                else showToast(`❌ Submission failed: ${errorDetail}`);
                throw new Error(errorDetail);
            }

            const result = await response.json();
            console.log("Submit successful, analysis result:", result);
            const message = isAnonymous ? '✅ Submitted! Analysis running...' : '✅ Submitted! +10 karma. Analysis running...';
            showToast(message);
            // Clear form on success before redirect
            uploadedFiles = [];
            renderPreviews();
            if(descriptionInput) descriptionInput.value = '';
            locationInput.value = '';
            fileInput.value = ''; // Clear file input selection
            checkSubmitButtonState(); // Disable button

            setTimeout(() => { window.location.href = '/feed.html'; }, 1500);

        } catch (error) {
            console.error('Submission failed:', error);
            if (!error.message.includes("Could not find coordinates")) showToast(`❌ Submission failed: ${error.message}`);
            // Re-enable button only if files/location are still valid
            checkSubmitButtonState();
            submitBtn.textContent = 'Submit Issue';
        }
    });
}

// Voice recording is commented out/removed as requested
// function initVoiceRecording() { ... }

document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initMobileMenu();
    initUploadArea();
    // initVoiceRecording(); // Not called
});