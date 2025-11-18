import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js'; 
import { auth } from '../firebaseConfig.js'; 
import { onAuthStateChanged, getIdToken } from "firebase/auth"; 
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const API_BASE = 'http://localhost:8000';

let map = null;
let userMarker = null;
let issueMarkers = [];
let currentToken = null;
let userLocation = null;
let currentUser = null;
let userProfile = null;
let filters = {
  status: 'open',
  severity: 'all',
  days: 30,
  issueTypes: [],
  radiusKm: 10,
  limit: 50
};

// Load user profile from backend
async function loadUserProfile() {
  try {
    const response = await fetch(`${API_BASE}/api/users/${currentUser.uid}/stats-firebase`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      userProfile = data.stats;
      console.log('User profile loaded:', userProfile);
    }
  } catch (error) {
    console.error('Error loading user profile:', error);
  }
}

// Get marker color based on issue status and severity
function getMarkerColor(issue) {
  if (issue.status?.toLowerCase() === 'closed') {
    return '#4CAF79'; // Green for fixed issues
  }
  const severityScore = issue.severity_score || 5;
  if (severityScore >= 8) return '#991B1B';
  if (severityScore >= 4) return '#F97316';
  return '#22C55E';
}

// Get display value for marker (checkmark for closed, severity for open)
function getMarkerDisplay(issue) {
  if (issue.status?.toLowerCase() === 'closed') {
    return '✓';
  }
  return Math.round(issue.severity_score || 5);
}

// Initialize map
function initMap() {
  if (map) return;

  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [
        { id: 'osm-tiles', type: 'raster', source: 'osm-tiles', minzoom: 0, maxzoom: 19 }
      ]
    },
    center: [77.5946, 12.9716], // Bangalore center
    zoom: 13
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  map.on('load', async () => {
    console.log("Map loaded successfully");
    await setUserLocation();
  });
}

// Set user location - use profile location first, then browser location as fallback
async function setUserLocation() {
  showLoading(true);
  
  // First try to use profile location if available
  if (userProfile && userProfile.location && userProfile.location.latitude && userProfile.location.longitude) {
    userLocation = {
      latitude: userProfile.location.latitude,
      longitude: userProfile.location.longitude
    };
    console.log("Using profile location:", userLocation);
    updateMapLocation();
    await fetchIssues();
    showLoading(false);
    return;
  }
  
  // Fallback to browser geolocation if profile location not available
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser', 'error');
    showLoading(false);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      userLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      
      console.log("Browser location retrieved:", userLocation);
      updateMapLocation();
      await fetchIssues();
      showLoading(false);
    },
    (error) => {
      console.error('Error getting location:', error);
      showToast('Unable to get your location. Please enable location access.', 'error');
      showLoading(false);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

// Update map with user location
function updateMapLocation() {
  if (!userLocation) return;
  
  // Add user location marker
  if (userMarker) {
    userMarker.remove();
  }
      
  const el = document.createElement('div');
  el.className = 'user-marker';
  el.innerHTML = '<div class="user-marker-pulse"></div>';
  
  userMarker = new maplibregl.Marker(el)
    .setLngLat([userLocation.longitude, userLocation.latitude])
    .addTo(map);
  
  // Center map on user location
  map.flyTo({
    center: [userLocation.longitude, userLocation.latitude],
    zoom: 13,
    duration: 1000
  });
}

// Fetch issues from backend with filters
async function fetchIssues() {
  if (!userLocation) {
    showNoLocationState();
    return;
  }

  // Validate location data
  if (typeof userLocation.latitude !== 'number' || typeof userLocation.longitude !== 'number') {
    console.log('Invalid location data for fetching issues');
    showNoLocationState();
    return;
  }

  showLoading(true);
  
  try {
    const params = new URLSearchParams({
      latitude: userLocation.latitude.toString(),
      longitude: userLocation.longitude.toString(),
      radius_km: filters.radiusKm.toString(),
      limit: filters.limit.toString(),
      days_back: filters.days.toString()
    });

    if (filters.status && filters.status !== 'all') {
      params.append('status', filters.status);
    }

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
    const issues = data.issues || [];
    
    displayIssuesOnMap(issues);
    updateFilterSummary(issues.length);
    showLoading(false);
  } catch (error) {
    console.error('Error fetching issues:', error);
    showToast('Failed to load issues. Please try again.', 'error');
    showLoading(false);
  }
}

// Apply client-side filters (for severity and issueTypes)
function getFilteredIssues(issues) {
  let filtered = [...issues];

  // Filter by severity
  if (filters.severity !== 'all') {
    filtered = filtered.filter(issue => {
      const severity = issue.severity_score || 0;
      switch (filters.severity) {
        case 'high': return severity >= 8;
        case 'medium': return severity >= 4 && severity < 8;
        case 'low': return severity < 4;
        default: return true;
      }
    });
  }

  // Filter by issue types
  if (filters.issueTypes && filters.issueTypes.length > 0) {
    const selectedSet = new Set(filters.issueTypes.map(t => String(t).toUpperCase()));
    filtered = filtered.filter(issue => {
      const source = issue.issue_types || issue.detected_issues || [];
      const types = source.map(t => 
        typeof t === 'string' ? t.toUpperCase() : String(t?.type || t?.name || t).toUpperCase()
      );
      return types.some(t => selectedSet.has(t));
    });
  }

  return filtered;
}

// Display issues on map
function displayIssuesOnMap(issues) {
  // Clear existing markers
  issueMarkers.forEach(marker => marker.remove());
  issueMarkers = [];

  // Apply client-side filters
  const filteredIssues = getFilteredIssues(issues);

  if (filteredIssues.length === 0) {
    showEmptyState();
    return;
  }

  // Hide empty state
  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.style.display = 'none';

  // Create markers for each issue
  filteredIssues.forEach(issue => {
    const el = document.createElement('div');
    el.className = 'custom-marker';
    
    const color = getMarkerColor(issue);
    const displayValue = getMarkerDisplay(issue);
    
    el.innerHTML = `
      <div class="marker-inner" style="background-color: ${color};">
        <span class="marker-text">${displayValue}</span>
      </div>
      <div class="marker-arrow" style="border-top-color: ${color};"></div>
    `;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([issue.location.lon, issue.location.lat])
      .addTo(map);

    // Add click event to show issue detail
    el.addEventListener('click', () => openIssueModal(issue));

    issueMarkers.push(marker);
  });
}

// Open issue detail modal
function openIssueModal(issue) {
  const modal = document.getElementById('issue-modal');
  const modalImage = document.getElementById('modal-issue-image');
  const modalTitle = document.getElementById('modal-issue-title');
  const modalStatus = document.getElementById('modal-issue-status');
  const modalSeverity = document.getElementById('modal-issue-severity');
  const modalUpvotes = document.getElementById('modal-issue-upvotes');
  const modalReports = document.getElementById('modal-issue-reports');
  const modalDescription = document.getElementById('modal-issue-description');
  const modalDate = document.getElementById('modal-issue-date');
  const modalIssueTypes = document.getElementById('modal-issue-types');
  const upvoteBtn = document.getElementById('modal-upvote-btn');
  const reportBtn = document.getElementById('modal-report-btn');

  // Set modal content
  if (issue.image_url) {
    modalImage.src = issue.image_url;
    modalImage.style.display = 'block';
  } else {
    modalImage.style.display = 'none';
  }

  modalTitle.textContent = issue.title || 'Civic Issue';
  modalStatus.textContent = issue.status || 'open';
  modalSeverity.textContent = issue.severity_score || 0;
  modalUpvotes.textContent = issue.upvotes || 0;
  modalReports.textContent = issue.reports || 0;
  modalDescription.textContent = issue.description || 'No description available';
  
  const date = new Date(issue.created_at);
  modalDate.textContent = date.toLocaleDateString();

  // Display issue types
  const issueTypes = issue.issue_types || issue.detected_issues || [];
  modalIssueTypes.innerHTML = issueTypes.map(type => {
    const typeName = typeof type === 'string' ? type : type.type || type.name || 'Unknown';
    return `<span class="issue-type-tag">${typeName}</span>`;
  }).join('');

  // Set button states based on user interaction
  const userStatus = issue.userStatus || {};
  upvoteBtn.classList.toggle('active', userStatus.hasUpvoted);
  reportBtn.classList.toggle('active', userStatus.hasReported);

  // Add event listeners
  upvoteBtn.onclick = () => handleVoteAction(issue.id, 'upvote', upvoteBtn);
  reportBtn.onclick = () => handleVoteAction(issue.id, 'report', reportBtn);

  modal.style.display = 'flex';
}

// Handle vote/report action
async function handleVoteAction(issueId, action, button) {
  if (!currentToken) {
    showToast('Please sign in to perform this action', 'error');
    return;
  }

  const wasActive = button.classList.contains('active');
  button.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/api/issues/${issueId}/${action}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const updatedIssue = data.updated_issue;

    // Update UI
    if (action === 'upvote') {
      button.classList.toggle('active');
      document.getElementById('modal-issue-upvotes').textContent = updatedIssue.upvotes || 0;
      showToast(wasActive ? 'Upvote removed' : 'Upvoted successfully', 'success');
    } else {
      button.classList.toggle('active');
      document.getElementById('modal-issue-reports').textContent = updatedIssue.reports || 0;
      showToast(wasActive ? 'Report removed' : 'Reported successfully', 'success');
    }

  } catch (error) {
    console.error(`Error ${action}:`, error);
    showToast(`Failed to ${action}. Please try again.`, 'error');
  } finally {
    button.disabled = false;
  }
}

// Close modal
function closeModal() {
  const modal = document.getElementById('issue-modal');
  modal.style.display = 'none';
}

// Refresh map
function refreshMap() {
  if (userLocation) {
    fetchIssues();
    showToast('Refreshing map...', 'success');
  } else {
    getUserLocation();
  }
}

// Open filter modal (rewritten to match mobile app and feed.js)
function openFilterModal() {
    console.log('🔧 Opening filter modal...');
    
    // Add CSS styles if not already present
    addFilterModalStyles();
    
    // Remove existing modal if any
    const existingModal = document.getElementById('filter-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal HTML matching mobile app structure
    const modalHTML = `
        <div id="filter-modal" class="filter-modal-overlay">
            <div class="filter-modal-container">
                <!-- Header -->
                <div class="filter-header">
                    <h2 class="filter-title">Filters</h2>
                    <button class="filter-close-btn" type="button" onclick="closeFilterModal()">
                        <span>&times;</span>
                    </button>
                </div>

                <!-- Content -->
                <div class="filter-content">
                    <!-- Issue Types -->
                    <div class="filter-section">
                        <label class="filter-section-title">Issue Types</label>
                        <div class="filter-dropdown-container">
                            <div class="filter-multiselect" id="issue-types-selector">
                                <div class="multiselect-display" onclick="toggleIssueTypes()">
                                    <span id="issue-types-text">Select issue types...</span>
                                    <span class="dropdown-arrow">▼</span>
                                </div>
                                <div class="multiselect-dropdown" id="issue-types-dropdown" style="display: none;">
                                    <div class="multiselect-search">
                                        <input type="text" placeholder="Search..." id="issue-types-search" onkeyup="filterIssueTypes()">
                                    </div>
                                    <div class="multiselect-options" id="issue-types-options">
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="pothole"> Pothole
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="streetlight"> Street Light
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="drainage"> Drainage
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="garbage"> Garbage
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="water_supply"> Water Supply
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="road_damage"> Road Damage
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="other"> Other
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Status -->
                    <div class="filter-section">
                        <label class="filter-section-title">Status</label>
                        <div class="filter-options">
                            <button type="button" class="filter-option active" data-filter="status" data-value="all">All</button>
                            <button type="button" class="filter-option" data-filter="status" data-value="open">Open</button>
                            <button type="button" class="filter-option" data-filter="status" data-value="closed">Closed</button>
                        </div>
                    </div>

                    <!-- My Contributions -->
                    <div class="filter-section">
                        <label class="filter-section-title">My Contributions</label>
                        <div class="filter-options">
                            <button type="button" class="filter-option active" data-filter="myIssues" data-value="all">All Issues</button>
                            <button type="button" class="filter-option" data-filter="myIssues" data-value="uploaded">Uploaded by Me</button>
                        </div>
                    </div>

                    <!-- Severity -->
                    <div class="filter-section">
                        <label class="filter-section-title">Severity</label>
                        <div class="filter-options">
                            <button type="button" class="filter-option active" data-filter="severity" data-value="all">All</button>
                            <button type="button" class="filter-option" data-filter="severity" data-value="high">High</button>
                            <button type="button" class="filter-option" data-filter="severity" data-value="medium">Medium</button>
                            <button type="button" class="filter-option" data-filter="severity" data-value="low">Low</button>
                        </div>
                    </div>

                    <!-- Time Range -->
                    <div class="filter-section">
                        <label class="filter-section-title">Time Range</label>
                        <div class="filter-options">
                            <button type="button" class="filter-option" data-filter="days" data-value="7">7d</button>
                            <button type="button" class="filter-option active" data-filter="days" data-value="30">30d</button>
                            <button type="button" class="filter-option" data-filter="days" data-value="90">90d</button>
                            <button type="button" class="filter-option" data-filter="days" data-value="365">365d</button>
                        </div>
                    </div>

                    <!-- Distance -->
                    <div class="filter-section">
                        <label class="filter-section-title">Distance</label>
                        <div class="filter-options">
                            <button type="button" class="filter-option" data-filter="radiusKm" data-value="2">2 km</button>
                            <button type="button" class="filter-option active" data-filter="radiusKm" data-value="5">5 km</button>
                            <button type="button" class="filter-option" data-filter="radiusKm" data-value="10">10 km</button>
                            <button type="button" class="filter-option" data-filter="radiusKm" data-value="25">25 km</button>
                        </div>
                    </div>

                    <!-- Number of Issues -->
                    <div class="filter-section">
                        <label class="filter-section-title">Number of Issues</label>
                        <div class="filter-options">
                            <button type="button" class="filter-option" data-filter="limit" data-value="10">10</button>
                            <button type="button" class="filter-option active" data-filter="limit" data-value="20">20</button>
                            <button type="button" class="filter-option" data-filter="limit" data-value="50">50</button>
                            <button type="button" class="filter-option" data-filter="limit" data-value="100">100</button>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div class="filter-footer">
                    <button type="button" class="filter-reset-btn" onclick="resetMapFilters()">Reset</button>
                    <button type="button" class="filter-apply-btn" onclick="applyMapFilters()">Apply Filters</button>
                </div>
            </div>
        </div>
    `;

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    console.log('✅ Modal HTML added to page');
    
    // Set up event listeners for filter options
    setupMapFilterEventListeners();
    
    // Set current filter values
    updateMapFilterDisplay();
    
    // Show modal with animation
    setTimeout(() => {
        const modal = document.getElementById('filter-modal');
        if (modal) {
            modal.classList.add('show');
            console.log('✅ Modal displayed');
        }
    }, 10);
}

// Add CSS styles for filter modal (if not already added by feed.js)
function addFilterModalStyles() {
    if (document.getElementById('filter-modal-styles')) return; // Already added
    
    const styles = `
    <style id="filter-modal-styles">
    .filter-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease;
    }
    
    .filter-modal-overlay.show {
        opacity: 1;
    }
    
    .filter-modal-container {
        background: white;
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        border-radius: 12px;
        overflow: hidden;
        transform: translateY(20px);
        transition: transform 0.3s ease;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    }
    
    .filter-modal-overlay.show .filter-modal-container {
        transform: translateY(0);
    }
    
    .filter-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 1px solid #e0e0e0;
        background: #f8f9fa;
    }
    
    .filter-title {
        margin: 0;
        font-size: 1.4rem;
        font-weight: 600;
        color: #333;
    }
    
    .filter-close-btn {
        background: none;
        border: none;
        font-size: 1.8rem;
        color: #666;
        cursor: pointer;
        padding: 5px;
        border-radius: 50%;
        transition: background-color 0.2s;
    }
    
    .filter-close-btn:hover {
        background-color: #e0e0e0;
    }
    
    .filter-content {
        padding: 20px;
        max-height: calc(90vh - 160px);
        overflow-y: auto;
    }
    
    .filter-section {
        margin-bottom: 24px;
    }
    
    .filter-section-title {
        display: block;
        font-weight: 600;
        color: #333;
        margin-bottom: 12px;
        font-size: 1rem;
    }
    
    .filter-options {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    
    .filter-option {
        padding: 10px 16px;
        border: 2px solid #e0e0e0;
        background: white;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s;
    }
    
    .filter-option:hover {
        border-color: #007bff;
        background-color: #f8f9fa;
    }
    
    .filter-option.active {
        background-color: #007bff;
        border-color: #007bff;
        color: white;
    }
    
    .filter-dropdown-container {
        position: relative;
    }
    
    .filter-multiselect {
        position: relative;
        width: 100%;
    }
    
    .multiselect-display {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        background: white;
        cursor: pointer;
        transition: border-color 0.2s;
    }
    
    .multiselect-display:hover {
        border-color: #007bff;
    }
    
    .dropdown-arrow {
        color: #666;
        transition: transform 0.2s;
    }
    
    .multiselect-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        border: 2px solid #e0e0e0;
        border-top: none;
        border-radius: 0 0 8px 8px;
        z-index: 1000;
        max-height: 200px;
        overflow-y: auto;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    .multiselect-search input {
        width: 100%;
        padding: 12px;
        border: none;
        border-bottom: 1px solid #e0e0e0;
        outline: none;
        font-size: 0.9rem;
    }
    
    .multiselect-options {
        max-height: 150px;
        overflow-y: auto;
    }
    
    .multiselect-option {
        display: flex;
        align-items: center;
        padding: 12px;
        cursor: pointer;
        transition: background-color 0.2s;
    }
    
    .multiselect-option:hover {
        background-color: #f8f9fa;
    }
    
    .multiselect-option input {
        margin-right: 10px;
    }
    
    .filter-footer {
        display: flex;
        gap: 12px;
        padding: 20px;
        border-top: 1px solid #e0e0e0;
        background: #f8f9fa;
    }
    
    .filter-reset-btn, .filter-apply-btn {
        flex: 1;
        padding: 12px 24px;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .filter-reset-btn {
        background: #6c757d;
        color: white;
    }
    
    .filter-reset-btn:hover {
        background: #5a6268;
    }
    
    .filter-apply-btn {
        background: #007bff;
        color: white;
    }
    
    .filter-apply-btn:hover {
        background: #0056b3;
    }
    
    @media (max-width: 768px) {
        .filter-modal-container {
            width: 95%;
            margin: 10px;
        }
        
        .filter-content {
            padding: 16px;
        }
        
        .filter-header {
            padding: 16px;
        }
        
        .filter-footer {
            padding: 16px;
        }
    }
    </style>
    `;
    
    document.head.insertAdjacentHTML('beforeend', styles);
}

// Setup event listeners for filter options
function setupMapFilterEventListeners() {
    const filterOptions = document.querySelectorAll('.filter-option');
    filterOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            const filterType = e.target.dataset.filter;
            const value = e.target.dataset.value;
            
            // Remove active from siblings
            const siblings = e.target.parentElement.querySelectorAll('.filter-option');
            siblings.forEach(s => s.classList.remove('active'));
            
            // Add active to clicked option
            e.target.classList.add('active');
            
            console.log(`Filter changed: ${filterType} = ${value}`);
        });
    });
}

// Update filter display with current values
function updateMapFilterDisplay() {
    // Set status
    const statusBtn = document.querySelector(`[data-filter="status"][data-value="${filters.status}"]`);
    if (statusBtn) {
        statusBtn.parentElement.querySelectorAll('.filter-option').forEach(btn => btn.classList.remove('active'));
        statusBtn.classList.add('active');
    }
    
    // Set severity
    const severityBtn = document.querySelector(`[data-filter="severity"][data-value="${filters.severity}"]`);
    if (severityBtn) {
        severityBtn.parentElement.querySelectorAll('.filter-option').forEach(btn => btn.classList.remove('active'));
        severityBtn.classList.add('active');
    }
    
    // Set days
    const daysBtn = document.querySelector(`[data-filter="days"][data-value="${filters.days}"]`);
    if (daysBtn) {
        daysBtn.parentElement.querySelectorAll('.filter-option').forEach(btn => btn.classList.remove('active'));
        daysBtn.classList.add('active');
    }
    
    // Set radius
    const radiusBtn = document.querySelector(`[data-filter="radiusKm"][data-value="${filters.radiusKm}"]`);
    if (radiusBtn) {
        radiusBtn.parentElement.querySelectorAll('.filter-option').forEach(btn => btn.classList.remove('active'));
        radiusBtn.classList.add('active');
    }
    
    // Set limit
    const limitBtn = document.querySelector(`[data-filter="limit"][data-value="${filters.limit}"]`);
    if (limitBtn) {
        limitBtn.parentElement.querySelectorAll('.filter-option').forEach(btn => btn.classList.remove('active'));
        limitBtn.classList.add('active');
    }
    
    // Set myIssues if it exists in filters
    if (filters.myIssues !== undefined) {
        const myIssuesBtn = document.querySelector(`[data-filter="myIssues"][data-value="${filters.myIssues}"]`);
        if (myIssuesBtn) {
            myIssuesBtn.parentElement.querySelectorAll('.filter-option').forEach(btn => btn.classList.remove('active'));
            myIssuesBtn.classList.add('active');
        }
    }
    
    // Set issue types checkboxes
    if (filters.issueTypes && Array.isArray(filters.issueTypes)) {
        filters.issueTypes.forEach(type => {
            const checkbox = document.querySelector(`input[value="${type}"]`);
            if (checkbox) checkbox.checked = true;
        });
    }
    
    updateIssueTypesDisplayMap();
}

// Toggle issue types dropdown
function toggleIssueTypes() {
    const dropdown = document.getElementById('issue-types-dropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
}

// Filter issue types based on search
function filterIssueTypes() {
    const search = document.getElementById('issue-types-search').value.toLowerCase();
    const options = document.querySelectorAll('#issue-types-options .multiselect-option');
    
    options.forEach(option => {
        const text = option.textContent.toLowerCase();
        option.style.display = text.includes(search) ? 'block' : 'none';
    });
}

// Update issue types display text
function updateIssueTypesDisplayMap() {
    const checkboxes = document.querySelectorAll('#issue-types-options input[type="checkbox"]:checked');
    const display = document.getElementById('issue-types-text');
    
    if (display) {
        if (checkboxes.length === 0) {
            display.textContent = 'Select issue types...';
        } else {
            const types = Array.from(checkboxes).map(cb => cb.parentElement.textContent.trim());
            display.textContent = `${types.length} type${types.length > 1 ? 's' : ''} selected`;
        }
    }
}

// Listen for issue type changes
document.addEventListener('change', (e) => {
    if (e.target.matches('#issue-types-options input[type="checkbox"]')) {
        updateIssueTypesDisplayMap();
    }
});

// Close filter modal
function closeFilterModal() {
    const modal = document.getElementById('filter-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
    console.log('✅ Filter modal closed');
}

// Reset filters to default
function resetMapFilters() {
    // Initialize with default values
    filters.status = 'all';
    filters.severity = 'all';
    filters.days = 30;
    filters.radiusKm = 5;
    filters.limit = 20;
    filters.issueTypes = [];
    if (filters.myIssues !== undefined) {
        filters.myIssues = 'all';
    }
    
    updateMapFilterDisplay();
    console.log('✅ Filters reset to default');
}

// Apply selected filters
function applyMapFilters() {
    // Get all selected filter values
    const statusBtn = document.querySelector('.filter-option[data-filter="status"].active');
    if (statusBtn) filters.status = statusBtn.dataset.value;
    
    const severityBtn = document.querySelector('.filter-option[data-filter="severity"].active');
    if (severityBtn) filters.severity = severityBtn.dataset.value;
    
    const daysBtn = document.querySelector('.filter-option[data-filter="days"].active');
    if (daysBtn) filters.days = parseInt(daysBtn.dataset.value);
    
    const radiusBtn = document.querySelector('.filter-option[data-filter="radiusKm"].active');
    if (radiusBtn) filters.radiusKm = parseInt(radiusBtn.dataset.value);
    
    const limitBtn = document.querySelector('.filter-option[data-filter="limit"].active');
    if (limitBtn) filters.limit = parseInt(limitBtn.dataset.value);
    
    const myIssuesBtn = document.querySelector('.filter-option[data-filter="myIssues"].active');
    if (myIssuesBtn) filters.myIssues = myIssuesBtn.dataset.value;

    // Get selected issue types
    const selectedTypes = Array.from(document.querySelectorAll('#issue-types-options input[type="checkbox"]:checked'))
        .map(cb => cb.value);
    filters.issueTypes = selectedTypes;

    console.log('🎯 Applied filters:', filters);
    
    // Close modal and fetch issues with new filters
    closeFilterModal();
    
    // Fetch new issues with filters
    fetchIssues();
    
    // Update filter summary
    updateFilterSummary();
    
    showToast('✅ Filters applied successfully!', 'success');
}

// Make functions global for onclick handlers
window.closeFilterModal = closeFilterModal;
window.resetMapFilters = resetMapFilters;
window.applyMapFilters = applyMapFilters;
window.toggleIssueTypes = toggleIssueTypes;
window.filterIssueTypes = filterIssueTypes;

// Update filter summary
function updateFilterSummary(count) {
  const summary = document.getElementById('filter-summary');
  if (summary) {
    summary.textContent = `${count} issues found`;
  }
}

// Show loading state
function showLoading(show) {
  const loadingEl = document.getElementById('loading-state');
  if (loadingEl) {
    loadingEl.style.display = show ? 'flex' : 'none';
  }
}

// Show no location state
function showNoLocationState() {
  const container = document.getElementById('map');
  const noLocationEl = document.getElementById('no-location-state');
  if (noLocationEl) {
    noLocationEl.style.display = 'flex';
  }
}

// Show empty state
function showEmptyState() {
  const emptyState = document.getElementById('empty-state');
  if (emptyState) {
    emptyState.style.display = 'flex';
  }
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  console.log("Map page loaded");
  
  initThemeToggle();
  initMobileMenu();

  // Initialize auth listener
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
      console.log("User authenticated, loading profile and initializing map");
      
      // Load user profile first
      await loadUserProfile();
      
      // Initialize map
      initMap();

      // Add event listeners
      const refreshBtn = document.getElementById('refresh-btn');
      const filterBtn = document.getElementById('filter-btn');
      const myLocationBtn = document.getElementById('my-location-btn');
      const closeModalBtn = document.getElementById('close-modal');
      const closeFilterBtn = document.getElementById('close-filter-modal');
      const applyFilterBtn = document.getElementById('apply-filters');
      const retryLocationBtn = document.getElementById('retry-location-btn');

      if (refreshBtn) refreshBtn.addEventListener('click', refreshMap);
      if (filterBtn) filterBtn.addEventListener('click', openFilterModal);
      if (myLocationBtn) myLocationBtn.addEventListener('click', getUserLocation);
      if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
      if (closeFilterBtn) closeFilterBtn.addEventListener('click', closeFilterModal);
      if (applyFilterBtn) applyFilterBtn.addEventListener('click', applyFilters);
      if (retryLocationBtn) retryLocationBtn.addEventListener('click', getUserLocation);

      // Close modals on background click
      const issueModal = document.getElementById('issue-modal');
      const filterModal = document.getElementById('filter-modal');
      
      if (issueModal) {
        issueModal.addEventListener('click', (e) => {
          if (e.target === issueModal) closeModal();
        });
      }
      
      if (filterModal) {
        filterModal.addEventListener('click', (e) => {
          if (e.target === filterModal) closeFilterModal();
        });
      }

    } catch (error) {
      console.error("Error during initialization:", error);
      showToast('Failed to initialize. Please refresh the page.', 'error');
    }
  });
});
