// frontend/pages/feed.js
import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js';
import { auth } from '../firebaseConfig.js'; // Import auth instance
import { getIdToken } from "firebase/auth"; // Import getIdToken function


let currentFilter = 'all';
let allIssues = []; // This will hold the fetched issues
let userLocation = null; // Variable to store user's location

// --- 1. UPDATED renderIssueCard ---
function renderIssueCard(issue) {
    const card = document.createElement('div');
    const statusClass = issue.status || 'open';
    card.className = `issue-card ${statusClass}`;
    card.setAttribute('data-status', statusClass);

    // --- Updated Status Text Logic ---
    let statusText = '';
    if (statusClass === 'closed') {
        if (issue.closed_by && issue.closed_by !== 'community_report') {
            statusText = '✅ Fixed by NGO'; // Specific message for NGO closure
        } else {
            statusText = '✅ Closed'; // Closed by community reports or unknown
        }
    } else if (statusClass === 'verified') {
        statusText = '🟡 Verified'; // Status set by Issue Verifier if partially closed
    } else if (statusClass === 'spam') {
        statusText = '🚫 Spam';
    } else { // Default to open
        statusText = '🟠 Open';
    }
    // --- End Status Text Logic ---

    // --- Existing variable definitions (ensure these are correct based on your ES schema) ---
    const issueTypes = Array.isArray(issue.issue_types) ? issue.issue_types : [issue.issue_types || 'unknown'];
    const primaryType = issue.detected_issues && issue.detected_issues.length > 0
                          ? issue.detected_issues[0].type
                          : (issueTypes[0] || 'unknown');
    const severityScore = typeof issue.severity_score === 'number' ? issue.severity_score : 5.0;
    const severityColor = severityScore >= 7 ? '#FF6B6B' : severityScore >= 4 ? '#FFD93D' : '#6FCF97';
    const severityLabel = severityScore >= 7 ? 'high' : severityScore >= 4 ? 'medium' : 'low';
    const openUpvotes = (issue.upvotes && typeof issue.upvotes.open === 'number') ? issue.upvotes.open : 0;
    const closedUpvotes = (issue.upvotes && typeof issue.upvotes.closed === 'number') ? issue.upvotes.closed : 0; // Added for closed display
    const openReports = (issue.reports && typeof issue.reports.open === 'number') ? issue.reports.open : 0;
    const closedReports = (issue.reports && typeof issue.reports.closed === 'number') ? issue.reports.closed : 0;
    const displayReports = statusClass === 'closed' ? closedReports : openReports;
    const displayUpvotes = statusClass === 'closed' ? closedUpvotes : openUpvotes; // Show closed or open upvotes
    const fateRisk = typeof issue.fate_risk_co2 === 'number' ? issue.fate_risk_co2 : 0;
    const descriptionText = issue.description || issue.auto_caption || 'No description provided';
    const photoUrl = issue.photo_url || 'placeholder.png';
    const issueId = issue.issue_id || '';
    // --- End Existing variable definitions ---

    // --- UPDATED: Location text with optional distance ---
    const locationText = `📍 ${issue.display_address || 'Address Unavailable'}`;
    const distanceText = typeof issue.distance_km === 'number'
        ? `<span class="issue-distance" style="margin-left: 8px; font-size: 0.8em; color: var(--grey-text);">(${issue.distance_km} km away)</span>`
        : ''; // Show distance if available
    // --- END UPDATE ---

    card.innerHTML = `
      <img src="${photoUrl}" alt="${primaryType}" class="issue-thumbnail" onerror="this.onerror=null; this.src='placeholder.png'; this.style.objectFit='contain';">
      <div class="issue-content">
        <div class="issue-header">
          <span class="issue-type">${issueTypes.join(', ').replace(/_/g, ' ')}</span>
          <span class="severity-badge" style="background: ${severityColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">${severityLabel} (${severityScore.toFixed(1)})</span>
        </div>
        <div class="issue-location">${locationText}${distanceText}</div>
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
              <span class="upvote-count" style="display: block; font-size: 0.8rem; color: var(--grey-text);">${displayUpvotes}</span>
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
  // Ensure 'All Issues' is active initially if present
  const allPill = document.querySelector('.filter-pill[data-filter="all"]');
  if (allPill) allPill.classList.add('active');
}
// --- Initializes vote/report button listeners ---
function initVoteButtons() {
    const grid = document.getElementById('issues-grid');
    if (!grid) {
        console.error("Could not find issues-grid to attach vote listeners.");
        return;
    }

    grid.addEventListener('click', async (e) => {
        const button = e.target.closest('.vote-button');
        if (!button) return; // Ignore clicks that aren't on vote buttons

        // --- Prevent double-clicks ---
        if (button.disabled) {
            return;
        }

        const action = button.dataset.action; // 'upvote' or 'report'
        const issueId = button.dataset.id;
        if (!issueId || !action) {
            console.warn("Vote button missing data-id or data-action");
            return;
        }

        // --- UPDATED: Authentication Check with Token Refresh ---
        const user = auth.currentUser; // Get the currently signed-in user
        if (!user) {
            showToast('⚠️ Please log in to vote or report.');
            localStorage.setItem('redirectAfterLogin', window.location.pathname); // Save current page
            window.location.href = '/login.html'; // Redirect to login
            return; // Stop the action
        }

        let idToken;
        try {
            // Force refresh the token if it's expired or close to expiring
            idToken = await getIdToken(user, /* forceRefresh */ true);
            // Optionally update localStorage if needed elsewhere, but refresh is key
            localStorage.setItem('firebaseIdToken', idToken);
            console.log("Token refreshed successfully for voting/reporting.");
        } catch (error) {
            console.error("Error refreshing ID token:", error);
            showToast('⚠️ Your session may have expired. Please log in again.');
            // Clear potentially bad token and user info
            localStorage.removeItem('firebaseIdToken');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('userType');
            window.location.href = '/login.html'; // Redirect to login
            return; // Stop the action
        }
        // --- End Auth Check Update ---

        // --- Visual Feedback & Disable Button ---
        button.disabled = true;
        button.classList.add('voted');

        // Optimistic UI updates (will be reverted on error)
        const card = button.closest('.issue-card');
        const upvoteCountSpan = card?.querySelector('.upvote-count');
        const reportCountSpan = card?.querySelector('.report-count'); // The visible one with text
        let currentUpvoteCount = 0;
        let currentReportCount = 0;

        if (upvoteCountSpan) {
            currentUpvoteCount = parseInt(upvoteCountSpan.textContent) || 0;
        }
        if (reportCountSpan) {
             const match = reportCountSpan.textContent.match(/(\d+)/); // Extract number from "📊 X reports"
             currentReportCount = match ? parseInt(match[1]) : 0;
        }

        // Apply optimistic update
        if (action === 'upvote' && upvoteCountSpan) {
            upvoteCountSpan.textContent = currentUpvoteCount + 1;
        } else if (action === 'report' && reportCountSpan) {
            reportCountSpan.textContent = `📊 ${currentReportCount + 1} reports`;
        }
        // --- End Optimistic UI ---

        try {
            // --- Send request with Refreshed Authorization Header ---
            const response = await fetch(`http://localhost:8000/api/issues/${issueId}/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}` // Send the potentially refreshed token
                },
                // No body needed for simple upvote/report POSTs
            });
            // --- End Header ---

            if (!response.ok) {
                let errorMsg = `Failed to ${action}`;
                // Handle specific auth errors first
                if (response.status === 401 || response.status === 403) {
                     errorMsg = "Authentication failed. Please log in again.";
                     // Clear local storage and redirect
                     localStorage.removeItem('firebaseIdToken');
                     localStorage.removeItem('userEmail');
                     localStorage.removeItem('userType');
                     window.location.href = '/login.html';
                } else {
                     // Try to get detailed error from backend JSON response
                     try {
                         const errData = await response.json();
                         errorMsg = errData.detail || errorMsg; // Use backend detail if available
                     } catch (e) {
                         /* ignore json parse error if response wasn't JSON */
                         errorMsg = `${errorMsg} (Status: ${response.status})`; // Add status code if no detail
                     }
                }
                throw new Error(errorMsg); // Throw error to be caught below
            }

            // --- Success ---
            const result = await response.json();
            console.log(`${action} successful:`, result);
            showToast(action === 'upvote' ? '👍 Upvoted!' : '👎 Reported!');

            // Update the local data store `allIssues` and re-render if backend returns updated issue
            if (result.updated_issue) {
                const issueIndex = allIssues.findIndex(issue => issue.issue_id === issueId);
                if (issueIndex !== -1) {
                    allIssues[issueIndex] = result.updated_issue; // Update the data in our global array
                    console.log(`Updated issue ${issueId} data in allIssues array.`);
                    renderIssues(); // Re-render the entire grid based on updated data and current filter
                } else {
                     console.warn(`Issue ${issueId} not found in allIssues array after update response.`);
                     // Fallback: Re-fetch everything if local update fails unexpectedly
                     await fetchAndRenderIssues();
                }
            } else {
                 // If backend didn't return updated data, maybe just re-render optimistically
                 // Or trigger a full refresh if state logic is complex
                 console.warn(`Backend did not return updated_issue for ${action} on ${issueId}. Re-rendering.`);
                 renderIssues(); // Re-render with potentially stale local data (relying on optimistic UI)
            }

        } catch (error) {
            console.error(`Error submitting ${action}:`, error);
            showToast(`⚠️ ${error.message}`); // Show the specific error message

            // Revert optimistic UI changes on error
            if (action === 'upvote' && upvoteCountSpan) {
                 upvoteCountSpan.textContent = currentUpvoteCount;
            }
            if (action === 'report' && reportCountSpan) {
                 reportCountSpan.textContent = `📊 ${currentReportCount} reports`;
            }
            // Re-enable button ONLY if we didn't redirect due to auth error
             if (!error.message.includes("Authentication failed")) {
                 button.disabled = false;
                 button.classList.remove('voted');
             }

        } finally {
             // Clean up visual state after a short delay, unless already handled by error/redirect
             setTimeout(() => {
                 // Find the button again in case the DOM re-rendered
                 const currentButton = document.querySelector(`.vote-button[data-id="${issueId}"][data-action="${action}"]`);
                 if(currentButton) {
                    currentButton.classList.remove('voted');
                    // Ensure button is enabled unless the issue state changed (e.g., closed) or auth failed
                    const latestIssueData = allIssues.find(issue => issue.issue_id === issueId);
                    const isLoggedIn = !!localStorage.getItem('firebaseIdToken'); // Check login status again
                    if (isLoggedIn && latestIssueData && latestIssueData.status !== 'closed' && latestIssueData.status !== 'spam') {
                         currentButton.disabled = false;
                    } else if (!isLoggedIn) {
                         // Keep disabled if user somehow got logged out during the process
                         currentButton.disabled = true;
                    }
                    // If issue closed/spam, it remains disabled from initial click
                 }
             }, 600); // 600ms delay
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
    // --- Use same updated status text logic ---
    let statusText = '';
    if (statusClass === 'closed') {
        if (issue.closed_by && issue.closed_by !== 'community_report') {
            statusText = '✅ Fixed by NGO';
        } else {
            statusText = '✅ Closed';
        }
    } else if (statusClass === 'verified') {
        statusText = '🟡 Verified';
    } else if (statusClass === 'spam') {
        statusText = '🚫 Spam';
    } else {
        statusText = '🟠 Open';
    }
    // --- End ---

    const co2Saved = typeof issue.co2_kg_saved === 'number' ? issue.co2_kg_saved : 0;
    const fateRisk = typeof issue.fate_risk_co2 === 'number' ? issue.fate_risk_co2 : 0;
    const co2Text = co2Saved > 0 ? `🌱 ${co2Saved.toFixed(1)} kg CO₂ saved` : `⚠️ ${fateRisk.toFixed(1)} kg CO₂ risk`;

    const issueTypes = Array.isArray(issue.issue_types) ? issue.issue_types : (issue.issue_types ? [issue.issue_types] : ['unknown']);
    const severityScore = typeof issue.severity_score === 'number' ? issue.severity_score : 5.0;

    // --- Location text with optional distance for modal ---
    const locationText = `📍 ${issue.display_address || 'Address Unavailable'}`;
     const distanceText = typeof issue.distance_km === 'number'
        ? `<span style="font-size: 0.9em; color: var(--grey-text);"> (${issue.distance_km} km away)</span>`
        : '';
    // --- End ---

    const reportedDate = issue.reported_at ? new Date(issue.reported_at).toLocaleDateString() : 'Unknown Date';
    const descriptionText = issue.description || issue.auto_caption || 'No description available';
    const photoUrl = issue.photo_url || 'placeholder.png';
    const issueIdShort = issue.issue_id ? issue.issue_id.substring(0, 8) : 'N/A';
    const sourceText = issue.source || 'citizen';
    const openUpvotes = (issue.upvotes && typeof issue.upvotes.open === 'number') ? issue.upvotes.open : 0;
    const closedUpvotes = (issue.upvotes && typeof issue.upvotes.closed === 'number') ? issue.upvotes.closed : 0;
    const displayUpvotes = statusClass === 'closed' ? closedUpvotes : openUpvotes;

    let relevantReportCount = 0;
    if (issue.reports) {
        if (statusClass === 'open') relevantReportCount = issue.reports.open || 0;
        else if (statusClass === 'closed') relevantReportCount = issue.reports.closed || 0;
        else if (statusClass === 'verified') relevantReportCount = issue.reports.verified || 0; // Added verified reports if schema supports
        else if (statusClass === 'spam') relevantReportCount = issue.reports.spam || 0; // Added spam reports if schema supports
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
          <span>${locationText}${distanceText}</span>
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
        <h4>Community Support: ${displayUpvotes} upvotes</h4>
        <div class="progress-bar" style="background: var(--grey-surface); border-radius: 99px; height: 10px; overflow: hidden;">
          <div class="progress-fill" style="width: ${Math.min((openUpvotes / 50) * 100, 100)}%; background: var(--primary-color); height: 100%;"></div>
        </div>
      </div>
    `;

    modal.classList.add('open');
}


// --- Closes the modal ---
window.closeModal = function () {
  const modal = document.getElementById('issue-modal');
  if (modal) {
      modal.classList.remove('open');
  }
}

// --- Closes modal on outside click ---
document.addEventListener('click', (e) => {
  const modal = document.getElementById('issue-modal');
  if (modal && modal.classList.contains('open')) {
      const modalContent = modal.querySelector('.modal-content');
      // Check if the click is directly on the modal backdrop
      if (e.target === modal) {
          window.closeModal();
      }
  }
});


// --- NEW: Function to get user location ---
function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            console.warn("Geolocation is not supported by this browser.");
            showToast("⚠️ Geolocation not supported. Showing all issues.");
            reject(new Error("Geolocation not supported"));
        } else {
            console.log("Requesting user location...");
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userLocation = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    };
                    console.log("Location retrieved:", userLocation);
                    showToast(`📍 Location found! Showing nearby issues.`);
                    resolve(userLocation);
                },
                (error) => {
                    console.error("Error getting location:", error);
                    let message = "⚠️ Could not get location. Showing all issues.";
                    if (error.code === error.PERMISSION_DENIED) {
                        message = "⚠️ Location permission denied. Showing all issues.";
                    } else if (error.code === error.POSITION_UNAVAILABLE) {
                         message = "⚠️ Location info unavailable. Showing all issues.";
                    } else if (error.code === error.TIMEOUT) {
                         message = "⚠️ Location request timed out. Showing all issues.";
                    }
                    showToast(message);
                    userLocation = null; // Ensure location is null on error
                    reject(error); // Reject the promise
                },
                {
                     enableHighAccuracy: false,
                     timeout: 10000, // 10 seconds
                     maximumAge: 60000 // 1 minute cache
                }
            );
        }
    });
}

// --- NEW: Combined function to fetch and render ---
async function fetchAndRenderIssues() {
    const grid = document.getElementById('issues-grid');
    if (grid) grid.innerHTML = '<div class="loading-spinner"></div>'; // Show loading spinner

    // Build API URL with optional location params
    let apiUrl = 'http://localhost:8000/api/issues';
    if (userLocation) {
        apiUrl += `?latitude=${userLocation.latitude}&longitude=${userLocation.longitude}&radius_km=10`; // Example radius: 10km
    }
    console.log(`Fetching issues from: ${apiUrl}`);

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            let errorMsg = `HTTP error! status: ${response.status}`;
            try { const errData = await response.json(); errorMsg = errData.detail || errorMsg; } catch (e) { /* Ignore json parse error */ }
            throw new Error(errorMsg);
        }
        const data = await response.json();
        allIssues = data.issues || []; // Store fetched issues globally

        console.log("Fetched issues:", allIssues.length);
        renderIssues(); // Render based on the fetched data and current filter

    } catch (error) {
        console.error("Failed to fetch issues:", error);
        showToast(`⚠️ Failed to load issues: ${error.message}`);
        allIssues = []; // Clear issues on error
        if (grid) grid.innerHTML = `<p style="text-align: center; color: var(--error-color);">Failed to load issues: ${error.message}</p>`;
        renderIssues(); // Render the error message or empty state
    }
}


// --- UPDATED DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize standard UI and auth listener FIRST
    initializeAuthListener();
    initThemeToggle();
    initMobileMenu();
    initFilterPills(); // Set up filter buttons
    initVoteButtons(); // Attach vote listeners to the grid (event delegation)

    // Attempt to get user location, then fetch and render issues
    try {
        await getUserLocation(); // Wait for location attempt
    } catch (locationError) {
        // If location fails, userLocation remains null, proceed without it
        console.warn("Proceeding without location data.");
    } finally {
        // Fetch and render issues regardless of location success/failure
        await fetchAndRenderIssues();
    }
});