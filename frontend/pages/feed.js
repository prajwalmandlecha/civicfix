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
                    <span class="issue-type">${issueTypes.join(', ').replace(/_/g, ' ')}</span>
                    <span class="severity-badge" style="background: ${severityColor};">
                        ${severityLabel} (${severityScore.toFixed(1)})
                    </span>
                </div>
                <div class="issue-meta">
                    <span class="issue-distance">📍 ${distance}</span>
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

// Open issue detail modal
function openIssueModal(issue) {
    const modal = document.getElementById('issue-modal');
    const modalBody = document.getElementById('modal-body');
    
    if (!modal || !modalBody) return;
    
    const isClosed = issue.status?.toLowerCase() === 'closed';
    const upvoteCount = isClosed ? (issue.upvotes?.closed || 0) : (issue.upvotes?.open || 0);
    const reportCount = isClosed ? (issue.reports?.closed || 0) : (issue.reports?.open || 0);
    
    modalBody.innerHTML = `
        <img src="${issue.photo_url || 'placeholder.png'}" alt="Issue" class="modal-image">
        <h2>${(issue.issue_types || ['Unknown']).join(' + ')}</h2>
        <div class="modal-meta">
            <span>📍 ${issue.distance_km ? issue.distance_km.toFixed(1) + 'km away' : 'Unknown location'}</span>
            <span>📅 ${new Date(issue.created_at).toLocaleDateString()}</span>
        </div>
        <p class="modal-description">${issue.description || 'No description available'}</p>
        <div class="modal-stats">
            <div class="stat-item">
                <strong>Severity:</strong> ${(issue.severity_score || 0).toFixed(1)}/10
            </div>
            <div class="stat-item">
                <strong>Upvotes:</strong> ${upvoteCount}
            </div>
            <div class="stat-item">
                <strong>Reports:</strong> ${reportCount}
            </div>
            <div class="stat-item">
                <strong>CO₂ Risk:</strong> ${(issue.fate_risk_co2 || 0).toFixed(1)} kg
            </div>
        </div>
        ${issue.detected_issues && issue.detected_issues.length > 0 ? `
            <div class="detected-issues">
                <h3>AI Detected Issues:</h3>
                ${issue.detected_issues.map(d => `
                    <div class="detected-issue-item">
                        <strong>${d.type || 'Unknown'}</strong> 
                        (Score: ${(d.severity_score || 0).toFixed(1)}, 
                        Confidence: ${((d.confidence || 0) * 100).toFixed(0)}%)
                        <p>${d.future_impact || ''}</p>
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;
    
    modal.classList.add('open');
}

// Close modal
window.closeModal = function() {
    const modal = document.getElementById('issue-modal');
    if (modal) modal.classList.remove('open');
};

// Update filter summary
function updateFilterSummary() {
    const summary = document.getElementById('filter-summary');
    if (summary) {
        let summaryText = `${allIssues.length} issues`;
        
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
    
    // Set myIssues
    const myIssuesBtn = document.querySelector(`[data-filter="myIssues"][data-value="${filters.myIssues}"]`);
    if (myIssuesBtn) {
        myIssuesBtn.parentElement.querySelectorAll('.filter-option').forEach(btn => btn.classList.remove('active'));
        myIssuesBtn.classList.add('active');
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
        limit: 20,
        myIssues: 'all'
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
    
    const myIssuesBtn = document.querySelector('.filter-option[data-filter="myIssues"].active');
    if (myIssuesBtn) filters.myIssues = myIssuesBtn.dataset.value;

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
window.applyFilters = applyFilters;
window.resetFilters = resetFilters;
window.applyFilters = applyFilters;

export { fetchIssues, filters };
