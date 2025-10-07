import { initThemeToggle, initMobileMenu, showToast } from './shared.js'

let currentFilter = 'all';
let allIssues = [];

function renderIssueCard(issue) {
  const card = document.createElement('div');
  card.className = `issue-card ${issue.status}`;
  card.setAttribute('data-status', issue.status);

  const statusText = issue.status === 'closed' ? '✅ Closed' : 
                    issue.status === 'verified' ? '🟡 Verified' : '🟠 Open';
  
  const severityColor = issue.severity === 'high' ? '#FF6B6B' : 
                       issue.severity === 'medium' ? '#FFD93D' : '#6FCF97';

  card.innerHTML = `
    <img src="${issue.photo_url}" alt="${issue.issue_type}" class="issue-thumbnail" onerror="this.style.display='none'">
    <div class="issue-content">
      <div class="issue-header">
        <span class="issue-type">${issue.issue_type}</span>
        <span class="severity-badge" style="background: ${severityColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">${issue.severity}</span>
      </div>
      <div class="issue-location">📍 ${issue.location ? `${parseFloat(issue.location.lat).toFixed(4)}, ${parseFloat(issue.location.lon).toFixed(4)}` : 'Unknown'}</div>
      <div class="issue-description" style="font-size: 0.875rem; color: var(--grey-text); margin: 8px 0;">${issue.description || 'No description'}</div>
      <div class="issue-stats" style="display: flex; gap: 12px; margin: 8px 0;">
        <span>⚠️ ${issue.fate_risk_co2} kg CO₂</span>
        <span>📊 ${issue.reports} reports</span>
        <span class="status-badge">${statusText}</span>
      </div>
      <div class="issue-footer">
        <div class="vote-count">
          <button class="upvote-btn" data-id="${issue.issue_id}">❤️</button>
          <span>${issue.upvotes}</span>
        </div>
        <span class="source-badge" style="font-size: 0.75rem; color: var(--grey-text);">� ${issue.source}</span>
      </div>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (!e.target.closest('.upvote-btn')) {
      openIssueModal(issue);
    }
  });

  return card;
}

async function renderIssues() {
  const grid = document.getElementById('issues-grid');
  grid.innerHTML = '';

  let filtered = allIssues;
  if (currentFilter === 'open') {
    filtered = allIssues.filter(issue => issue.status === 'open');
  } else if (currentFilter === 'verified') {
    filtered = allIssues.filter(issue => issue.status === 'verified');
  } else if (currentFilter === 'closed') {
    filtered = allIssues.filter(issue => issue.status === 'closed');
  }

  filtered.forEach(issue => {
    grid.appendChild(renderIssueCard(issue));
  });
}

function initFilterPills() {
  const pills = document.querySelectorAll('.filter-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.getAttribute('data-filter');
      renderIssues();
    });
  });
}

function initUpvoteButtons() {
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('upvote-btn')) {
      const btn = e.target;
      btn.classList.add('voted');

      const voteCount = btn.nextElementSibling;
      const currentUpvotes = parseInt(voteCount.textContent);
      voteCount.textContent = currentUpvotes + 1;

      setTimeout(() => {
        btn.classList.remove('voted');
      }, 600);
    }
  });
}

function openIssueModal(issue) {
  const modal = document.getElementById('issue-modal');
  const modalBody = document.getElementById('modal-body');

  const statusText = issue.status === 'closed' ? '✅ Closed' : 
                    issue.status === 'verified' ? '🟡 Verified' : '🟠 Open';
  
  const co2SavedText = issue.co2_kg_saved > 0 ? `${issue.co2_kg_saved} kg CO₂ saved` : `${issue.fate_risk_co2} kg CO₂ at risk`;

  modalBody.innerHTML = `
    <img src="${issue.photo_url}" alt="${issue.issue_type}" class="modal-media" onerror="this.style.display='none'">
    <div class="modal-header">
      <h3 class="modal-title">${issue.issue_type} Issue</h3>
      <div class="modal-meta">
        <span>📍 ${issue.location ? `${parseFloat(issue.location.lat).toFixed(4)}, ${parseFloat(issue.location.lon).toFixed(4)}` : 'Unknown location'}</span>
        <span>� ${issue.source}</span>
        <span>📅 ${new Date(issue.reported_at).toLocaleDateString()}</span>
        <span class="status-badge">${statusText}</span>
      </div>
    </div>
    <div class="issue-details">
      <p class="modal-description">${issue.description || 'No description available'}</p>
      <div class="issue-stats-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0;">
        <div class="stat-item">
          <span class="stat-label">Severity:</span>
          <span class="stat-value" style="text-transform: capitalize; font-weight: bold; color: ${issue.severity === 'high' ? '#FF6B6B' : issue.severity === 'medium' ? '#FFD93D' : '#6FCF97'};">${issue.severity}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Reports:</span>
          <span class="stat-value">${issue.reports}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">CO₂ Impact:</span>
          <span class="stat-value">${co2SavedText}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Issue ID:</span>
          <span class="stat-value" style="font-family: monospace; font-size: 0.875rem;">${issue.issue_id}</span>
        </div>
      </div>
      ${issue.cross_city_fix ? `
        <div style="background: var(--grey-surface); padding: 16px; border-radius: 12px; margin-top: 16px;">
          <h4 style="margin-bottom: 8px;">🎥 Cross-City Fix Guide</h4>
          <p style="font-size: 0.875rem; color: var(--grey-text);">
            Learn how similar issues were resolved in other cities.
            <a href="${issue.cross_city_fix}" target="_blank" style="color: var(--mint-dark);">Watch fix video</a>
          </p>
        </div>
      ` : ''}
    </div>
    <div class="vote-progress">
      <h4>Community Support: ${issue.upvotes} upvotes</h4>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${Math.min((issue.upvotes / 100) * 100, 100)}%"></div>
      </div>
    </div>
  `;

  modal.classList.add('open');
}

window.closeModal = function() {
  const modal = document.getElementById('issue-modal');
  modal.classList.remove('open');
}

document.addEventListener('click', (e) => {
  const modal = document.getElementById('issue-modal');
  if (e.target === modal) {
    window.closeModal();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle();
  initMobileMenu();
  // Hardcoded map center (same as map.js)
  const centerLat = 12.9716;
  const centerLon = 77.5946;
  // Define a bounding box of ~5km around center
  const latDelta = 0.045; // ~5km
  const lonDelta = 0.045; // ~5km
  const boundsObj = {
    north: centerLat + latDelta,
    south: centerLat - latDelta,
    east: centerLon + lonDelta,
    west: centerLon - lonDelta
  };
  try {
    const queryParams = new URLSearchParams({
      zoom: '12',
      bounds: JSON.stringify(boundsObj)
    });
    const res = await fetch(`http://localhost:3001/api/map-data?${queryParams}`);
    const data = await res.json();
    if (data.type === 'points') {
      allIssues = data.features.map(f => ({
        ...f.properties
      }));
      // Sort by severity (high > medium > low), then by upvotes descending
      const severityRank = { high: 3, medium: 2, low: 1 };
      allIssues.sort((a, b) => {
        const sa = severityRank[(a.severity || '').toLowerCase()] || 0;
        const sb = severityRank[(b.severity || '').toLowerCase()] || 0;
        if (sb !== sa) return sb - sa;
        return (b.upvotes || 0) - (a.upvotes || 0);
      });
    } else {
      allIssues = [];
    }
  } catch (e) {
    showToast('⚠️ Failed to load issues');
    allIssues = [];
  }
  renderIssues();
  initFilterPills();
  initUpvoteButtons();
});
