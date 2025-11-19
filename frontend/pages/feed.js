// Modern Feed Page - Matching Mobile App HomeScreen.js functionality
import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js';
import { auth } from '../firebaseConfig.js';
import { getIdToken } from "firebase/auth";

const API_BASE = 'http://localhost:8000';

// State management
let currentUser = null;
let userProfile = null;
let allIssues = [];
let userLocation = null;
let currentPage = 1;
let hasMore = true;
let isLoading = false;
let isLoadingMore = false;

// Filters matching mobile app
let filters = {
    status: 'open',
    severity: 'all',
    sortBy: 'severity',
    days: 30,
    radiusKm: 5,
    issueTypes: [],
    limit: 20,
    myIssues: 'all'
};

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    initializeAuthListener();
    initThemeToggle();
    initMobileMenu();
    
    // Wait for auth
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserProfile();
            await setUserLocation(); // Use profile location first, then browser location
            await fetchIssues();
            setupEventListeners();
        } else {
            window.location.href = '/login.html';
        }
    });
});

// Load user profile from backend
async function loadUserProfile() {
    try {
        const idToken = await getIdToken(currentUser, true);
        const response = await fetch(`${API_BASE}/api/users/${currentUser.uid}/stats-firebase`, {
            headers: { 'Authorization': `Bearer ${idToken}` }
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

// Set user location - use profile location first, then browser location as fallback
async function setUserLocation() {
    // First try to use profile location if available
    if (userProfile && userProfile.location && userProfile.location.latitude && userProfile.location.longitude) {
        userLocation = {
            latitude: userProfile.location.latitude,
            longitude: userProfile.location.longitude
        };
        console.log("Using profile location:", userLocation);
        return userLocation;
    }
    
    // Fallback to browser geolocation if profile location not available
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.warn("Geolocation not supported and no profile location");
            showNoLocationUI();
            resolve(null);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                console.log("Browser location retrieved:", userLocation);
                resolve(userLocation);
            },
            (error) => {
                console.error("Error getting browser location:", error);
                showNoLocationUI();
                resolve(null);
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
    });
}

// Show UI when no location available
function showNoLocationUI() {
    const grid = document.getElementById('issues-grid');
    if (grid) {
        grid.innerHTML = `
            <div class="no-location-state">
                <div class="location-icon">📍</div>
                <h3>Welcome to CivicFix!</h3>
                <p>We need your location to show nearby issues.</p>
                <button id="set-location-btn" class="cta-button primary">
                    📍 Set My Location
                </button>
                <p class="help-text">
                    You can change your location anytime from your profile or the map screen.
                </p>
            </div>
        `;
        
        document.getElementById('set-location-btn')?.addEventListener('click', async () => {
            await getUserLocation();
            if (userLocation) {
                await fetchIssues();
            }
        });
    }
}

// Fetch issues with user status - matching mobile app endpoint
async function fetchIssues(refresh = false) {
    if (!userLocation) {
        console.log('No location available for fetching issues');
        showNoLocationUI();
        return;
    }
    
    if (isLoading) return;
    
    if (refresh) {
        currentPage = 1;
        hasMore = true;
        allIssues = [];
    }
    
    isLoading = true;
    const grid = document.getElementById('issues-grid');
    
    if (refresh || currentPage === 1) {
        if (grid) grid.innerHTML = '<div class="loading-spinner"></div>';
    }
    
    try {
        const idToken = await getIdToken(currentUser, true);
        
        // Validate location data
        if (typeof userLocation.latitude !== 'number' || typeof userLocation.longitude !== 'number') {
            throw new Error('Invalid location data');
        }
        
        // Use the same endpoint as mobile app
        const params = new URLSearchParams({
            latitude: userLocation.latitude.toString(),
            longitude: userLocation.longitude.toString(),
            radius_km: filters.radiusKm.toString(),
            limit: filters.limit.toString(),
            skip: ((currentPage - 1) * filters.limit).toString(),
            days_back: filters.days.toString()
        });
        
        // Add optional filters
        if (filters.status && filters.status !== 'all') {
            params.append('status', filters.status);
        }
        if (filters.severity && filters.severity !== 'all') {
            params.append('severity', filters.severity);
        }
        if (filters.issueTypes && filters.issueTypes.length > 0) {
            params.append('issue_types', filters.issueTypes.join(','));
        }
        
        const response = await fetch(
            `${API_BASE}/api/issues/with-user-status?${params}`,
            {
                headers: { 'Authorization': `Bearer ${idToken}` }
            }
        );
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const newIssues = data.issues || [];
        
        if (refresh) {
            allIssues = newIssues;
        } else {
            allIssues = [...allIssues, ...newIssues];
        }
        
        hasMore = newIssues.length >= filters.limit;
        
        renderIssues();
        updateFilterSummary();
        
    } catch (error) {
        console.error('Error fetching issues:', error);
        showToast(`❌ Error loading issues: ${error.message}`);
        if (grid) grid.innerHTML = '<p class="error-message">Failed to load issues. Please try again.</p>';
    } finally {
        isLoading = false;
    }
}

// Apply client-side filters (matching mobile app)
function getFilteredIssues() {
    let filtered = [...allIssues];
    
    // Filter by status
    if (filters.status !== 'all') {
        filtered = filtered.filter(issue => 
            issue.status?.toLowerCase() === filters.status
        );
    }
    
    // Filter by severity
    if (filters.severity !== 'all') {
        filtered = filtered.filter(issue => {
            const score = issue.severity_score || 0;
            switch (filters.severity) {
                case 'high': return score >= 8;
                case 'medium': return score >= 4 && score < 8;
                case 'low': return score < 4;
                default: return true;
            }
        });
    }
    
    // Filter by issue types
    if (filters.issueTypes && filters.issueTypes.length > 0) {
        filtered = filtered.filter(issue => {
            const types = (issue.issue_types || []).map(t => t.toUpperCase());
            return filters.issueTypes.some(ft => types.includes(ft.toUpperCase()));
        });
    }
    
    // Filter by my issues
    if (filters.myIssues !== 'all' && currentUser) {
        filtered = filtered.filter(issue => {
            if (filters.myIssues === 'uploaded') {
                return issue.reported_by === currentUser.uid;
            } else if (filters.myIssues === 'fixed') {
                return issue.closed_by === currentUser.uid;
            }
            return true;
        });
    }
    
    // Sort
    filtered.sort((a, b) => {
        switch (filters.sortBy) {
            case 'date':
                return new Date(b.created_at) - new Date(a.created_at);
            case 'likes':
                const aLikes = a.status === 'closed' ? (a.upvotes?.closed || 0) : (a.upvotes?.open || 0);
                const bLikes = b.status === 'closed' ? (b.upvotes?.closed || 0) : (b.upvotes?.open || 0);
                return bLikes - aLikes;
            case 'severity':
            default:
                return (b.severity_score || 0) - (a.severity_score || 0);
        }
    });
    
    return filtered;
}

// Render issues to grid
function renderIssues() {
    const grid = document.getElementById('issues-grid');
    if (!grid) return;
    
    const filteredIssues = getFilteredIssues();
    
    if (filteredIssues.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <h3>No issues found</h3>
                <p>Try adjusting your filters or location settings.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filteredIssues.map(issue => createIssueCard(issue)).join('');
    
    // Add load more button if there are more issues
    if (hasMore && !isLoadingMore) {
        const loadMoreBtn = document.createElement('div');
        loadMoreBtn.className = 'load-more-container';
        loadMoreBtn.innerHTML = `
            <button id="load-more-btn" class="cta-button secondary">
                Load More Issues
            </button>
        `;
        grid.appendChild(loadMoreBtn);
        
        document.getElementById('load-more-btn')?.addEventListener('click', loadMoreIssues);
    } else if (isLoadingMore) {
        const loader = document.createElement('div');
        loader.className = 'loading-more';
        loader.innerHTML = '<div class="loading-spinner"></div><p>Loading more issues...</p>';
        grid.appendChild(loader);
    }
    
    // Attach event listeners
    attachCardListeners();
}

// Create issue card HTML
function createIssueCard(issue) {
    const isClosed = issue.status?.toLowerCase() === 'closed';
    const upvoteCount = isClosed ? (issue.upvotes?.closed || 0) : (issue.upvotes?.open || 0);
    const reportCount = isClosed ? (issue.reports?.closed || 0) : (issue.reports?.open || 0);
    
    const severityScore = issue.severity_score || 0;
    const severityColor = severityScore >= 8 ? '#FF6B6B' : severityScore >= 4 ? '#FFD93D' : '#6FCF97';
    const severityLabel = severityScore >= 8 ? 'High' : severityScore >= 4 ? 'Medium' : 'Low';
    
    const issueTypes = Array.isArray(issue.issue_types) ? issue.issue_types : [issue.issue_types || 'unknown'];
    const primaryType = issueTypes[0] || 'unknown';
    
    const distance = issue.distance_km ? `${issue.distance_km.toFixed(1)}km away` : '';
    
    // Generate location text - use address if available, otherwise coordinates
    let locationText = distance;
    if (!distance && issue.location && issue.location.lat && issue.location.lon) {
        locationText = `${issue.location.lat.toFixed(4)}, ${issue.location.lon.toFixed(4)}`;
    }
    if (issue.address) {
        locationText = distance ? `${issue.address.split(',')[0]} (${distance})` : issue.address.split(',')[0];
    }
    
    const statusText = isClosed ? '✅ Closed' : 
                      issue.status === 'verified' ? '🟡 Verified' : 
                      issue.status === 'spam' ? '🚫 Spam' : '🟠 Open';
    
    const hasUpvoted = issue.userStatus?.hasUpvoted || false;
    const hasReported = issue.userStatus?.hasReported || false;
    
    return `
        <div class="issue-card" data-issue-id="${issue.issue_id}">
            <img src="${issue.photo_url || 'placeholder.png'}" 
                 alt="${primaryType}" 
                 class="issue-thumbnail"
                 onerror="this.src='placeholder.png'">
            <div class="issue-content">
                <div class="issue-header">
                    <div class="issue-types-container">
                        ${issueTypes.map(type => `<span class="issue-type-tag">${type.replace(/_/g, ' ')}</span>`).join('')}
                    </div>
                    <span class="severity-badge" style="background: ${severityColor};">
                        ${severityLabel} (${severityScore.toFixed(1)})
                    </span>
                </div>
                <div class="issue-meta">
                    <span class="issue-distance">📍 ${locationText}</span>
                    <span class="status-badge">${statusText}</span>
                </div>
                <p class="issue-description">${issue.description || 'No description provided'}</p>
                <div class="issue-stats">
                    <span>⚠️ ${(issue.fate_risk_co2 || 0).toFixed(1)} kg CO₂ risk</span>
                    <span>📊 ${reportCount} reports</span>
                </div>
                <div class="issue-actions">
                    <button class="vote-button ${hasUpvoted ? 'active' : ''}" 
                            data-action="upvote" 
                            data-issue-id="${issue.issue_id}">
                        👍 ${upvoteCount}
                    </button>
                    <button class="vote-button ${hasReported ? 'active' : ''}" 
                            data-action="report" 
                            data-issue-id="${issue.issue_id}">
                        👎 Report
                    </button>
                    <button class="detail-button" data-issue-id="${issue.issue_id}">
                        View Details
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Attach event listeners to cards
function attachCardListeners() {
    // Vote buttons
    document.querySelectorAll('.vote-button').forEach(button => {
        button.addEventListener('click', handleVoteAction);
    });
    
    // Detail buttons
    document.querySelectorAll('.detail-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const issueId = e.target.dataset.issueId;
            const issue = allIssues.find(i => i.issue_id === issueId);
            if (issue) openIssueModal(issue);
        });
    });
    
    // Card click (except on buttons)
    document.querySelectorAll('.issue-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                const issueId = card.dataset.issueId;
                const issue = allIssues.find(i => i.issue_id === issueId);
                if (issue) openIssueModal(issue);
            }
        });
    });
}

// Handle upvote/report actions
async function handleVoteAction(e) {
    e.stopPropagation();
    
    const button = e.currentTarget;
    const action = button.dataset.action;
    const issueId = button.dataset.issueId;
    
    if (button.disabled) return;
    
    button.disabled = true;
    
    try {
        const idToken = await getIdToken(currentUser, true);
        
        const response = await fetch(
            `${API_BASE}/api/issues/${issueId}/${action}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Failed to ${action}`);
        }
        
        const result = await response.json();
        
        // Update local state
        const issueIndex = allIssues.findIndex(i => i.issue_id === issueId);
        if (issueIndex !== -1) {
            allIssues[issueIndex] = result.updated_issue || allIssues[issueIndex];
            
            // Update UI
            renderIssues();
        }
        
        showToast(action === 'upvote' ? '👍 Upvoted!' : '👎 Reported!');
        
    } catch (error) {
        console.error(`Error ${action}:`, error);
        showToast(`❌ Failed to ${action}`);
    } finally {
        button.disabled = false;
    }
}

// Load more issues (pagination)
async function loadMoreIssues() {
    if (isLoadingMore || !hasMore) return;
    
    isLoadingMore = true;
    currentPage++;
    
    const grid = document.getElementById('issues-grid');
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    
    await fetchIssues(false);
    
    isLoadingMore = false;
}

// Open issue detail modal with proper formatting matching mobile app
async function openIssueModal(issue) {
  console.log('🔍 Opening modal for issue:', issue);
  const modal = document.getElementById('issue-modal');
  if (!modal) {
    console.error('Modal element not found');
    return;
  }

  // Always recreate the modal HTML structure to ensure it's up to date
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <div class="modal-body">
        <div class="modal-media">
          <img id="modal-issue-image" src="" alt="Issue Image" style="width: 100%; height: auto; display: block;" />
        </div>
        <div class="modal-header">
          <h2 class="modal-title">Issue Details</h2>
        </div>
        <div class="issue-info-section">
          <div class="issue-location-card">
            <div class="info-row">
              <i class="fas fa-map-marker-alt"></i>
              <p id="modal-issue-location">Location placeholder</p>
            </div>
            <div class="info-row">
              <i class="fas fa-calendar-alt"></i>
              <p>Uploaded on: <span id="modal-issue-date">Date placeholder</span></p>
            </div>
            <div class="info-row">
              <i class="fas fa-user"></i>
              <p>Uploaded by: <span id="modal-issue-uploader">Uploader placeholder</span></p>
            </div>
          </div>
          <div class="issue-stats-grid">
            <div class="stat-item">
              <span class="stat-label">Status</span>
              <span id="modal-issue-status" class="stat-value"></span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Severity</span>
              <span id="modal-issue-severity" class="stat-value">N/A</span>
            </div>
            <div class="stat-item">
              <span class="stat-label" id="modal-co2-label">CO₂ Risk</span>
              <span id="modal-issue-co2" class="stat-value">0 kg</span>
            </div>
          </div>
        </div>
        <div id="open-issue-details">
          <div class="issue-description-section">
            <h3>Description</h3>
            <p id="modal-issue-description">Description placeholder</p>
          </div>
          <div class="detected-issues-section">
            <h3>Detected Issues</h3>
            <div id="modal-detected-issues-container"></div>
          </div>
        </div>
        <div id="closed-issue-details" style="display: none;">
          <div class="fix-info-section">
            <h3>Fix Information</h3>
            <div id="fix-details-container">
              <div class="loading-spinner" style="display: none;"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer" id="modal-footer" style="display: none; padding: 16px 24px; border-top: 2px solid rgba(0,0,0,0.06); background: #F9FAFB;">
        <!-- Action buttons will be injected here -->
      </div>
    </div>
  `;

  console.log('✅ Modal HTML structure created');

  // Wait for DOM to update
  await new Promise(resolve => setTimeout(resolve, 50));

  // Use the same logic as map.js for consistency
  const modalImage = document.getElementById('modal-issue-image');
  const modalLocation = document.getElementById('modal-issue-location');
  const modalDate = document.getElementById('modal-issue-date');
  const modalUploader = document.getElementById('modal-issue-uploader');
  const modalStatus = document.getElementById('modal-issue-status');
  const modalSeverity = document.getElementById('modal-issue-severity');
  const modalCo2Label = document.getElementById('modal-co2-label');
  const modalCo2 = document.getElementById('modal-issue-co2');
  const modalDescription = document.getElementById('modal-issue-description');
  const detectedIssuesContainer = document.getElementById('modal-detected-issues-container');
  const openDetailsContainer = document.getElementById('open-issue-details');
  const closedDetailsContainer = document.getElementById('closed-issue-details');
  const fixDetailsContainer = document.getElementById('fix-details-container');
  const modalContent = modal.querySelector('.modal-content');

  console.log('📦 Elements found:', {
    modalContent: !!modalContent,
    modalImage: !!modalImage,
    modalLocation: !!modalLocation,
    modalStatus: !!modalStatus
  });

  // Reset modal state
  if (openDetailsContainer) openDetailsContainer.style.display = 'none';
  if (closedDetailsContainer) closedDetailsContainer.style.display = 'none';
  if (modalContent) modalContent.style.backgroundColor = '';

  // Set issue image - ALWAYS show if available
  if (modalImage) {
    const imageUrl = issue.photo_url || issue.image_url || '';
    console.log('🖼️ Issue data:', { photo_url: issue.photo_url, image_url: issue.image_url, final: imageUrl });
    
    const mediaContainer = modalImage.parentElement;
    if (mediaContainer) {
      console.log('📦 Modal media container found');
    }
    
    if (imageUrl) {
      console.log('✅ Setting image source:', imageUrl);
      modalImage.src = imageUrl;
      modalImage.style.display = 'block';
      if (mediaContainer) mediaContainer.style.display = 'block';
      
      modalImage.onload = () => {
        console.log('✅ Image loaded successfully');
      };
      
      modalImage.onerror = () => {
        console.error('❌ Failed to load issue image:', imageUrl);
        modalImage.style.display = 'none';
        if (mediaContainer) mediaContainer.style.display = 'none';
      };
    } else {
      console.log('⚠️ No image URL found, hiding image');
      modalImage.style.display = 'none';
      if (mediaContainer) mediaContainer.style.display = 'none';
    }
  }

// Generate address from coordinates
async function getAddressFromCoords(latitude, longitude) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
    );
    const data = await response.json();
    return data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  } catch (error) {
    console.error('Error geocoding:', error);
    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  }
}
  
  if (modalLocation) {
    modalLocation.textContent = issue.address || 
                              (issue.location ? `${issue.location.lat?.toFixed(4) || 0}, ${issue.location.lon?.toFixed(4) || 0}` : 'Location not available');
    console.log('📍 Location set:', modalLocation.textContent);
  }
  if (modalDate) modalDate.textContent = new Date(issue.created_at).toLocaleString();
  if (modalUploader) modalUploader.textContent = issue.uploader_display_name || 'Anonymous';
  
  if (modalStatus) {
    modalStatus.textContent = issue.status || 'N/A';
    modalStatus.className = `stat-value ${(issue.status || 'open').toLowerCase()}`;
    console.log('✅ Status set:', modalStatus.textContent);
  }
  
  if (modalSeverity) {
    modalSeverity.textContent = `${Math.round(issue.severity_score || 0)}/10`;
    console.log('⚠️ Severity set:', modalSeverity.textContent);
  }
  
  const isClosed = issue.status?.toLowerCase() === 'closed';
  console.log('🔒 Is closed?', isClosed);

  // Handle status-specific logic
  if (isClosed) {
    if (modalContent) modalContent.style.backgroundColor = '#d4edda';
    if (closedDetailsContainer) closedDetailsContainer.style.display = 'block';
    
    if (modalCo2Label) modalCo2Label.textContent = 'CO₂ Saved';
    if (modalCo2) modalCo2.textContent = `${Math.round(issue.fate_risk_co2 || 0)} kg`;
    
    // Fetch fix details with enhanced information
    if (fixDetailsContainer) {
      await fetchFixDetailsForFeed(issue.issue_id, fixDetailsContainer, modalCo2);
    }
  } else {
    // Open issue logic
    const severityScore = issue.severity_score || 0;
    if (modalContent) {
      if (severityScore >= 8) modalContent.style.backgroundColor = '#f8d7da';
      else if (severityScore >= 4) modalContent.style.backgroundColor = '#fff3cd';
      else modalContent.style.backgroundColor = '#d1ecf1';
    }

    if (openDetailsContainer) openDetailsContainer.style.display = 'block';
    if (modalCo2Label) modalCo2Label.textContent = 'CO₂ Risk';
    if (modalCo2) modalCo2.textContent = `${Math.round(issue.fate_risk_co2 || 0)} kg`;
    
    if (modalDescription) modalDescription.textContent = issue.description || 'No description provided.';

    // Display detected issues
    if (detectedIssuesContainer) {
      const detectedIssues = issue.detected_issues || [];
      if (detectedIssues.length > 0) {
        detectedIssuesContainer.innerHTML = detectedIssues.map(detected => `
          <div class="detected-issue-card" style="border-left-color: ${getFeedSeverityColor(detected.severity)}">
            <div class="detected-issue-header">
              <span class="issue-type-name">${getFeedIssueDisplayName(detected.type)}</span>
              <span class="issue-severity-badge" style="background-color: ${getFeedSeverityColor(detected.severity)}">${detected.severity.toUpperCase()}</span>
            </div>
            <div class="detected-issue-body">
              <p><strong>Severity Score:</strong> ${detected.severity_score}/10</p>
              <p><strong>Future Impact:</strong> ${detected.future_impact || 'Not specified'}</p>
              <p><strong>Predicted Fix:</strong> ${detected.predicted_fix || 'Not specified'}</p>
            </div>
          </div>
        `).join('');
      } else {
        detectedIssuesContainer.innerHTML = '<p style="text-align: center; color: #666; font-style: italic; padding: 20px;">No specific issues were automatically detected.</p>';
      }
    }
  }

  // Add close button event listeners
  const closeBtn = modal.querySelector('.close-button');
  const footerCloseBtn = modal.querySelector('.close-modal-footer-btn');
  
  if (closeBtn) {
    closeBtn.onclick = closeModal;
  }
  if (footerCloseBtn) {
    footerCloseBtn.onclick = closeModal;
  }

  // Add Upload Fix button for NGO users on open issues
  const modalFooter = document.getElementById('modal-footer');
  if (modalFooter && userProfile && userProfile.userType === 'ngo' && !isClosed) {
    modalFooter.style.display = 'flex';
    modalFooter.style.gap = '12px';
    modalFooter.style.justifyContent = 'flex-end';
    modalFooter.innerHTML = `
      <button class="upload-fix-action-btn" style="padding: 12px 24px; background: linear-gradient(135deg, #4CAF79 0%, #3BA890 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.3s ease;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
        </svg>
        Upload Fix
      </button>
    `;
    
    const uploadFixBtn = modalFooter.querySelector('.upload-fix-action-btn');
    if (uploadFixBtn) {
      uploadFixBtn.onclick = () => {
        openFixUploadModal(issue);
      };
      
      uploadFixBtn.onmouseenter = (e) => {
        e.target.style.transform = 'translateY(-2px)';
        e.target.style.boxShadow = '0 4px 12px rgba(76, 175, 121, 0.3)';
      };
      
      uploadFixBtn.onmouseleave = (e) => {
        e.target.style.transform = 'translateY(0)';
        e.target.style.boxShadow = 'none';
      };
    }
  } else if (modalFooter) {
    modalFooter.style.display = 'none';
  }
  
  // Close on background click
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal();
    }
  };
  
  // Prevent modal content clicks from closing
  const modalContentEl = modal.querySelector('.modal-content');
  if (modalContentEl) {
    modalContentEl.onclick = (e) => {
      e.stopPropagation();
    };
  }
  
  // Show modal with animation - handle conflicting CSS
  console.log('About to show modal'); // Debug log
  modal.style.display = 'flex';
  modal.style.opacity = '1';
  modal.style.pointerEvents = 'auto';
  modal.classList.add('open');
  
  // Force a repaint
  modal.offsetHeight;
  
  console.log('Modal classes:', modal.classList.toString()); // Debug log
  console.log('Modal style.display:', modal.style.display); // Debug log
  console.log('Modal style.opacity:', modal.style.opacity); // Debug log
  console.log('Modal should now be visible'); // Debug log
}

// Helper functions for feed modal
function getFeedSeverityColor(severity) {
  if (!severity) return '#ccc';
  const sev = severity.toLowerCase();
  if (sev === "high") return "#d32f2f";
  if (sev === "medium") return "#f57c00";
  return "#388e3c";
}

function getFeedIssueDisplayName(type) {
  if (!type) return "Unknown Issue";
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Helper functions for fix outcomes
function getFeedOutcomeText(outcome) {
  switch(outcome) {
    case 'closed': return '✅ Fully Resolved';
    case 'partially_closed': return '⚠️ Partially Resolved';
    case 'rejected': return '❌ Rejected';
    case 'needs_manual_review': return '⏳ Manual Review Required';
    default: return '✅ Resolved';
  }
}

function getFeedFixStatusColor(fixed) {
  switch(fixed) {
    case 'yes': return '#4CAF79';
    case 'partial': return '#FF9800';
    case 'no': return '#F44336';
    default: return '#ccc';
  }
}

function getFeedFixStatusText(fixed) {
  switch(fixed) {
    case 'yes': return 'FIXED';
    case 'partial': return 'PARTIAL';
    case 'no': return 'NOT FIXED';
    default: return 'UNKNOWN';
  }
}

// Fetch fix details for feed modal
async function fetchFixDetailsForFeed(issueId, container, co2Element) {
  container.innerHTML = '<div class="loading-spinner" style="display: block;"></div>';

  try {
    const idToken = await getIdToken(currentUser, true);
    const response = await fetch(`${API_BASE}/api/issues/${issueId}/fix-details`, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch fix details: ${response.statusText}`);
    }

    const fixDetails = await response.json();

    if (!fixDetails.has_fix) {
      container.innerHTML = '<p class="error-text">Fix information not available.</p>';
      return;
    }

    if (fixDetails.co2_saved && co2Element) {
        co2Element.textContent = `${Math.round(fixDetails.co2_saved)} kg`;
        co2Element.style.color = '#4CAF79';
    }

    let fixHtml = '';

    if (fixDetails.title) {
      fixHtml += `<div class="fix-title-section"><h3>${fixDetails.title}</h3></div>`;
    }

    if (fixDetails.description) {
        fixHtml += `
            <div class="fix-description-section">
                <h4>Fix Description</h4>
                <p>${fixDetails.description}</p>
            </div>
        `;
    }

    // Fix metadata (Fixed By and Fixed On)
    if (fixDetails.ngo_name || fixDetails.submitted_at) {
      fixHtml += `<div class="fix-metadata-section" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0;">`;
      
      if (fixDetails.ngo_name) {
        fixHtml += `
          <div class="fix-meta-card" style="background: rgba(76, 175, 121, 0.1); padding: 12px; border-radius: 8px; border-left: 3px solid #4CAF79;">
            <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #666; font-weight: 600;">Fixed By</h4>
            <div style="display: flex; align-items: center; gap: 8px;">
              ${fixDetails.ngo_logo ? `<img src="${fixDetails.ngo_logo}" alt="NGO Logo" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">` : ''}
              <div>
                <p style="margin: 0; font-weight: 600; color: #1F2937;">${fixDetails.ngo_name}</p>
                <span style="background: #4CAF79; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">NGO</span>
              </div>
            </div>
          </div>
        `;
      }
      
      if (fixDetails.submitted_at) {
        fixHtml += `
          <div class="fix-meta-card" style="background: rgba(99, 102, 241, 0.1); padding: 12px; border-radius: 8px; border-left: 3px solid #6366F1;">
            <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #666; font-weight: 600;">Fixed On</h4>
            <p style="margin: 0; font-weight: 600; color: #1F2937;">${new Date(fixDetails.submitted_at).toLocaleDateString()}</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">${new Date(fixDetails.submitted_at).toLocaleTimeString()}</p>
          </div>
        `;
      }
      
      fixHtml += `</div>`;
    }

    // Fix Photos Slider
    if (fixDetails.photo_urls && fixDetails.photo_urls.length > 0) {
      fixHtml += `
        <div class="fix-images-section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h4 style="margin: 0;">Fix Photos</h4>
            ${fixDetails.photo_urls.length > 1 ? `
              <span style="background: rgba(76, 175, 121, 0.1); color: #4CAF79; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600;">
                📷 ${fixDetails.photo_urls.length} photos
              </span>
            ` : ''}
          </div>
          <div class="fix-image-slider" style="position: relative; border-radius: 12px; overflow: hidden;">
            <img id="feed-fix-slider-image" src="${fixDetails.photo_urls[0]}" alt="Fix Photo" style="width: 100%; height: 400px; object-fit: cover; border-radius: 12px;">
            ${fixDetails.photo_urls.length > 1 ? `
              <button class="slider-nav slider-prev" onclick="feedChangeFeedFixImage(-1)" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.6); color: white; border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px;">‹</button>
              <button class="slider-nav slider-next" onclick="feedChangeFeedFixImage(1)" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.6); color: white; border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px;">›</button>
              <div class="slider-counter" style="position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: 6px 14px; border-radius: 16px; font-size: 13px; font-weight: 600;">
                <span id="feed-fix-slider-current">1</span> / ${fixDetails.photo_urls.length}
              </div>
              <div class="slider-dots" style="position: absolute; bottom: 48px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px;">
                ${fixDetails.photo_urls.map((_, idx) => `
                  <div class="slider-dot" data-index="${idx}" style="width: 8px; height: 8px; border-radius: 50%; background: ${idx === 0 ? 'white' : 'rgba(255,255,255,0.5)'}; cursor: pointer;" onclick="feedSetFeedFixImage(${idx})"></div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `;
      
      // Store fix images globally for slider
      window.feedFixImages = fixDetails.photo_urls;
      window.feedCurrentFixImageIndex = 0;
    }

    if (fixDetails.created_at) {
        const fixDate = new Date(fixDetails.created_at);
        fixHtml += `
            <div class="fix-date-section">
                <p><i class="fas fa-calendar" style="margin-right: 6px;"></i>Fixed on ${fixDate.toLocaleString()}</p>
            </div>
        `;
    }

    // Add comprehensive fix outcomes like mobile app
    if (fixDetails.fix_outcomes && fixDetails.fix_outcomes.length > 0) {
      fixHtml += `
        <div class="fix-outcomes-section" style="margin-bottom: 20px;">
          <h4>Fix Outcome</h4>
          <div class="outcome-overall-card" style="background: rgba(255, 255, 255, 0.8); border-radius: 12px; padding: 16px; margin-bottom: 16px; border-left: 4px solid #4CAF79;">
            <p style="margin: 0 0 8px 0;"><strong>Overall Outcome:</strong> ${getFeedOutcomeText(fixDetails.overall_outcome || 'closed')}</p>
            ${fixDetails.success_rate ? `<p style="margin: 0 0 8px 0;"><strong>Success Rate:</strong> ${Math.round(fixDetails.success_rate * 100)}%</p>` : ''}
            ${fixDetails.co2_saved > 0 ? `<p style="margin: 0; color: #4CAF79; font-weight: 600;"><strong>CO₂ Saved:</strong> ${Math.round(fixDetails.co2_saved)} kg</p>` : ''}
          </div>
          <h4 style="margin-top: 16px; margin-bottom: 12px;">Per-Issue Results</h4>
          ${fixDetails.fix_outcomes.map((outcome, index) => `
            <div class="per-issue-card" style="background: rgba(255, 255, 255, 0.7); border-radius: 12px; padding: 14px; margin-bottom: 12px; border-left: 4px solid #4285f4;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-size: 15px; font-weight: 700; color: #333; flex: 1;">${getFeedIssueDisplayName(outcome.issue_type)}</span>
                <span style="padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; color: #fff; background-color: ${getFeedFixStatusColor(outcome.fixed)};">
                  ${getFeedFixStatusText(outcome.fixed)}
                </span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 13px; color: #666; font-weight: 500;">Fix Confidence:</span>
                <span style="font-size: 13px; color: #333; font-weight: 600;">${Math.round(outcome.confidence * 100)}%</span>
              </div>
              ${outcome.notes ? `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0, 0, 0, 0.1);">
                  <p style="font-size: 13px; font-weight: 600; color: #333; margin-bottom: 4px;">Notes:</p>
                  <p style="font-size: 13px; color: #555; line-height: 18px; margin: 0;">${outcome.notes}</p>
                </div>
              ` : ''}
              ${outcome.evidence_photos && outcome.evidence_photos.length > 0 ? `
                <div style="margin-top: 8px;">
                  <p style="font-size: 12px; color: #666; font-style: italic; margin: 0;">Evidence Photos: ${outcome.evidence_photos.map(photoNum => `Photo #${photoNum + 1}`).join(', ')}</p>
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }

    container.innerHTML = fixHtml;

  } catch (error) {
    console.error('Error fetching fix details:', error);
    container.innerHTML = '<p class="error-text">Could not load fix details. Please try again later.</p>';
  }
}// Close modal
window.closeModal = function() {
    const modal = document.getElementById('issue-modal');
    if (modal) {
        modal.classList.remove('open');
        modal.style.opacity = '0';
        modal.style.pointerEvents = 'none';
        setTimeout(() => {
            if (!modal.classList.contains('open')) {
                modal.style.display = 'none';
            }
        }, 300);
    }
};

// Update filter summary
function updateFilterSummary() {
    const summary = document.getElementById('filter-summary');
    if (summary) {
        const filteredIssues = getFilteredIssues();
        let summaryText = `${filteredIssues.length} issues`;

        // Add active filter details
        const activeFilters = [];

        if (filters.status !== 'all') {
            activeFilters.push(`${filters.status}`);
        }

        if (filters.severity !== 'all') {
            activeFilters.push(`${filters.severity} severity`);
        }

        if (filters.issueTypes.length > 0) {
            activeFilters.push(`${filters.issueTypes.length} type(s)`);
        }

        if (filters.radiusKm !== 5) {
            activeFilters.push(`${filters.radiusKm}km radius`);
        }

        if (filters.days !== 30) {
            activeFilters.push(`${filters.days} days`);
        }

        if (filters.myIssues === 'true') {
            activeFilters.push('my issues only');
        }

        if (activeFilters.length > 0) {
            summaryText += ` • ${activeFilters.join(' • ')}`;
        }

        summary.textContent = summaryText;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Filter pills
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            filters.status = pill.dataset.filter;
            fetchIssues(true); // Trigger new API call with filters
            updateFilterSummary();
        });
    });
    
    // Advanced filter button (if exists)
    const filterBtn = document.getElementById('advanced-filter-btn');
    if (filterBtn) {
        console.log('Advanced filter button found, adding event listener'); // Debug log
        filterBtn.addEventListener('click', showFilterModal);
        // Also add a test click handler
        filterBtn.addEventListener('click', () => {
            console.log('Filter button clicked!'); // Debug log
        });
    } else {
        console.log('Advanced filter button NOT found'); // Debug log
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => fetchIssues(true));
    }
}

// Show advanced filter modal (rewritten to match mobile app)
function showFilterModal() {
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
                                            <input type="checkbox" value="DRAIN_BLOCKAGE"> Drain Blockage
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="FALLEN_TREE"> Fallen Tree
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="FLOODING_SURFACE"> Surface Flooding
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="GRAFFITI_VANDALISM"> Graffiti Vandalism
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="GREENSPACE_MAINTENANCE"> Greenspace Maintenance
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="ILLEGAL_CONSTRUCTION_DEBRIS"> Illegal Construction Debris
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="MANHOLE_MISSING_OR_DAMAGED"> Manhole Missing/Damaged
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="POWER_POLE_LINE_DAMAGE"> Power Pole/Line Damage
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="PUBLIC_INFRASTRUCTURE_DAMAGED"> Public Infrastructure Damaged
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="PUBLIC_TOILET_UNSANITARY"> Public Toilet Unsanitary
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="ROAD_POTHOLE"> Road Pothole
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="SIDEWALK_DAMAGE"> Sidewalk Damage
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="SMALL_FIRE_HAZARD"> Small Fire Hazard
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="STRAY_ANIMALS"> Stray Animals
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="STREETLIGHT_OUTAGE"> Streetlight Outage
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="TRAFFIC_OBSTRUCTION"> Traffic Obstruction
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="TRAFFIC_SIGN_DAMAGE"> Traffic Sign Damage
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="WASTE_BULKY_DUMP"> Waste Bulky Dump
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="WASTE_LITTER_SMALL"> Waste Litter Small
                                        </label>
                                        <label class="multiselect-option">
                                            <input type="checkbox" value="WATER_LEAK_SURFACE"> Water Leak Surface
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
                    <button type="button" class="filter-reset-btn" onclick="resetFilters()">Reset</button>
                    <button type="button" class="filter-apply-btn" onclick="applyFilters()">Apply Filters</button>
                </div>
            </div>
        </div>
    `;

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    console.log('✅ Modal HTML added to page');
    
    // Set up event listeners for filter options
    setupFilterEventListeners();
    
    // Set current filter values
    updateFilterDisplay();
    
    // Show modal with animation
    setTimeout(() => {
        const modal = document.getElementById('filter-modal');
        if (modal) {
            modal.classList.add('show');
            console.log('✅ Modal displayed');
        }
    }, 10);
}

// Add CSS styles for filter modal
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
function setupFilterEventListeners() {
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
function updateFilterDisplay() {
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
    
    // Set issue types checkboxes
    filters.issueTypes.forEach(type => {
        const checkbox = document.querySelector(`input[value="${type}"]`);
        if (checkbox) checkbox.checked = true;
    });
    
    updateIssueTypesDisplay();
}

// Toggle issue types dropdown
function toggleIssueTypes() {
    const dropdown = document.getElementById('issue-types-dropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
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
function updateIssueTypesDisplay() {
    const checkboxes = document.querySelectorAll('#issue-types-options input[type="checkbox"]:checked');
    const display = document.getElementById('issue-types-text');
    
    if (checkboxes.length === 0) {
        display.textContent = 'Select issue types...';
    } else {
        const types = Array.from(checkboxes).map(cb => cb.parentElement.textContent.trim());
        display.textContent = `${types.length} type${types.length > 1 ? 's' : ''} selected`;
    }
}

// Listen for issue type changes
document.addEventListener('change', (e) => {
    if (e.target.matches('#issue-types-options input[type="checkbox"]')) {
        updateIssueTypesDisplay();
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
function resetFilters() {
    filters = {
        status: 'all',
        severity: 'all',
        sortBy: 'severity',
        days: 30,
        radiusKm: 5,
        issueTypes: [],
        limit: 20
    };
    
    updateFilterDisplay();
    console.log('✅ Filters reset to default');
}

// Apply selected filters
function applyFilters() {
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

    // Get selected issue types
    const selectedTypes = Array.from(document.querySelectorAll('#issue-types-options input[type="checkbox"]:checked'))
        .map(cb => cb.value);
    filters.issueTypes = selectedTypes;

    console.log('🎯 Applied filters:', filters);
    
    // Close modal and fetch issues with new filters
    closeFilterModal();
    
    // Reset pagination and fetch new results
    allIssues = [];
    currentPage = 1;
    hasMore = true;
    fetchIssues(true);
    
    // Update filter summary
    updateFilterSummary();
    
    showToast('✅ Filters applied successfully!');
}

// Make functions global for onclick handlers
window.closeFilterModal = closeFilterModal;
window.resetFilters = resetFilters;
window.applyFilters = applyFilters;
window.toggleIssueTypes = toggleIssueTypes;
window.filterIssueTypes = filterIssueTypes;

// Fix Upload Modal Functions
let currentFixIssue = null;
let fixPhotos = [];

function openFixUploadModal(issue) {
  currentFixIssue = issue;
  fixPhotos = [];
  
  const modal = document.getElementById('fix-upload-modal');
  const preview = document.getElementById('fix-photos-preview');
  const description = document.getElementById('fix-description-input');
  const submitBtn = document.getElementById('fix-submit-btn');
  
  // Reset form
  preview.innerHTML = '';
  description.value = '';
  submitBtn.disabled = true;
  
  // Show modal
  modal.classList.add('open');
  
  // Setup file upload handlers
  setupFixUploadHandlers();
}

function closeFixUploadModal() {
  const modal = document.getElementById('fix-upload-modal');
  modal.classList.remove('open');
  currentFixIssue = null;
  fixPhotos = [];
}

function setupFixUploadHandlers() {
  const fileInput = document.getElementById('fix-photo-input');
  const cameraInput = document.getElementById('fix-camera-input');
  const fileUploadBtn = document.getElementById('file-upload-btn');
  const cameraUploadBtn = document.getElementById('camera-upload-btn');
  const uploadArea = document.getElementById('fix-photos-upload');
  const description = document.getElementById('fix-description-input');
  const submitBtn = document.getElementById('fix-submit-btn');
  
  // File upload button
  fileUploadBtn.onclick = () => fileInput.click();
  
  // Camera button
  cameraUploadBtn.onclick = () => cameraInput.click();
  
  // File input change
  fileInput.onchange = (e) => handleFixPhotoSelect(e.target.files);
  cameraInput.onchange = (e) => handleFixPhotoSelect(e.target.files);
  
  // Drag and drop
  uploadArea.ondragover = (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  };
  
  uploadArea.ondragleave = () => {
    uploadArea.classList.remove('drag-over');
  };
  
  uploadArea.ondrop = (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    handleFixPhotoSelect(e.dataTransfer.files);
  };
  
  // Description change
  description.oninput = validateFixForm;
  
  // Submit button
  submitBtn.onclick = submitFix;
}

function handleFixPhotoSelect(files) {
  const maxPhotos = 5;
  const remainingSlots = maxPhotos - fixPhotos.length;
  
  if (remainingSlots <= 0) {
    showToast('Maximum 5 photos allowed', 'error');
    return;
  }
  
  const filesToAdd = Array.from(files).slice(0, remainingSlots);
  
  filesToAdd.forEach(file => {
    if (!file.type.startsWith('image/')) {
      showToast('Only image files are allowed', 'error');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      fixPhotos.push({
        file: file,
        url: e.target.result
      });
      renderFixPhotos();
      validateFixForm();
    };
    reader.readAsDataURL(file);
  });
}

function renderFixPhotos() {
  const preview = document.getElementById('fix-photos-preview');
  preview.innerHTML = fixPhotos.map((photo, index) => `
    <div class="fix-photo-item">
      <img src="${photo.url}" alt="Fix photo ${index + 1}">
      <button class="fix-photo-remove" onclick="removeFixPhoto(${index})">&times;</button>
    </div>
  `).join('');
}

function removeFixPhoto(index) {
  fixPhotos.splice(index, 1);
  renderFixPhotos();
  validateFixForm();
}

function validateFixForm() {
  const description = document.getElementById('fix-description-input');
  const submitBtn = document.getElementById('fix-submit-btn');
  
  const isValid = fixPhotos.length > 0 && description.value.trim().length > 0;
  submitBtn.disabled = !isValid;
}

async function submitFix() {
  if (!currentFixIssue || fixPhotos.length === 0) {
    showToast('Please add at least one photo', 'error');
    return;
  }
  
  const description = document.getElementById('fix-description-input').value.trim();
  if (!description) {
    showToast('Please provide a description', 'error');
    return;
  }
  
  // Show progress modal
  const progressModal = document.getElementById('upload-progress-modal');
  const progressText = document.getElementById('upload-progress-text');
  const progressSubtext = document.getElementById('upload-progress-subtext');
  
  progressModal.classList.add('open');
  progressText.textContent = 'Uploading fix...';
  progressSubtext.textContent = 'Preparing images';
  
  try {
    const idToken = await getIdToken(currentUser, true);
    const formData = new FormData();
    
    // Add photos
    progressSubtext.textContent = `Uploading ${fixPhotos.length} photo(s)`;
    fixPhotos.forEach((photo, index) => {
      formData.append('files', photo.file);
    });

    // Add description
    formData.append('description', description);

    progressSubtext.textContent = 'Submitting fix...';

    const response = await fetch(`${API_BASE}/issues/${currentFixIssue.issue_id}/submit-fix`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`
      },
      body: formData
    });
    
    progressModal.classList.remove('open');
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to submit fix');
    }
    
    const result = await response.json();
    
    // Close upload modal and progress
    closeFixUploadModal();
    
    // Show detailed verification results in modal
    showFixResultModal(result);
    
    // Refresh issues
    fetchIssues(true);
    
  } catch (error) {
    progressModal.classList.remove('open');
    console.error('Error submitting fix:', error);
    showToast(`❌ ${error.message}`, 'error');
  }
}

// Make fix upload functions global
window.openFixUploadModal = openFixUploadModal;
window.closeFixUploadModal = closeFixUploadModal;
window.removeFixPhoto = removeFixPhoto;

// Feed fix image slider functions
window.feedChangeFeedFixImage = function(direction) {
  if (!window.feedFixImages || window.feedFixImages.length === 0) return;
  
  window.feedCurrentFixImageIndex = (window.feedCurrentFixImageIndex + direction + window.feedFixImages.length) % window.feedFixImages.length;
  
  const img = document.getElementById('feed-fix-slider-image');
  const counter = document.getElementById('feed-fix-slider-current');
  const dots = document.querySelectorAll('.slider-dot');
  
  if (img) img.src = window.feedFixImages[window.feedCurrentFixImageIndex];
  if (counter) counter.textContent = window.feedCurrentFixImageIndex + 1;
  
  dots.forEach((dot, idx) => {
    dot.style.background = idx === window.feedCurrentFixImageIndex ? 'white' : 'rgba(255,255,255,0.5)';
  });
};

window.feedSetFeedFixImage = function(index) {
  if (!window.feedFixImages || window.feedFixImages.length === 0) return;
  
  window.feedCurrentFixImageIndex = index;
  
  const img = document.getElementById('feed-fix-slider-image');
  const counter = document.getElementById('feed-fix-slider-current');
  const dots = document.querySelectorAll('.slider-dot');
  
  if (img) img.src = window.feedFixImages[window.feedCurrentFixImageIndex];
  if (counter) counter.textContent = window.feedCurrentFixImageIndex + 1;
  
  dots.forEach((dot, idx) => {
    dot.style.background = idx === window.feedCurrentFixImageIndex ? 'white' : 'rgba(255,255,255,0.5)';
  });
};

// Fix Result Modal Functions
function showFixResultModal(result) {
  const modal = document.getElementById('fix-result-modal');
  const content = document.getElementById('fix-result-content');
  
  if (!modal || !content) return;
  
  let outcomeMessage = '';
  let outcomeIcon = '';
  let outcomeColor = '';
  let outcomeBackground = '';
  
  if (result.overall_outcome === 'closed') {
    outcomeIcon = '✅';
    outcomeMessage = 'Fix Verified - Issue Fully Resolved!';
    outcomeColor = '#4CAF79';
    outcomeBackground = 'rgba(76, 175, 121, 0.1)';
  } else if (result.overall_outcome === 'partially_closed') {
    outcomeIcon = '⚠️';
    outcomeMessage = 'Fix Submitted - Issue Partially Resolved';
    outcomeColor = '#FF9800';
    outcomeBackground = 'rgba(255, 152, 0, 0.1)';
  } else if (result.overall_outcome === 'rejected') {
    outcomeIcon = '❌';
    outcomeMessage = 'Fix Rejected - Issue Not Adequately Addressed';
    outcomeColor = '#F44336';
    outcomeBackground = 'rgba(244, 67, 54, 0.1)';
  } else {
    outcomeIcon = '✅';
    outcomeMessage = 'Fix Submitted Successfully!';
    outcomeColor = '#4CAF79';
    outcomeBackground = 'rgba(76, 175, 121, 0.1)';
  }
  
  let html = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 64px; margin-bottom: 16px;">${outcomeIcon}</div>
      <h2 style="margin: 0 0 8px 0; color: ${outcomeColor};">${outcomeMessage}</h2>
    </div>
    
    <div style="background: ${outcomeBackground}; border-left: 4px solid ${outcomeColor}; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
  `;
  
  if (result.success_rate !== undefined) {
    html += `
      <div>
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #666; font-weight: 600;">Success Rate</p>
        <p style="margin: 0; font-size: 24px; font-weight: 700; color: ${outcomeColor};">${Math.round(result.success_rate * 100)}%</p>
      </div>
    `;
  }
  
  if (result.co2_saved !== undefined && result.co2_saved > 0) {
    html += `
      <div>
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #666; font-weight: 600;">CO₂ Saved</p>
        <p style="margin: 0; font-size: 24px; font-weight: 700; color: ${outcomeColor};">${Math.round(result.co2_saved)} kg</p>
      </div>
    `;
  }
  
  html += `
      </div>
    </div>
  `;
  
  // Show per-issue results if available
  if (result.per_issue_results && result.per_issue_results.length > 0) {
    html += `
      <div style="margin-top: 24px;">
        <h3 style="margin: 0 0 16px 0; font-size: 18px;">Detailed Verification Results</h3>
    `;
    
    result.per_issue_results.forEach((issue, index) => {
      const fixStatusColor = issue.fixed === 'yes' ? '#4CAF79' : issue.fixed === 'partial' ? '#FF9800' : '#F44336';
      const fixStatusText = issue.fixed === 'yes' ? 'FIXED' : issue.fixed === 'partial' ? 'PARTIAL' : 'NOT FIXED';
      
      html += `
        <div style="background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-weight: 700; font-size: 15px;">${getFeedIssueDisplayName(issue.issue_type)}</span>
            <span style="background: ${fixStatusColor}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 700;">${fixStatusText}</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px;">
            <div>
              <span style="font-size: 13px; color: #666;">Fix Confidence:</span>
              <span style="font-size: 13px; font-weight: 600; margin-left: 8px;">${Math.round(issue.confidence * 100)}%</span>
            </div>
            <div>
              <span style="font-size: 13px; color: #666;">Original Confidence:</span>
              <span style="font-size: 13px; font-weight: 600; margin-left: 8px;">${Math.round(issue.original_confidence * 100)}%</span>
            </div>
          </div>
          ${issue.notes ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e0e0e0;">
              <p style="font-size: 13px; color: #666; margin: 0 0 4px 0; font-weight: 600;">Notes:</p>
              <p style="font-size: 13px; color: #333; margin: 0; line-height: 1.5;">${issue.notes}</p>
            </div>
          ` : ''}
        </div>
      `;
    });
    
    html += `</div>`;
  }
  
  // Action buttons
  html += `
    <div style="margin-top: 32px; display: flex; gap: 12px; justify-content: center;">
  `;
  
  if (result.overall_outcome === 'rejected') {
    html += `
      <button onclick="retryFixUpload()" style="flex: 1; padding: 14px 24px; background: ${outcomeColor}; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px;">
        Try Again
      </button>
    `;
  }
  
  html += `
      <button onclick="closeFixResultModal(); closeModal();" style="flex: 1; padding: 14px 24px; background: #6c757d; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px;">
        ${result.overall_outcome === 'rejected' ? 'Cancel' : 'Close'}
      </button>
    </div>
  `;
  
  content.innerHTML = html;
  
  // Show modal
  modal.style.display = 'flex';
  modal.style.opacity = '1';
  modal.style.pointerEvents = 'auto';
  modal.classList.add('open');
}

function closeFixResultModal() {
  const modal = document.getElementById('fix-result-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.opacity = '0';
    modal.style.pointerEvents = 'none';
    setTimeout(() => {
      if (!modal.classList.contains('open')) {
        modal.style.display = 'none';
      }
    }, 300);
  }
}

function retryFixUpload() {
  closeFixResultModal();
  // Re-open the fix upload modal with the same issue
  if (currentFixIssue) {
    openFixUploadModal(currentFixIssue);
  }
}

// Make functions global
window.closeFixResultModal = closeFixResultModal;
window.retryFixUpload = retryFixUpload;

export { fetchIssues, filters };
