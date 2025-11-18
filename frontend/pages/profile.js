import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js';
import { auth, db } from '../firebaseConfig.js';
import { onAuthStateChanged, getIdToken } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const API_BASE = 'http://localhost:8000';

let currentToken = null;
let currentUser = null;
let userLocation = null;

// Fetch user stats from backend
async function fetchUserStats(userId) {
  try {
    const response = await fetch(`${API_BASE}/api/users/${userId}/stats-firebase`, {
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.stats;
  } catch (error) {
    console.error('Error fetching user stats:', error);
    return null;
  }
}

// Fetch user's uploaded issues
async function fetchUserIssues() {
  if (!userLocation) {
    console.log('No location available for fetching issues');
    return [];
  }

  // Validate location data
  if (typeof userLocation.latitude !== 'number' || typeof userLocation.longitude !== 'number') {
    console.log('Invalid location data for fetching issues');
    return [];
  }

  try {
    const params = new URLSearchParams({
      latitude: userLocation.latitude.toString(),
      longitude: userLocation.longitude.toString(),
      radius_km: 50,
      limit: 20,
      my_issues: true
    });

    const response = await fetch(`${API_BASE}/api/issues/with-user-status?${params}`, {
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.issues || [];
  } catch (error) {
    console.error('Error fetching user issues:', error);
    return [];
  }
}

// Load and display user profile
async function loadUserProfile() {
  if (!currentUser) return;

  showLoading(true);

  try {
    // 1. Fetch user data from Firestore
    const userDocRef = doc(db, "users", currentUser.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      console.error("No user document found in Firestore");
      showToast('User profile not found', 'error');
      showLoading(false);
      return;
    }

    const userData = userDoc.data();
    console.log("User data fetched:", userData);

    // 2. Fetch stats from backend
    const stats = await fetchUserStats(currentUser.uid);
    console.log("User stats:", stats);

    // 3. Update profile card
    updateProfileCard(userData, stats);

    // 4. Update stats cards
    updateStatsCards(userData, stats);

    // 5. Update location display
    updateLocationDisplay(userData);

    // 6. Fetch and display user's issues
    if (userLocation) {
      const issues = await fetchUserIssues();
      displayUserIssues(issues);
    }

    showLoading(false);
  } catch (error) {
    console.error("Error loading profile:", error);
    showToast('Failed to load profile', 'error');
    showLoading(false);
  }
}

// Update profile card
function updateProfileCard(userData, stats) {
  const avatarEl = document.getElementById('profile-avatar');
  const usernameEl = document.getElementById('profile-username');
  const emailEl = document.getElementById('profile-email');
  const userTypeEl = document.getElementById('profile-usertype');
  const karmaEl = document.getElementById('profile-karma');
  const rankEl = document.getElementById('profile-rank');

  const displayName = currentUser.displayName || userData.name || `User ${currentUser.uid.substring(0, 6)}`;
  const userType = userData.userType === 'ngo' ? 'NGO' : userData.userType === 'volunteer' ? 'Volunteer' : 'Citizen';

  if (avatarEl) {
    avatarEl.textContent = displayName.charAt(0).toUpperCase();
  }

  if (usernameEl) {
    usernameEl.textContent = displayName;
  }

  if (emailEl) {
    emailEl.textContent = currentUser.email;
  }

  if (userTypeEl) {
    userTypeEl.textContent = userType;
  }

  if (karmaEl) {
    const karma = stats?.karma || userData.karma || 0;
    karmaEl.textContent = karma.toLocaleString();
  }

  if (rankEl) {
    const rank = stats?.currentRank || 0;
    rankEl.textContent = rank > 0 ? `#${rank}` : 'N/A';
  }
}

// Update stats cards
function updateStatsCards(userData, stats) {
  const issuesUploadedEl = document.getElementById('stat-issues-uploaded');
  const issuesResolvedEl = document.getElementById('stat-issues-resolved');
  const co2SavedEl = document.getElementById('stat-co2-saved');
  const issuesFixedEl = document.getElementById('stat-issues-fixed');

  if (issuesUploadedEl) {
    const uploaded = stats?.issuesReported || 0;
    issuesUploadedEl.textContent = uploaded.toLocaleString();
  }

  if (issuesResolvedEl) {
    const resolved = stats?.issuesResolved || 0;
    issuesResolvedEl.textContent = resolved.toLocaleString();
  }

  if (co2SavedEl) {
    const co2 = stats?.co2Saved || 0;
    co2SavedEl.textContent = `${co2.toFixed(2)} kg`;
  }

  if (issuesFixedEl && userData.userType === 'ngo') {
    const fixed = stats?.issuesFixed || 0;
    issuesFixedEl.textContent = fixed.toLocaleString();
  }
}

// Update location display
function updateLocationDisplay(userData) {
  const locationTextEl = document.getElementById('location-text');
  const updateLocationBtn = document.getElementById('update-location-btn');

  if (locationTextEl && userLocation) {
    locationTextEl.textContent = userLocation.address || `${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`;
  } else if (locationTextEl) {
    locationTextEl.textContent = 'Location not set';
  }

  if (updateLocationBtn) {
    updateLocationBtn.addEventListener('click', handleUpdateLocation);
  }
}

// Handle location update
async function handleUpdateLocation() {
  const updateLocationBtn = document.getElementById('update-location-btn');
  if (updateLocationBtn) {
    updateLocationBtn.disabled = true;
    updateLocationBtn.textContent = 'Getting Location...';
  }

  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser', 'error');
    if (updateLocationBtn) {
      updateLocationBtn.disabled = false;
      updateLocationBtn.textContent = '📍 Update Location';
    }
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

      // Update location in Firestore
      try {
        const userDocRef = doc(db, "users", currentUser.uid);
        await updateDoc(userDocRef, {
          lastLocation: userLocation
        });
      } catch (error) {
        console.error('Error updating location in Firestore:', error);
      }

      updateLocationDisplay();
      showToast('Location updated successfully', 'success');

      // Reload user issues with new location
      const issues = await fetchUserIssues();
      displayUserIssues(issues);

      if (updateLocationBtn) {
        updateLocationBtn.disabled = false;
        updateLocationBtn.textContent = '📍 Update Location';
      }
    },
    (error) => {
      console.error('Error getting location:', error);
      showToast('Unable to get location. Please enable location services.', 'error');
      if (updateLocationBtn) {
        updateLocationBtn.disabled = false;
        updateLocationBtn.textContent = '📍 Update Location';
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// Display user's issues
function displayUserIssues(issues) {
  const issuesContainer = document.getElementById('user-issues-container');
  if (!issuesContainer) return;

  if (issues.length === 0) {
    issuesContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>No Issues Yet</h3>
        <p>You haven't uploaded any issues yet. Start contributing to your community!</p>
        <a href="/upload.html" class="btn btn-primary">Upload Issue</a>
      </div>
    `;
    return;
  }

  const openIssues = issues.filter(i => i.status?.toLowerCase() === 'open');
  const closedIssues = issues.filter(i => i.status?.toLowerCase() === 'closed');

  issuesContainer.innerHTML = `
    <div class="issues-tabs">
      <button class="tab-btn active" data-tab="open">Open (${openIssues.length})</button>
      <button class="tab-btn" data-tab="closed">Closed (${closedIssues.length})</button>
    </div>
    <div class="issues-content">
      <div class="tab-content active" id="open-issues">
        ${openIssues.map(issue => createIssueCard(issue)).join('')}
      </div>
      <div class="tab-content" id="closed-issues">
        ${closedIssues.map(issue => createIssueCard(issue)).join('')}
      </div>
    </div>
  `;

  // Add tab switching logic
  const tabButtons = issuesContainer.querySelectorAll('.tab-btn');
  const tabContents = issuesContainer.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(`${tab}-issues`).classList.add('active');
    });
  });
}

// Create issue card
function createIssueCard(issue) {
  const date = new Date(issue.created_at);
  const dateStr = date.toLocaleDateString();
  const statusClass = issue.status?.toLowerCase() === 'closed' ? 'status-closed' : 'status-open';
  const statusText = issue.status?.toLowerCase() === 'closed' ? 'Closed' : 'Open';

  const issueTypes = issue.issue_types || issue.detected_issues || [];
  const issueTypesStr = issueTypes.map(t => 
    typeof t === 'string' ? t : t.type || t.name || 'Unknown'
  ).join(', ');

  return `
    <div class="user-issue-card">
      ${issue.image_url ? `<img src="${issue.image_url}" class="issue-card-image" alt="Issue">` : ''}
      <div class="issue-card-content">
        <h4>${issue.title || 'Civic Issue'}</h4>
        <p class="issue-description">${issue.description || 'No description'}</p>
        <div class="issue-meta">
          <span class="issue-status ${statusClass}">${statusText}</span>
          <span>📅 ${dateStr}</span>
          <span>👍 ${issue.upvotes || 0}</span>
          <span>🚩 ${issue.reports || 0}</span>
        </div>
        ${issueTypesStr ? `<p class="issue-types">🏷️ ${issueTypesStr}</p>` : ''}
      </div>
    </div>
  `;
}

// Refresh profile
async function refreshProfile() {
  showToast('Refreshing profile...', 'success');
  await loadUserProfile();
}

// Show loading state
function showLoading(show) {
  const loadingEl = document.getElementById('loading-state');
  const contentEl = document.getElementById('profile-content');

  if (loadingEl) {
    loadingEl.style.display = show ? 'flex' : 'none';
  }
  if (contentEl) {
    contentEl.style.display = show ? 'none' : 'block';
  }
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  console.log("Profile page loaded");

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
      currentUser = user;
      currentToken = await getIdToken(user);
      console.log("User authenticated, loading profile");

      // Try to get stored location
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.lastLocation) {
          userLocation = userData.lastLocation;
        }
      }

      // Load profile
      await loadUserProfile();

      // Add refresh button listener
      const refreshBtn = document.getElementById('refresh-profile-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshProfile);
      }

    } catch (error) {
      console.error("Error during initialization:", error);
      showToast('Failed to initialize. Please refresh the page.', 'error');
    }
  });
});
