import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js';
import { auth } from '../firebaseConfig.js';
import { onAuthStateChanged, getIdToken } from "firebase/auth";

const API_BASE = 'http://localhost:8000';

let currentToken = null;
let uploadedImage = null;
let userLocation = null;
let detectedIssues = [];

// Issue types mapping
const ISSUE_TYPES = {
  'ROAD_POTHOLE': 'Pothole',
  'WASTE_BULKY_DUMP': 'Garbage/Waste',
  'STREETLIGHT_OUTAGE': 'Streetlight Outage',
  'DRAIN_BLOCKAGE': 'Drain Blockage',
  'ILLEGAL_CONSTRUCTION_DEBRIS': 'Construction Debris'
};

// Handle image selection
function handleImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', 'error');
    return;
  }

  uploadedImage = file;
  displayImagePreview(file);
  checkFormValidity();
}

// Display image preview
function displayImagePreview(file) {
  const previewContainer = document.getElementById('image-preview-container');
  const uploadPlaceholder = document.getElementById('upload-placeholder');

  const reader = new FileReader();
  reader.onload = (e) => {
    previewContainer.innerHTML = `
      <div class="image-preview">
        <img src="${e.target.result}" alt="Preview" class="preview-image">
        <button class="remove-image-btn" id="remove-image-btn">✕</button>
      </div>
    `;
    
    uploadPlaceholder.style.display = 'none';
    previewContainer.style.display = 'block';

    // Add remove button listener
    document.getElementById('remove-image-btn').addEventListener('click', removeImage);
  };
  reader.readAsDataURL(file);
}

// Remove image
function removeImage() {
  uploadedImage = null;
  const previewContainer = document.getElementById('image-preview-container');
  const uploadPlaceholder = document.getElementById('upload-placeholder');
  const fileInput = document.getElementById('file-input');

  previewContainer.innerHTML = '';
  previewContainer.style.display = 'none';
  uploadPlaceholder.style.display = 'block';
  fileInput.value = '';
  
  checkFormValidity();
}

// Get current location
async function getUserLocation() {
  const locationBtn = document.getElementById('get-location-btn');
  const locationText = document.getElementById('location-text');

  if (locationBtn) locationBtn.disabled = true;
  if (locationText) locationText.textContent = 'Getting location...';

  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser', 'error');
    if (locationBtn) locationBtn.disabled = false;
    if (locationText) locationText.textContent = 'Location not set';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      userLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };

      // Reverse geocode to get address
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${userLocation.latitude}&lon=${userLocation.longitude}&format=json`
        );
        const data = await response.json();
        userLocation.address = data.display_name || `${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`;
      } catch (error) {
        console.error('Error geocoding:', error);
        userLocation.address = `${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`;
      }

      if (locationText) {
        locationText.textContent = userLocation.address;
      }

      showToast('Location captured successfully', 'success');
      if (locationBtn) locationBtn.disabled = false;
      checkFormValidity();
    },
    (error) => {
      console.error('Error getting location:', error);
      showToast('Unable to get location. Please enable location services.', 'error');
      if (locationBtn) locationBtn.disabled = false;
      if (locationText) locationText.textContent = 'Location not set - Click to retry';
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// Check form validity
function checkFormValidity() {
  const submitBtn = document.getElementById('submit-btn');
  const hasImage = uploadedImage !== null;
  const hasLocation = userLocation !== null;

  if (submitBtn) {
    submitBtn.disabled = !(hasImage && hasLocation);
  }
}

// Upload issue
async function handleSubmit() {
  if (!uploadedImage || !userLocation) {
    showToast('Please add an image and location', 'error');
    return;
  }

  const descriptionInput = document.getElementById('description-input');
  const anonymousCheckbox = document.getElementById('anonymous-toggle');
  const issueTypeSelect = document.getElementById('issue-type-select');

  const description = descriptionInput ? descriptionInput.value.trim() : '';
  const isAnonymous = anonymousCheckbox ? anonymousCheckbox.checked : false;
  const selectedIssueTypes = issueTypeSelect ? Array.from(issueTypeSelect.selectedOptions).map(o => o.value) : [];

  showUploadProgress();

  try {
    // Step 1: Upload image
    updateUploadStep(0, 'Uploading image...');
    const formData = new FormData();
    formData.append('file', uploadedImage);
    formData.append('description', description);
    formData.append('locationstr', userLocation.address);
    formData.append('is_anonymous', isAnonymous);

    // Add selected issue types
    selectedIssueTypes.forEach(type => {
      formData.append('issue_types', type);
    });

    const response = await fetch(`${API_BASE}/submit-issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    // Step 2: Identifying issues
    updateUploadStep(1, 'Identifying issues...');
    const result = await response.json();
    console.log('Upload result:', result);

    // Step 3: Finalizing
    updateUploadStep(2, 'Finalizing...');
    
    // Check if issues were detected
    if (result.detected_issues && result.detected_issues.length > 0) {
      detectedIssues = result.detected_issues;
      showResultModal(result);
    } else {
      showToast('Issue uploaded successfully! No specific issues detected by AI.', 'success');
      setTimeout(() => {
        window.location.href = '/feed.html';
      }, 1500);
    }

    hideUploadProgress();
  } catch (error) {
    console.error('Error uploading issue:', error);
    showToast(`Upload failed: ${error.message}`, 'error');
    hideUploadProgress();
  }
}

// Show upload progress modal
function showUploadProgress() {
  const modal = document.getElementById('upload-progress-modal');
  if (modal) modal.style.display = 'flex';
}

// Hide upload progress modal
function hideUploadProgress() {
  const modal = document.getElementById('upload-progress-modal');
  if (modal) modal.style.display = 'none';
}

// Update upload step
function updateUploadStep(stepIndex, text) {
  const steps = document.querySelectorAll('.progress-step');
  steps.forEach((step, index) => {
    if (index <= stepIndex) {
      step.classList.add('active');
    } else {
      step.classList.remove('active');
    }
  });

  const statusText = document.getElementById('upload-status-text');
  if (statusText) statusText.textContent = text;
}

// Show result modal
function showResultModal(result) {
  const modal = document.getElementById('result-modal');
  const detectedIssuesContainer = document.getElementById('detected-issues-container');

  if (detectedIssuesContainer) {
    detectedIssuesContainer.innerHTML = result.detected_issues.map(issue => `
      <div class="detected-issue-item">
        <strong>${issue.type || issue.name || 'Unknown'}</strong>
        <p>Confidence: ${Math.round((issue.confidence || 0) * 100)}%</p>
        ${issue.description ? `<p class="issue-desc">${issue.description}</p>` : ''}
      </div>
    `).join('');
  }

  if (modal) modal.style.display = 'flex';
}

// Close result modal and navigate to feed
function closeResultModal() {
  const modal = document.getElementById('result-modal');
  if (modal) modal.style.display = 'none';
  
  // Reset form
  uploadedImage = null;
  userLocation = null;
  detectedIssues = [];
  
  const fileInput = document.getElementById('file-input');
  const descriptionInput = document.getElementById('description-input');
  const anonymousCheckbox = document.getElementById('anonymous-toggle');
  
  if (fileInput) fileInput.value = '';
  if (descriptionInput) descriptionInput.value = '';
  if (anonymousCheckbox) anonymousCheckbox.checked = false;
  
  removeImage();
  
  // Navigate to feed
  window.location.href = '/feed.html';
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  console.log("Upload page loaded");

  initThemeToggle();
  initMobileMenu();
  initializeAuthListener();

  // Wait for authentication
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      console.log("No user, redirecting to login");
      window.location.href = '/login.html';
      return;
    }

    try {
      currentToken = await getIdToken(user);
      console.log("User authenticated");

      // Add event listeners
      const fileInput = document.getElementById('file-input');
      const uploadArea = document.getElementById('upload-area');
      const getLocationBtn = document.getElementById('get-location-btn');
      const submitBtn = document.getElementById('submit-btn');
      const closeResultBtn = document.getElementById('close-result-modal');
      const viewIssuesBtn = document.getElementById('view-issues-btn');

      if (fileInput) {
        fileInput.addEventListener('change', handleImageSelect);
      }

      if (uploadArea) {
        uploadArea.addEventListener('click', () => fileInput?.click());
        
        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
          e.preventDefault();
          uploadArea.classList.add('dragging');
        });
        
        uploadArea.addEventListener('dragleave', () => {
          uploadArea.classList.remove('dragging');
        });
        
        uploadArea.addEventListener('drop', (e) => {
          e.preventDefault();
          uploadArea.classList.remove('dragging');
          
          const file = e.dataTransfer.files[0];
          if (file && file.type.startsWith('image/')) {
            uploadedImage = file;
            displayImagePreview(file);
            checkFormValidity();
          } else {
            showToast('Please drop an image file', 'error');
          }
        });
      }

      if (getLocationBtn) {
        getLocationBtn.addEventListener('click', getUserLocation);
      }

      if (submitBtn) {
        submitBtn.addEventListener('click', handleSubmit);
      }

      if (closeResultBtn) {
        closeResultBtn.addEventListener('click', closeResultModal);
      }

      if (viewIssuesBtn) {
        viewIssuesBtn.addEventListener('click', () => {
          window.location.href = '/feed.html';
        });
      }

      // Initialize form state
      checkFormValidity();

    } catch (error) {
      console.error("Error during initialization:", error);
      showToast('Failed to initialize. Please refresh the page.', 'error');
    }
  });
});
