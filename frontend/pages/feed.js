import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
// --- 1. Import the new auth listener ---
import { initializeAuthListener } from './auth.js';

// --- 2. REMOVED the old protectPage() call ---
// protectPage();

let currentFilter = 'all';
let allIssues = []; // This will hold the fetched issues

// --- 3. renderIssueCard is UPDATED to use display_address ---
function renderIssueCard(issue) {
    const card = document.createElement('div');
    const statusClass = issue.status || 'open';
    card.className = `issue-card ${statusClass}`;
    card.setAttribute('data-status', statusClass);

    let statusText = '';
    if (statusClass === 'closed') {
        // Check if closed_by exists and is NOT 'community_report'
        if (issue.closed_by && issue.closed_by !== 'community_report') {
            statusText = '✅ Fixed by NGO'; // Specific message for NGO closure
        } else {
            statusText = '✅ Closed'; // Closed by community reports or unknown
        }
    } else if (statusClass === 'verified') {
        statusText = '🟡 Partially Closed'; // Status set by Issue Verifier if partially closed
    } else if (statusClass === 'spam') {
         // Handle spam if needed
        statusText = '🚫 Spam';
    } else { // Default to open
        statusText = '🟠 Open';
    }

    const issueTypes = Array.isArray(issue.issue_types) ? issue.issue_types : [issue.issue_types || 'unknown'];
    const primaryType = issue.detected_issues && issue.detected_issues.length > 0
                          ? issue.detected_issues[0].type
                          : (issueTypes[0] || 'unknown');
    const severityScore = typeof issue.severity_score === 'number' ? issue.severity_score : 5.0;
    const severityColor = severityScore >= 7 ? '#FF6B6B' : severityScore >= 4 ? '#FFD93D' : '#6FCF97';
    const severityLabel = severityScore >= 7 ? 'high' : severityScore >= 4 ? 'medium' : 'low';
    const openUpvotes = (issue.upvotes && typeof issue.upvotes.open === 'number') ? issue.upvotes.open : 0;
    const openReports = (issue.reports && typeof issue.reports.open === 'number') ? issue.reports.open : 0;
    const closedReports = (issue.reports && typeof issue.reports.closed === 'number') ? issue.reports.closed : 0;
    const displayReports = statusClass === 'closed' ? closedReports : openReports;
    const fateRisk = typeof issue.fate_risk_co2 === 'number' ? issue.fate_risk_co2 : 0;
    
    // --- THIS IS THE FIX for location ---
    const locationText = `📍 ${issue.display_address || 'Address Unavailable'}`; 
    // ---
    
    const descriptionText = issue.description || issue.auto_caption || 'No description provided';
    const photoUrl = issue.photo_url || 'placeholder.png';
    const issueId = issue.issue_id || '';

    card.innerHTML = `
      <img src="${photoUrl}" alt="${primaryType}" class="issue-thumbnail" onerror="this.onerror=null; this.src='placeholder.png'; this.style.objectFit='contain';">
      <div class="issue-content">
        <div class="issue-header">
          <span class="issue-type">${issueTypes.join(', ').replace(/_/g, ' ')}</span>
          <span class="severity-badge" style="background: ${severityColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">${severityLabel} (${severityScore.toFixed(1)})</span>
        </div>
        <div class="issue-location">${locationText}</div>
        <div class="issue-description" style="font-size: 0.875rem; color: var(--grey-text); margin: 8px 0; max-height: 4.5em; overflow: hidden;">${descriptionText}</div>
        <div class="issue-stats" style="display: flex; gap: 12px; margin: 8px 0; font-size: 0.8rem;">
          <span>⚠️ ${fateRisk.toFixed(1)} kg CO₂ risk</span>
          <span class="report-count">📊 ${displayReports} reports</span>
          <span class="status-badge">${statusText}</span>
        </div>
        <div class="issue-footer">
          <div class="vote-actions" style="display: flex; align-items: flex-start; gap: 20px;">
            <div style="text-align: center;">
              <button class="vote-button upvote-button" data-id="${issueId}" data-action="upvote" aria-label="Upvote" style="font-size: 1.5rem;">👍</button>
              <span class="upvote-count" style="display: block; font-size: 0.8rem; color: var(--grey-text);">${statusClass === 'closed' ? (issue.upvotes?.closed || 0) : openUpvotes}</span>
              <div style="font-size: 0.7rem; color: var(--grey-text); margin-top: 2px;">${statusClass === 'closed' ? 'Was Fixed' : 'Needs Work!'}</div>
            </div>
            <div style="text-align: center;">
              <button class="vote-button report-button" data-id="${issueId}" data-action="report" aria-label="Report/Downvote" style="font-size: 1.5rem;">👎</button>
               <span class="report-count-hidden" style="display: block; font-size: 0.8rem; color: var(--grey-text); visibility: hidden;">${displayReports}</span>
               <div style="font-size: 0.7rem; color: var(--grey-text); margin-top: 2px;">${statusClass === 'closed' ? 'Not Fixed?' : 'Not an Issue?'}</div>
            </div>
          </div>
          <span class="source-badge" style="font-size: 0.75rem; color: var(--grey-text);">👤 ${issue.source || 'citizen'}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (!e.target.closest('.vote-button')) {
        openIssueModal(issue);
      }
    });

    return card;
}


// --- Renders the list of issues based on current filter ---
async function renderIssues() {
  const grid = document.getElementById('issues-grid');
  if (!grid) {
      console.error("Element with ID 'issues-grid' not found!");
      return;
  }
  grid.innerHTML = '<div class="loading-spinner"></div>';

  let filtered = allIssues;
  if (currentFilter !== 'all') {
    filtered = allIssues.filter(issue => issue.status === currentFilter);
  }

  grid.innerHTML = '';
  if (filtered.length === 0) {
    grid.innerHTML = '<p style="text-align: center; color: var(--grey-text);">No issues found matching the current filter.</p>';
  } else {
    filtered.forEach(issue => {
      grid.appendChild(renderIssueCard(issue));
    });
  }
}

// --- Sets up filter pill buttons ---
function initFilterPills() {
  const pills = document.querySelectorAll('.filter-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.getAttribute('data-filter') || 'all';
      renderIssues();
    });
  });
  const allPill = document.querySelector('.filter-pill[data-filter="all"]');
  if (allPill) allPill.classList.add('active');
}

// --- 4. initVoteButtons UPDATED with Auth Header ---
function initVoteButtons() {
    const grid = document.getElementById('issues-grid');
    if (!grid) return;

    grid.addEventListener('click', async (e) => {
        const button = e.target.closest('.vote-button');
        if (!button) return;

        const action = button.dataset.action;
        const issueId = button.dataset.id;
        if (!issueId || !action) return;

        // --- ADDED: Authentication Check ---
        const idToken = localStorage.getItem('firebaseIdToken');
        if (!idToken) {
            showToast('⚠️ Please log in to vote or report.');
            window.location.href = '/login.html'; // Redirect to login
            return; // Stop the action
        }
        // --- End Auth Check ---

        button.disabled = true;
        button.classList.add('voted');

        const card = button.closest('.issue-card');
        const upvoteCountSpan = card?.querySelector('.upvote-count');
        const reportCountSpan = card?.querySelector('.report-count');

        let currentUpvoteCount = 0;
        let currentReportCount = 0;

        if (upvoteCountSpan) currentUpvoteCount = parseInt(upvoteCountSpan.textContent) || 0;
        if (reportCountSpan) {
             const match = reportCountSpan.textContent.match(/(\d+)/);
             currentReportCount = match ? parseInt(match[1]) : 0;
        }

        if (action === 'upvote' && upvoteCountSpan) {
            upvoteCountSpan.textContent = currentUpvoteCount + 1;
        } else if (action === 'report' && reportCountSpan) {
            reportCountSpan.textContent = `📊 ${currentReportCount + 1} reports`;
        }

        try {
            // --- ADDED: Authorization Header ---
            const response = await fetch(`http://localhost:8000/api/issues/${issueId}/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}` // Send the token
                },
            });
            // --- End Header ---

            if (!response.ok) {
                let errorMsg = `Failed to ${action}`;
                if (response.status === 401 || response.status === 403) {
                     errorMsg = "Authentication failed. Please log in again.";
                     localStorage.removeItem('firebaseIdToken'); // Clear bad token
                     window.location.href = '/login.html';
                } else {
                     try { const errData = await response.json(); errorMsg = errData.detail || errorMsg; } catch (e) { /* ignore */ }
                }
                throw new Error(errorMsg);
            }

            const result = await response.json();
            console.log(`${action} successful:`, result);
            showToast(action === 'upvote' ? '👍 Upvoted!' : '👎 Reported!');

            if (result.updated_issue) {
                const issueIndex = allIssues.findIndex(issue => issue.issue_id === issueId);
                if (issueIndex !== -1) {
                    allIssues[issueIndex] = result.updated_issue; // Update data in the main array
                    console.log(`Updated issue ${issueId} data in allIssues array.`);
                    renderIssues(); // Re-render the grid
                } else {
                     console.warn(`Issue ${issueId} not found in allIssues.`);
                     renderIssues(); // Full re-render just in case
                }
            } else {
                 renderIssues();
            }

        } catch (error) {
            console.error(`Error submitting ${action}:`, error);
            showToast(`⚠️ ${error.message}`);
            // Revert optimistic UI
            if (action === 'upvote' && upvoteCountSpan) upvoteCountSpan.textContent = currentUpvoteCount;
            if (action === 'report' && reportCountSpan) reportCountSpan.textContent = `📊 ${currentReportCount} reports`;
             button.disabled = false;
             button.classList.remove('voted');

        } finally {
             setTimeout(() => {
                 const newButton = document.querySelector(`.vote-button[data-id="${issueId}"][data-action="${action}"]`);
                 if(newButton) newButton.classList.remove('voted');
                 const latestIssueData = allIssues.find(issue => issue.issue_id === issueId);
                 if (latestIssueData && latestIssueData.status !== 'closed' && latestIssueData.status !== 'spam') {
                     if(newButton) newButton.disabled = false;
                 }
             }, 600);
        }
    });
}
// --- Opens the detailed issue modal ---
function openIssueModal(issue) {
    const modal = document.getElementById('issue-modal');
    const modalBody = document.getElementById('modal-body');
    if (!modal || !modalBody) {
        console.error("Modal elements not found!");
        return;
    }

    const statusClass = issue.status || 'open';
    let statusText = '';
    if (statusClass === 'closed') {
        if (issue.closed_by && issue.closed_by !== 'community_report') { //
            statusText = '✅ Fixed by NGO'; //
        } else {
            statusText = '✅ Closed'; //
        }
    } else if (statusClass === 'verified') {
        statusText = '🟡 Verified'; //
    } else if (statusClass === 'spam') {
        statusText = '🚫 Spam';
    } else { // Default to open
        statusText = '🟠 Open';
    }

    const co2Saved = typeof issue.co2_kg_saved === 'number' ? issue.co2_kg_saved : 0;
    const fateRisk = typeof issue.fate_risk_co2 === 'number' ? issue.fate_risk_co2 : 0;
    const co2Text = co2Saved > 0 ? `🌱 ${co2Saved.toFixed(1)} kg CO₂ saved` : `⚠️ ${fateRisk.toFixed(1)} kg CO₂ risk`;

    const issueTypes = Array.isArray(issue.issue_types) ? issue.issue_types : (issue.issue_types ? [issue.issue_types] : ['unknown']);
    const severityScore = typeof issue.severity_score === 'number' ? issue.severity_score : 5.0;
    
    // --- THIS IS THE FIX for location in modal ---
    const locationText = `📍 ${issue.display_address || 'Address Unavailable'}`;
    // ---
    
    const reportedDate = issue.reported_at ? new Date(issue.reported_at).toLocaleDateString() : 'Unknown Date';
    const descriptionText = issue.description || issue.auto_caption || 'No description available';
    const photoUrl = issue.photo_url || 'placeholder.png';
    const issueIdShort = issue.issue_id ? issue.issue_id.substring(0, 8) : 'N/A';
    const sourceText = issue.source || 'citizen';
    const openUpvotes = (issue.upvotes && typeof issue.upvotes.open === 'number') ? issue.upvotes.open : 0;
    
    let relevantReportCount = 0;
    if (issue.reports) {
        if (statusClass === 'open') relevantReportCount = issue.reports.open || 0;
        else if (statusClass === 'closed') relevantReportCount = issue.reports.closed || 0;
        else if (statusClass === 'verified') relevantReportCount = issue.reports.verified || 0;
        else if (statusClass === 'spam') relevantReportCount = issue.reports.spam || 0;
    }
    const predictedFixText = issue.predicted_fix || 'No fix prediction available';
    const fixConfidence = typeof issue.predicted_fix_confidence === 'number' ? issue.predicted_fix_confidence : 0;

    let detectedIssuesHtml = '<p>No specific issues detected by AI.</p>';
    if (Array.isArray(issue.detected_issues) && issue.detected_issues.length > 0) {
      detectedIssuesHtml = issue.detected_issues.map(detected => {
        const type = detected.type || 'unknown';
        const score = typeof detected.severity_score === 'number' ? detected.severity_score.toFixed(1) : 'N/A';
        const conf = typeof detected.confidence === 'number' ? (detected.confidence * 100).toFixed(0) : 'N/A';
        const color = parseFloat(score) >= 7 ? '#FF6B6B' : parseFloat(score) >= 4 ? '#FFD93D' : '#6FCF97';
        const impact = detected.future_impact || 'N/A';

        return `<div class="issue-type-badge" style="background: ${color}20; border-left: 3px solid ${color}; padding: 6px 10px; margin: 6px 0; border-radius: 4px; font-size: 13px;">
                  <strong style="text-transform: capitalize;">${type.replace(/_/g, ' ')}</strong>
                  <span style="color: #666; font-size: 0.9em;">(Score: ${score}, Conf: ${conf}%)</span>
                  <p style="font-size: 0.85em; margin: 4px 0 0 0; color: #555;">${impact}</p>
                </div>`;
      }).join('');
    }

    modalBody.innerHTML = `
      <img src="${photoUrl}" alt="${issueTypes[0]}" class="modal-media" onerror="this.onerror=null; this.src='placeholder.png'; this.style.objectFit='contain';">
      <div class="modal-header">
        <h3 class="modal-title">${issueTypes.join(' + ').replace(/_/g, ' ')} Issue</h3>
        <div class="modal-meta">
          <span>${locationText}</span>
          <span>👤 ${sourceText}</span>
          <span>📅 ${reportedDate}</span>
          <span class="status-badge">${statusText}</span>
        </div>
      </div>
      <div class="issue-details">
        <p class="modal-description">${descriptionText}</p>
        <div style="background: var(--grey-surface); padding: 16px; border-radius: 12px; margin-top: 16px;">
          <h4 style="margin-bottom: 8px;">📊 AI Detected Issues</h4>
          ${detectedIssuesHtml}
        </div>
        <div class="issue-stats-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0;">
          <div class="stat-item">
            <span class="stat-label">Overall Severity:</span>
            <span class="stat-value" style="font-weight: bold; color: ${severityScore >= 7 ? '#FF6B6B' : severityScore >= 4 ? '#FFD93D' : '#6FCF97'};">${severityScore.toFixed(1)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Reports (${statusClass}):</span>
            <span class="stat-value">${relevantReportCount}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">CO₂ Impact:</span>
            <span class="stat-value">${co2Text}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Issue ID:</span>
            <span class="stat-value" style="font-family: monospace; font-size: 0.875rem;">${issueIdShort}...</span>
          </div>
        </div>
        ${predictedFixText !== 'No fix prediction available' ? `
        <div style="background: var(--grey-surface); padding: 16px; border-radius: 12px; margin-top: 16px;">
            <h4 style="margin-bottom: 8px;">🔧 Predicted Fix (Confidence: ${(fixConfidence * 100).toFixed(0)}%)</h4>
            <p style="font-size: 0.875rem; margin: 4px 0;">${predictedFixText}</p>
        </div>` : ''}
      </div>
      <div class="vote-progress" style="margin-top: 16px;">
        <h4>Community Support: ${openUpvotes} upvotes</h4>
        <div class="progress-bar" style="background: var(--grey-surface); border-radius: 99px; height: 10px; overflow: hidden;">
          <div class="progress-fill" style="width: ${Math.min((openUpvotes / 50) * 100, 100)}%; background: var(--primary-color); height: 100%;"></div>
        </div>
      </div>
    `;

    modal.classList.add('open');
}


window.closeModal = function () {
  const modal = document.getElementById('issue-modal');
  if (modal) {
      modal.classList.remove('open');
  }
}

document.addEventListener('click', (e) => {
  const modal = document.getElementById('issue-modal');
  if (modal && modal.classList.contains('open')) {
      const modalContent = modal.querySelector('.modal-content');
      if (e.target === modal) {
          window.closeModal();
      }
  }
});


// --- 5. UPDATED DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', async () => {
  // --- CALL AUTH LISTENER FIRST ---
  initializeAuthListener();
  initThemeToggle();
  initMobileMenu();

  const grid = document.getElementById('issues-grid');
  if (grid) grid.innerHTML = '<div class="loading-spinner"></div>';

  try {
    // --- 6. FETCH FROM CORRECT BACKEND ---
    const response = await fetch('http://localhost:8000/api/issues'); // Points to our Python backend
    if (!response.ok) {
      let errorMsg = `HTTP error! status: ${response.status}`;
      try { const errData = await response.json(); errorMsg = errData.detail || errorMsg; } catch (e) { /* Ignore */ }
      throw new Error(errorMsg);
    }
    const data = await response.json();
    allIssues = data.issues || []; // Backend now handles sorting and adding address

    console.log("Fetched issues:", allIssues.length);

  } catch (error) {
    console.error("Failed to fetch issues:", error);
    showToast(`⚠️ Failed to load issues: ${error.message}`);
    allIssues = [];
     if (grid) grid.innerHTML = `<p style="text-align: center; color: var(--error-color);">Failed to load issues: ${error.message}</p>`;
  }

  // --- 7. REMOVED FRONTEND SORTING ---
  // The backend already sorts by upvotes and severity

  // Render issues (or error message)
  if (grid && !grid.innerHTML.includes('Failed to load')) {
      renderIssues();
  }
  initFilterPills();
  initVoteButtons(); // This is the correct function name
});