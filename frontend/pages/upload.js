import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js';
import { auth } from '../firebaseConfig.js';
import { onAuthStateChanged, getIdToken } from "firebase/auth";

const API_BASE = 'http://localhost:8000';

let currentToken = null;
let uploadedImage = null;
let userLocation = null;
let detectedIssues = [];

// Issue types mapping - matches mobile app
const ISSUE_TYPES = {
  'DRAIN_BLOCKAGE': 'Drain Blockage',
  'FALLEN_TREE': 'Fallen Tree',
  'FLOODING_SURFACE': 'Surface Flooding',
  'GRAFFITI_VANDALISM': 'Graffiti Vandalism',
  'GREENSPACE_MAINTENANCE': 'Greenspace Maintenance',
  'ILLEGAL_CONSTRUCTION_DEBRIS': 'Illegal Construction Debris',
  'MANHOLE_MISSING_OR_DAMAGED': 'Manhole Missing/Damaged',
  'POWER_POLE_LINE_DAMAGE': 'Power Pole/Line Damage',
  'PUBLIC_INFRASTRUCTURE_DAMAGED': 'Public Infrastructure Damaged',
  'PUBLIC_TOILET_UNSANITARY': 'Public Toilet Unsanitary',
  'ROAD_POTHOLE': 'Road Pothole',
  'SIDEWALK_DAMAGE': 'Sidewalk Damage',
  'SMALL_FIRE_HAZARD': 'Small Fire Hazard',
  'STRAY_ANIMALS': 'Stray Animals',
  'STREETLIGHT_OUTAGE': 'Streetlight Outage',
  'TRAFFIC_OBSTRUCTION': 'Traffic Obstruction',
  'TRAFFIC_SIGN_DAMAGE': 'Traffic Sign Damage',
  'WASTE_BULKY_DUMP': 'Waste Bulky Dump',
  'WASTE_LITTER_SMALL': 'Waste Litter Small',
  'WATER_LEAK_SURFACE': 'Water Leak Surface'
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
        <button type="button" class="remove-image-btn" id="remove-image-btn">✕</button>
      </div>
    `;
    if (uploadPlaceholder) {
      uploadPlaceholder.style.display = 'none';
    }
    previewContainer.style.display = 'block';

    // Add margin to upload-buttons only after image is uploaded
    const uploadButtons = document.querySelector('.upload-buttons');
    if (uploadButtons) {
      uploadButtons.style.marginTop = '24px';
    }

    setTimeout(() => {
      const removeBtn = document.getElementById('remove-image-btn');
      if (removeBtn) {
        removeBtn.onclick = function(event) {
          console.log('Remove button clicked directly');
          removeImage(event);
        };
      }
    }, 10);
  };
  reader.readAsDataURL(file);
}

// Remove image
function removeImage(e) {
  console.log('Remove image clicked');
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  uploadedImage = null;
  const previewContainer = document.getElementById('image-preview-container');
  const uploadPlaceholder = document.getElementById('upload-placeholder');
  const fileInput = document.getElementById('file-input');

  // Remove image preview and reset state
  if (previewContainer) {
    previewContainer.innerHTML = '';
    previewContainer.style.display = 'none';
    previewContainer.onclick = null; // Remove event listener
  }
  if (uploadPlaceholder) {
    uploadPlaceholder.style.display = 'block';
  }
  if (fileInput) {
    fileInput.value = '';
  }
  // Remove margin from upload-buttons when no image
  const uploadButtons = document.querySelector('.upload-buttons');
  if (uploadButtons) {
    uploadButtons.style.marginTop = '0';
  }

  // Hide webcam preview if present
  const webcamPreview = document.getElementById('webcam-preview');
  if (webcamPreview) {
    webcamPreview.style.display = 'none';
    if (webcamPreview.srcObject) {
      webcamPreview.srcObject.getTracks().forEach(track => track.stop());
      webcamPreview.srcObject = null;
    }
  }

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
    updateUploadStatus('Uploading image to storage...');
    const formData = new FormData();
    formData.append('file', uploadedImage);
    formData.append('description', description);
    formData.append('latitude', userLocation.latitude);
    formData.append('longitude', userLocation.longitude);
    formData.append('is_anonymous', isAnonymous);

    // Add selected issue types as labels
    selectedIssueTypes.forEach(type => {
      formData.append('labels', type);
    });

    updateUploadStatus('AI is analyzing image and identifying issues...');
    
    const response = await fetch(`${API_BASE}/submit-issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Upload failed (${response.status}): ${errorData}`);
    }

    const result = await response.json();
    console.log('Backend response:', result);

    updateUploadStatus('Processing complete!');
    
    // Handle the response based on backend structure
    if (result.no_issues_found) {
      setTimeout(() => {
        hideUploadProgress();
        showToast('Issue uploaded successfully! No specific issues detected by AI.', 'success');
        resetForm();
      }, 500);
    } else if (result.analysis && result.analysis.detected_issues) {
      // Show detected issues in modal
      detectedIssues = result.analysis.detected_issues;
      setTimeout(() => {
        hideUploadProgress();
        showResultModal(result);
      }, 500);
    } else {
      // Fallback for successful upload without detection
      setTimeout(() => {
        hideUploadProgress();
        showToast('Issue uploaded successfully!', 'success');
        resetForm();
      }, 500);
    }

  } catch (error) {
    console.error('Error uploading issue:', error);
    hideUploadProgress();
    showToast(`Upload failed: ${error.message}`, 'error');
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
function updateUploadStatus(text) {
  const statusText = document.getElementById('upload-status-text');
  if (statusText) statusText.textContent = text;
}

// Show result modal
function showResultModal(result) {
  const modal = document.getElementById('result-modal');
  const detectedIssuesContainer = document.getElementById('detected-issues-container');

  if (detectedIssuesContainer && detectedIssues && detectedIssues.length > 0) {
    detectedIssuesContainer.innerHTML = detectedIssues.map((issue, index) => `
      <div class="detected-issue-card">
        <div class="issue-card-header">
          <div class="issue-number">${index + 1}</div>
          <div class="issue-title">${issue.issue_type || issue.type || issue.name || 'Unknown Issue'}</div>
        </div>
        <div class="issue-card-body">
          <div class="issue-metric">
            <span class="metric-label">Confidence</span>
            <div class="confidence-bar">
              <div class="confidence-fill" style="width: ${Math.round((issue.confidence || 0) * 100)}%"></div>
              <span class="confidence-value">${Math.round((issue.confidence || 0) * 100)}%</span>
            </div>
          </div>
          ${issue.severity ? `
          <div class="issue-metric">
            <span class="metric-label">Severity</span>
            <span class="metric-value severity-${issue.severity.toLowerCase()}">${issue.severity}</span>
          </div>
          ` : ''}
          ${issue.priority_level ? `
          <div class="issue-metric">
            <span class="metric-label">Priority</span>
            <span class="metric-value priority-badge">${issue.priority_level}</span>
          </div>
          ` : ''}
          ${issue.description ? `
          <div class="issue-description">
            <span class="metric-label">Description</span>
            <p>${issue.description}</p>
          </div>
          ` : ''}
        </div>
      </div>
    `).join('');
  } else {
    detectedIssuesContainer.innerHTML = '<div class="no-issues"><p>✅ Issues detected and uploaded successfully!</p></div>';
  }

  if (modal) modal.style.display = 'flex';
}

// Close result modal without navigating away
function closeResultModal() {
  const modal = document.getElementById('result-modal');
  if (modal) modal.style.display = 'none';
  resetForm();
}

// Reset form after successful upload
function resetForm() {
  uploadedImage = null;
  userLocation = null;
  detectedIssues = [];
  
  const fileInput = document.getElementById('file-input');
  const descriptionInput = document.getElementById('description-input');
  const anonymousCheckbox = document.getElementById('anonymous-toggle');
  const issueTypeSelect = document.getElementById('issue-type-select');
  const locationText = document.getElementById('location-text');
  
  if (fileInput) fileInput.value = '';
  if (descriptionInput) descriptionInput.value = '';
  if (anonymousCheckbox) anonymousCheckbox.checked = false;
  if (issueTypeSelect) issueTypeSelect.selectedIndex = -1;
  if (locationText) locationText.textContent = 'Location not set';
  
  removeImage();
  checkFormValidity();
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  console.log("Upload page loaded");

  initThemeToggle();
  initMobileMenu();
  initializeAuthListener();

  // Initialize UI elements immediately
  const fileInput = document.getElementById('file-input');
  const uploadArea = document.getElementById('upload-area');
  const cameraBtn = document.querySelector('.camera-btn');
  const galleryBtn = document.querySelector('.gallery-btn');
  const getLocationBtn = document.getElementById('get-location-btn');
  const submitBtn = document.getElementById('submit-btn');
  const closeResultBtn = document.getElementById('close-result-modal');
  const uploadAnotherBtn = document.getElementById('upload-another-btn');
  const viewInFeedBtn = document.getElementById('view-in-feed-btn');
  const viewIssuesBtn = document.getElementById('view-issues-btn');

  if (fileInput) {
    fileInput.addEventListener('change', handleImageSelect);
  }

  // Camera button - use webcam capture
  if (cameraBtn) {
    cameraBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        // Try to access webcam
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        
        // Create video element to show camera preview
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.style.width = '100%';
        video.style.maxWidth = '400px';
        video.style.borderRadius = '8px';
        
        // Create capture button
        const captureBtn = document.createElement('button');
        captureBtn.textContent = '📸 Capture Photo';
        captureBtn.className = 'upload-btn';
        captureBtn.style.marginTop = '10px';
        
        // Create cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '❌ Cancel';
        cancelBtn.className = 'upload-btn';
        cancelBtn.style.marginTop = '10px';
        cancelBtn.style.marginLeft = '10px';
        
        // Replace upload buttons with camera preview
        const uploadButtons = document.querySelector('.upload-buttons');
        const previewContainer = document.getElementById('image-preview-container');
        
        uploadButtons.style.display = 'none';
        previewContainer.innerHTML = '';
        previewContainer.appendChild(video);
        previewContainer.appendChild(document.createElement('br'));
        previewContainer.appendChild(captureBtn);
        previewContainer.appendChild(cancelBtn);
        previewContainer.style.display = 'block';
        
        // Capture photo when capture button is clicked
        captureBtn.addEventListener('click', () => {
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0);
          
          // Convert canvas to blob
          canvas.toBlob((blob) => {
            const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
            uploadedImage = file;
            displayImagePreview(file);
            checkFormValidity();
            
            // Stop camera stream
            stream.getTracks().forEach(track => track.stop());
            
            // Reset UI
            uploadButtons.style.display = 'flex';
          }, 'image/jpeg', 0.8);
        });
        
        // Cancel camera
        cancelBtn.addEventListener('click', () => {
          stream.getTracks().forEach(track => track.stop());
          previewContainer.style.display = 'none';
          uploadButtons.style.display = 'flex';
        });
        
      } catch (error) {
        console.error('Error accessing camera:', error);
        showToast('Camera access denied or not available. Using file picker instead.', 'warning');
        // Fallback to file picker with camera capture
        if (fileInput) {
          fileInput.setAttribute('capture', 'environment');
          fileInput.focus();
          setTimeout(() => fileInput.click(), 10);
        }
      }
    });
  }

  // Gallery button - use file picker
  if (galleryBtn) {
    galleryBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (fileInput) {
        fileInput.removeAttribute('capture');
        fileInput.focus();
        setTimeout(() => fileInput.click(), 10);
      }
    });
  }

  // Drag and drop support only
  if (uploadArea) {
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

  // Close button on result modal
  const closeResultBtnX = document.getElementById('close-result-modal-x');
  if (closeResultBtnX) {
    closeResultBtnX.addEventListener('click', closeResultModal);
  }

  // Close modals when clicking background
  const resultModal = document.getElementById('result-modal');
  if (resultModal) {
    resultModal.addEventListener('click', (e) => {
      if (e.target === resultModal) {
        closeResultModal();
      }
    });
  }

  if (uploadAnotherBtn) {
    uploadAnotherBtn.addEventListener('click', () => {
      closeResultModal();
    });
  }

  if (viewInFeedBtn) {
    viewInFeedBtn.addEventListener('click', () => {
      window.location.href = '/feed.html';
    });
  }

  if (viewIssuesBtn) {
    viewIssuesBtn.addEventListener('click', () => {
      window.location.href = '/feed.html';
    });
  }

  // Initialize form state
  checkFormValidity();

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
    } catch (error) {
      console.error("Error during initialization:", error);
      showToast('Failed to initialize. Please refresh the page.', 'error');
    }
  });
});
