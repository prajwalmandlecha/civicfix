import { initThemeToggle, initMobileMenu, showToast } from './shared.js'

let uploadedFiles = [];

function initUploadArea() {
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');
  const previewContainer = document.getElementById('preview-container');
  const submitBtn = document.getElementById('submit-btn');
  const typeChips = document.querySelector('.type-chips');

  uploadArea.addEventListener('click', () => {
    fileInput.click();
  });

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
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
  });

  function handleFiles(files) {
    uploadedFiles = Array.from(files);
    previewContainer.innerHTML = '';

    uploadedFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = document.createElement('div');
        preview.className = 'preview-item';

        if (file.type.startsWith('image/')) {
          preview.innerHTML = `
            <img src="${e.target.result}" alt="Preview">
            <button class="preview-remove" data-index="${index}">&times;</button>
          `;
        } else if (file.type.startsWith('video/')) {
          preview.innerHTML = `
            <video src="${e.target.result}"></video>
            <button class="preview-remove" data-index="${index}">&times;</button>
          `;
        }

        previewContainer.appendChild(preview);
      };
      reader.readAsDataURL(file);
    });

    submitBtn.disabled = false;

    const issueTypes = ['🕳️ Pothole', '💡 Streetlight', '🗑️ Garbage', '🎨 Graffiti'];
    const detectedType = issueTypes[Math.floor(Math.random() * issueTypes.length)];
    typeChips.innerHTML = `<span class="type-chip">${detectedType}</span>`;
  }

  previewContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('preview-remove')) {
      const index = parseInt(e.target.getAttribute('data-index'));
      uploadedFiles.splice(index, 1);
      e.target.closest('.preview-item').remove();

      if (uploadedFiles.length === 0) {
        submitBtn.disabled = true;
      }
    }
  });

  submitBtn.addEventListener('click', () => {
    const isAnonymous = document.getElementById('anonymous-toggle').checked;
    const description = document.getElementById('description-input').value;
    const location = document.getElementById('location-input').value;

    if (!location) {
      showToast('⚠️ Please enter a location');
      return;
    }

    const message = isAnonymous
      ? '✅ Issue submitted anonymously!'
      : '✅ Issue submitted! +10 karma earned';

    showToast(message);

    setTimeout(() => {
      window.location.href = '/feed.html';
    }, 1500);

    uploadedFiles = [];
    previewContainer.innerHTML = '';
    fileInput.value = '';
    document.getElementById('description-input').value = '';
    document.getElementById('location-input').value = '';
    submitBtn.disabled = true;
    typeChips.innerHTML = '<span class="type-chip">🕳️ Pothole</span>';
  });
}

function initVoiceRecording() {
  const voiceBtn = document.getElementById('voice-btn');
  let isRecording = false;

  voiceBtn.addEventListener('click', () => {
    isRecording = !isRecording;

    if (isRecording) {
      voiceBtn.classList.add('recording');
      voiceBtn.textContent = '⏺️ Recording... (Click to stop)';
      showToast('🎤 Recording started');
    } else {
      voiceBtn.classList.remove('recording');
      voiceBtn.textContent = '🎤 Record Voice Note';
      showToast('✅ Recording saved');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initMobileMenu();
  initUploadArea();
  initVoiceRecording();
});
