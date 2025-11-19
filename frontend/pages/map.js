import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js'; 
import { auth } from '../firebaseConfig.js'; 
import { onAuthStateChanged, getIdToken } from "firebase/auth";

const API_BASE = 'http://localhost:8000';

// Cache configuration
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CACHE_KEY_PREFIX = 'civicfix_issues_';

let map = null;
let userMarker = null;
let issueMarkers = [];
let currentToken = null;
let userLocation = null;
let currentUser = null;
let userProfile = null;
let cachedIssues = [];
let lastFetchRegion = null;
let filters = {
  status: 'open',
  severity: 'all',
  days: 30,
  issueTypes: [],
  limit: 50
};

// Initialize Google Maps
function initMap() {
  if (map) return;

  // Default to Bangalore if no location
  const defaultLocation = { lat: 12.9716, lng: 77.5946 };

  map = new google.maps.Map(document.getElementById('map'), {
    zoom: 13,
    center: defaultLocation,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    styles: [
      {
        featureType: 'poi',
        elementType: 'labels',
        stylers: [{ visibility: 'off' }]
      }
    ],
    disableDefaultUI: false,
    zoomControl: true,
    streetViewControl: false,
    fullscreenControl: false
  });

  // Add event listener for map region changes (like mobile app's onRegionChangeComplete)
  let moveTimeout = null;

  const debouncedFetchOnMove = () => {
    if (moveTimeout) {
      clearTimeout(moveTimeout);
    }
    
    moveTimeout = setTimeout(async () => {
      const center = map.getCenter();
      const bounds = map.getBounds();
      
      if (!bounds) return;
      
      const region = {
        latitude: center.lat(),
        longitude: center.lng(),
        latitudeDelta: bounds.getNorthEast().lat() - bounds.getSouthWest().lat(),
        longitudeDelta: bounds.getNorthEast().lng() - bounds.getSouthWest().lng()
      };
      
      // Check if we moved significantly (like mobile app)
      if (lastFetchRegion) {
        const latDiff = Math.abs(region.latitude - lastFetchRegion.latitude);
        const lngDiff = Math.abs(region.longitude - lastFetchRegion.longitude);
        
        // Don't fetch if movement is too small
        if (latDiff < 0.001 && lngDiff < 0.001) {
          return;
        }
      }
      
      lastFetchRegion = region;
      
      console.log(`🗺️ Map moved to: ${region.latitude.toFixed(4)}, ${region.longitude.toFixed(4)}`);
      
      // Fetch issues for new region
      await fetchIssuesInRegion(region);
    }, 500); // 500ms debounce
  };

  // Listen for map movements (like mobile app's onRegionChangeComplete)
  map.addListener('dragend', debouncedFetchOnMove);
  map.addListener('zoom_changed', debouncedFetchOnMove);
  map.addListener('bounds_changed', debouncedFetchOnMove);

  // Initialize location
  setUserLocation();
}

// Set user location like mobile app
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
    await fetchIssuesInRegion({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      latitudeDelta: 0.01, // ~1km
      longitudeDelta: 0.01
    });
    showLoading(false);
    return;
  }
  
  // Fallback to browser geolocation
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
      
      await fetchIssuesInRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01
      });
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
  if (!userLocation || !map) return;
  
  // Remove existing user marker
  if (userMarker) {
    userMarker.setMap(null);
  }
      
  // Create user location marker (blue dot like mobile app)
  userMarker = new google.maps.Marker({
    position: { lat: userLocation.latitude, lng: userLocation.longitude },
    map: map,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: '#4285F4',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2
    },
    title: 'Your Location'
  });
  
  // Center map on user location
  map.panTo({ lat: userLocation.latitude, lng: userLocation.longitude });
  map.setZoom(13);
}

// Cache helper functions (updated for region-based caching)
function getRegionCacheKey(region, filters) {
  const regionKey = `${region.latitude.toFixed(3)}_${region.longitude.toFixed(3)}_${region.latitudeDelta.toFixed(3)}_${region.longitudeDelta.toFixed(3)}`;
  const filterKey = `${filters.status}_${filters.days}_${filters.limit}`;
  return `${CACHE_KEY_PREFIX}${regionKey}_${filterKey}`;
}

function getCachedIssues(region, filters) {
  try {
    const cacheKey = getRegionCacheKey(region, filters);
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    
    const data = JSON.parse(cached);
    const now = Date.now();
    
    if (now - data.timestamp > CACHE_DURATION) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    console.log(`📦 Using cached issues (${data.issues.length} items, ${Math.round((now - data.timestamp) / (1000 * 60))} minutes old)`);
    return data.issues;
  } catch (error) {
    console.error('Error reading cache:', error);
    return null;
  }
}

function setCachedIssues(region, filters, issues) {
  try {
    const cacheKey = getRegionCacheKey(region, filters);
    const data = {
      timestamp: Date.now(),
      issues: issues,
      region: region,
      filters: { ...filters }
    };
    localStorage.setItem(cacheKey, JSON.stringify(data));
    console.log(`💾 Cached ${issues.length} issues for region ${region.latitude.toFixed(3)}, ${region.longitude.toFixed(3)}`);
  } catch (error) {
    console.error('Error saving to cache:', error);
  }
}

function clearOldCache() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        const cached = localStorage.getItem(key);
        if (cached) {
          const data = JSON.parse(cached);
          if (Date.now() - data.timestamp > CACHE_DURATION) {
            keysToRemove.push(key);
          }
        }
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    if (keysToRemove.length > 0) {
      console.log(`🧹 Cleaned up ${keysToRemove.length} expired cache entries`);
    }
  } catch (error) {
    console.error('Error cleaning cache:', error);
  }
}

// Fetch issues in region (like mobile app's LocationScreen)
async function fetchIssuesInRegion(region, forceRefresh = false) {
  if (!map) {
    showNoLocationState();
    return;
  }

  clearOldCache();

  // Try to get cached issues first (unless force refresh)
  if (!forceRefresh) {
    const cached = getCachedIssues(region, filters);
    if (cached) {
      cachedIssues = cached;
      displayIssuesOnMap(cached);
      return;
    }
  }

  showLoading(true);
  
  try {
    // Calculate radius from region bounds (like mobile app)
    const radiusKm = Math.max(
      region.latitudeDelta * 111, // Convert lat degrees to km
      region.longitudeDelta * 111 * Math.cos(region.latitude * Math.PI / 180)
    ) / 2; // Radius from center to edge

    const params = new URLSearchParams({
      latitude: region.latitude.toString(),
      longitude: region.longitude.toString(),
      radius_km: Math.min(radiusKm, 50).toString(), // Cap at 50km
      limit: filters.limit.toString(),
      days_back: filters.days.toString()
    });

    if (filters.status && filters.status !== 'all') {
      params.append('status', filters.status);
    }

    const requestUrl = `${API_BASE}/api/issues/with-user-status?${params}`;
    console.log('[MAP] Fetching issues for region:', requestUrl);
    
    const response = await fetch(requestUrl, {
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
    
    console.log(`📍 Received ${issues.length} issues in region`);
    
    // Cache the issues
    cachedIssues = issues;
    setCachedIssues(region, filters, issues);
    
    displayIssuesOnMap(issues);
    showLoading(false);
  } catch (error) {
    console.error('Error fetching issues:', error);
    
    // If there's an error and we have cached data, use it
    if (cachedIssues.length > 0) {
      console.log('📦 Using cached issues due to fetch error');
      displayIssuesOnMap(cachedIssues);
      showToast('Using cached data. Check your connection.', 'warning');
    } else {
      showToast('Failed to load issues. Please try again.', 'error');
    }
    showLoading(false);
  }
}

// Apply client-side filters (for severity and issueTypes)
function getFilteredIssues(issues) {
  let filtered = [...issues];

  // Filter by status
  if (filters.status && filters.status !== 'all') {
    filtered = filtered.filter(issue => (issue.status || 'open').toLowerCase() === filters.status.toLowerCase());
  }

  // Filter by days back
  if (filters.days) {
    const now = Date.now();
    filtered = filtered.filter(issue => {
      const created = new Date(issue.created_at || issue.timestamp || issue.date).getTime();
      return (now - created) <= filters.days * 24 * 60 * 60 * 1000;
    });
  }

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

// Get marker color based on issue status and severity (like mobile app)
function getMarkerColor(issue) {
  if (issue.status?.toLowerCase() === 'closed') {
    return '#4CAF50'; // Green for closed issues
  }
  
  const severityScore = issue.severity_score || 5;
  if (severityScore >= 8) return '#F44336'; // Red for high severity
  if (severityScore >= 4) return '#FF9800'; // Orange for medium severity
  return '#4CAF50'; // Green for low severity
}

// Get display value for marker (like mobile app)
function getMarkerDisplay(issue) {
  if (issue.status?.toLowerCase() === 'closed') {
    return '✓';
  }
  return Math.round(issue.severity_score || 5);
}

// Display issues on map (exactly like mobile app)
function displayIssuesOnMap(issues) {
  // Clear existing issue markers
  issueMarkers.forEach(marker => marker.setMap(null));
  issueMarkers = [];

  // Apply client-side filters
  const filteredIssues = getFilteredIssues(issues);

  // Update filter summary to show filtered count
  const filterSummary = document.getElementById('filter-summary');
  if (filterSummary) {
    filterSummary.textContent = `${filteredIssues.length} issues found`;
  }

  if (filteredIssues.length === 0) {
    showEmptyState();
    return;
  }

  // Hide empty state
  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.style.display = 'none';

  // Create markers for each issue (exactly like mobile app's CustomMarker)
  filteredIssues.forEach(issue => {
    const lat = issue.location?.lat || issue.location?.latitude;
    const lng = issue.location?.lon || issue.location?.longitude;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      console.warn('Issue missing valid coordinates:', issue);
      return;
    }

    const color = getMarkerColor(issue);
    const displayValue = getMarkerDisplay(issue);

    // Create circular marker exactly like mobile app
    const marker = new google.maps.Marker({
      position: { lat, lng },
      map: map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 18,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 3
      },
      label: {
        text: displayValue.toString(),
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: '12px'
      },
      title: issue.title || issue.description?.substring(0, 50) || 'Civic Issue'
    });

    // Add click event to show issue detail (like mobile app)
    marker.addListener('click', () => {
      console.log('Marker clicked for issue:', issue.issue_id || issue.id);
      openIssueModal(issue);
    });

    issueMarkers.push(marker);
  });
}

// Open issue detail modal (exactly like mobile app's IssueDetailModal)
async function openIssueModal(issue) {
  console.log('Opening modal for issue:', issue);
  
  const modal = document.getElementById('issue-modal');
  if (!modal) {
    console.error('Modal element not found');
    return;
  }

  // --- Reset Modal State ---
  document.getElementById('open-issue-details').style.display = 'none';
  document.getElementById('closed-issue-details').style.display = 'none';
  document.getElementById('fix-details-container').innerHTML = '<div class="loading-spinner" style="display: none;"></div>';
  document.getElementById('modal-detected-issues-container').innerHTML = '';
  document.querySelector('.modal-content').style.backgroundColor = '';

  // --- Get Common Elements ---
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

  // --- Location display with reverse geocoding ---
  async function setModalLocation(issue) {
    if (!modalLocation) return;
    if (issue.address) {
      modalLocation.textContent = issue.address;
      return;
    }
    const lat = issue.location?.lat || issue.location?.latitude;
    const lng = issue.location?.lon || issue.location?.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const data = await response.json();
        modalLocation.textContent = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      } catch (error) {
        modalLocation.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
    } else {
      modalLocation.textContent = 'Location not available';
    }
  }

  // --- Populate Common Fields ---
  const imageUrl = issue.photo_url || issue.image_url || '';
  console.log('🖼️ Issue data:', { photo_url: issue.photo_url, image_url: issue.image_url, final: imageUrl });
  
  const mediaContainer = modalImage?.parentElement;
  if (mediaContainer) {
    console.log('📦 Modal media container found');
  }
  
  if (imageUrl && modalImage) {
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
    console.log('⚠️ No image URL found or modalImage element missing');
    if (modalImage) modalImage.style.display = 'none';
    if (mediaContainer) mediaContainer.style.display = 'none';
  }

  await setModalLocation(issue);
  modalDate.textContent = new Date(issue.created_at).toLocaleString();
  modalUploader.textContent = issue.uploader_display_name || 'Anonymous';

  modalStatus.textContent = issue.status || 'N/A';
  modalStatus.className = `stat-value ${(issue.status || 'open').toLowerCase()}`;

  modalSeverity.textContent = `${Math.round(issue.severity_score || 0)}/10`;

  const isClosed = issue.status?.toLowerCase() === 'closed';

  // --- Handle Status-Specific Logic ---
  if (isClosed) {
    // --- CLOSED ISSUE LOGIC ---
    const modalContent = document.querySelector('.modal-content');
    modalContent.style.backgroundColor = '#d4edda'; // Light green
    closedDetailsContainer.style.display = 'block';
    openDetailsContainer.style.display = 'none';
    
    modalCo2Label.textContent = 'CO₂ Saved';
    modalCo2.textContent = `${Math.round(issue.fate_risk_co2 || 0)} kg`; // Initial value
    
    // Fetch and display fix details
    await fetchAndDisplayFixDetails(issue.issue_id, fixDetailsContainer, modalCo2);

  } else {
    // --- OPEN ISSUE LOGIC ---
    const modalContent = document.querySelector('.modal-content');
    const severityScore = issue.severity_score || 0;
    if (severityScore >= 8) modalContent.style.backgroundColor = '#f8d7da'; // Light red
    else if (severityScore >= 4) modalContent.style.backgroundColor = '#fff3cd'; // Light yellow
    else modalContent.style.backgroundColor = '#d1ecf1'; // Light blue

    openDetailsContainer.style.display = 'block';
    closedDetailsContainer.style.display = 'none';

    modalCo2Label.textContent = 'CO₂ Risk';
    modalCo2.textContent = `${Math.round(issue.fate_risk_co2 || 0)} kg`;
    
    // Handle description - only show for open issues
    if (issue.description) {
      modalDescription.textContent = issue.description;
    } else {
      modalDescription.textContent = 'No description provided.';
    }

    // Display detected issues with proper formatting
    const detectedIssues = issue.detected_issues || [];
    if (detectedIssues.length > 0) {
      detectedIssuesContainer.innerHTML = detectedIssues.map(detected => `
        <div class="detected-issue-card" style="border-left-color: ${getSeverityColor(detected.severity)}">
          <div class="detected-issue-header">
            <span class="issue-type-name">${getIssueDisplayName(detected.type)}</span>
            <span class="issue-severity-badge" style="background-color: ${getSeverityColor(detected.severity)}">${detected.severity.toUpperCase()}</span>
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

  // --- Handle Actions ---
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

  // --- Add Close Button Event Listeners ---
  const closeBtn = modal.querySelector('.modal-close');
  
  if (closeBtn) {
    closeBtn.onclick = closeModal;
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
  
  // --- Show Modal ---
  modal.classList.add('open');
  console.log('Modal displayed successfully');
}

// Fetch and display fix details for a closed issue
async function fetchAndDisplayFixDetails(issueId, container, co2Element) {
  const loadingSpinner = container.querySelector('.loading-spinner');
  if (loadingSpinner) {
    loadingSpinner.style.display = 'block';
  }
  container.innerHTML = '<div class="loading-spinner" style="display: block;"></div>';

  try {
    const response = await fetch(`${API_BASE}/api/issues/${issueId}/fix-details`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch fix details: ${response.statusText}`);
    }

    const fixDetails = await response.json();

    if (!fixDetails.has_fix) {
      container.innerHTML = '<p class="error-text">Fix information not available.</p>';
      return;
    }

    // Update CO2 saved if available in fix details
    if (fixDetails.co2_saved && co2Element) {
        co2Element.textContent = `${Math.round(fixDetails.co2_saved)} kg`;
        co2Element.style.color = '#4CAF79';
    }

    let fixHtml = '';

    // Fix Title with checkmark icon
    if (fixDetails.title) {
      fixHtml += `
        <div class="fix-title-section">
          <h3>${fixDetails.title}</h3>
        </div>
      `;
    }

    // Fix Description
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
            <img id="map-fix-slider-image" src="${fixDetails.photo_urls[0]}" alt="Fix Photo" style="width: 100%; height: 400px; object-fit: cover; border-radius: 12px;">
            ${fixDetails.photo_urls.length > 1 ? `
              <button class="slider-nav slider-prev" onclick="mapChangeFixImage(-1)" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.6); color: white; border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px;">‹</button>
              <button class="slider-nav slider-next" onclick="mapChangeFixImage(1)" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.6); color: white; border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px;">›</button>
              <div class="slider-counter" style="position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: 6px 14px; border-radius: 16px; font-size: 13px; font-weight: 600;">
                <span id="map-fix-slider-current">1</span> / ${fixDetails.photo_urls.length}
              </div>
              <div class="slider-dots" style="position: absolute; bottom: 48px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px;">
                ${fixDetails.photo_urls.map((_, idx) => `
                  <div class="slider-dot" data-index="${idx}" style="width: 8px; height: 8px; border-radius: 50%; background: ${idx === 0 ? 'white' : 'rgba(255,255,255,0.5)'}; cursor: pointer;" onclick="mapSetFixImage(${idx})"></div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `;
      
      // Store fix images globally for slider
      window.mapFixImages = fixDetails.photo_urls;
      window.mapCurrentFixImageIndex = 0;
    }

    // Fix Date
    if (fixDetails.created_at) {
        const fixDate = new Date(fixDetails.created_at);
        fixHtml += `
            <div class="fix-date-section">
                <p><i class="fas fa-calendar" style="margin-right: 6px;"></i>Fixed on ${fixDate.toLocaleString()}</p>
            </div>
        `;
    }

    // Fix outcomes if available (comprehensive display like mobile app)
    if (fixDetails.fix_outcomes && fixDetails.fix_outcomes.length > 0) {
      fixHtml += `
        <div class="fix-outcomes-section" style="margin-bottom: 20px;">
          <h4>Fix Outcome</h4>
          <div class="outcome-overall-card" style="background: rgba(255, 255, 255, 0.8); border-radius: 12px; padding: 16px; margin-bottom: 16px; border-left: 4px solid #4CAF79;">
            <p style="margin: 0 0 8px 0;"><strong>Overall Outcome:</strong> ${getOutcomeText(fixDetails.overall_outcome || 'closed')}</p>
            ${fixDetails.success_rate ? `<p style="margin: 0 0 8px 0;"><strong>Success Rate:</strong> ${Math.round(fixDetails.success_rate * 100)}%</p>` : ''}
            ${fixDetails.co2_saved > 0 ? `<p style="margin: 0; color: #4CAF79; font-weight: 600;"><strong>CO₂ Saved:</strong> ${Math.round(fixDetails.co2_saved)} kg</p>` : ''}
          </div>
          <h4 style="margin-top: 16px; margin-bottom: 12px;">Per-Issue Results</h4>
          ${fixDetails.fix_outcomes.map((outcome, index) => `
            <div class="per-issue-card" style="background: rgba(255, 255, 255, 0.7); border-radius: 12px; padding: 14px; margin-bottom: 12px; border-left: 4px solid #4285f4;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-size: 15px; font-weight: 700; color: #333; flex: 1;">${getIssueDisplayName(outcome.issue_type)}</span>
                <span style="padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; color: #fff; background-color: ${getFixStatusColor(outcome.fixed)};">
                  ${getFixStatusText(outcome.fixed)}
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
}

// Helper function to get outcome text
function getOutcomeText(outcome) {
  switch(outcome) {
    case 'closed': return '✅ Fully Resolved';
    case 'partially_closed': return '⚠️ Partially Resolved';
    case 'rejected': return '❌ Rejected';
    case 'needs_manual_review': return '⏳ Manual Review Required';
    default: return '✅ Resolved';
  }
}

// Helper function to get fix status color
function getFixStatusColor(fixed) {
  switch(fixed) {
    case 'yes': return '#4CAF79';
    case 'partial': return '#FF9800';
    case 'no': return '#F44336';
    default: return '#ccc';
  }
}

// Helper function to get fix status text
function getFixStatusText(fixed) {
  switch(fixed) {
    case 'yes': return 'FIXED';
    case 'partial': return 'PARTIAL';
    case 'no': return 'NOT FIXED';
    default: return 'UNKNOWN';
  }
}

// Helper to get a color for severity
function getSeverityColor(severity) {
    if (!severity) return '#ccc';
    const sev = severity.toLowerCase();
    if (sev === "high") return "#d32f2f";
    if (sev === "medium") return "#f57c00";
    return "#388e3c";
}

// Helper to get display name for issue type
function getIssueDisplayName(type) {
    if (!type) return "Unknown Issue";
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Handle vote/report action (like mobile app)
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
  if (modal) {
    modal.classList.remove('open');
    // Reset scroll when closing so next open starts at top
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.scrollTop = 0;
    }
  }
}

// Refresh map
function refreshMap() {
  if (lastFetchRegion) {
    fetchIssuesInRegion(lastFetchRegion, true); // Force refresh from backend
    showToast('Refreshing issues...', 'success');
  } else {
    setUserLocation();
  }
}

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

// Filter functions (rewritten to match mobile app and feed.js)
function openFilterModal() {
    console.log('🔧 Opening filter modal...');
    
    // Add CSS styles if not already present
    addFilterModalStyles();
    
    // Remove existing modal if any
    const existingModal = document.getElementById('filter-modal-map');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal HTML matching mobile app structure
    const modalHTML = `
        <div id="filter-modal-map" class="filter-modal-overlay">
            <div class="filter-modal-container">
                <!-- Header -->
                <div class="filter-header">
                    <h2 class="filter-title">Filters</h2>
                    <button class="filter-close-btn" type="button" onclick="closeMapFilterModal()">
                        <span>&times;</span>
                    </button>
                </div>

                <!-- Content -->
                <div class="filter-content">
                    <!-- Issue Types -->
                    <div class="filter-section">
                        <label class="filter-section-title">Issue Types</label>
                        <div class="filter-dropdown-container">
                            <div class="filter-multiselect" id="issue-types-selector-map">
                                <div class="multiselect-display" onclick="toggleMapIssueTypes()">
                                    <span id="issue-types-text-map">Select issue types...</span>
                                    <span class="dropdown-arrow">▼</span>
                                </div>
                                <div class="multiselect-dropdown" id="issue-types-dropdown-map" style="display: none;">
                                    <div class="multiselect-search">
                                        <input type="text" placeholder="Search..." id="issue-types-search-map" onkeyup="filterMapIssueTypes()">
                                    </div>
                                    <div class="multiselect-options" id="issue-types-options-map">
                                        <!-- Options will be populated dynamically -->
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Status, Severity, Time Range, etc. -->
                    <!-- ... (add other filter sections here) ... -->
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
    populateIssueTypesFilter();

    // Set up event listeners and update display
    setupMapFilterEventListeners();
    updateMapFilterDisplay();

    // Add logic for Apply/Reset buttons
    const applyBtn = document.querySelector('.filter-apply-btn');
    const resetBtn = document.querySelector('.filter-reset-btn');
    if (applyBtn) {
      applyBtn.onclick = function() {
        // Read selected filters from modal and update global filters
        // Example: status, severity, days, issueTypes, limit
        // You may need to add more selectors if you add more filter fields
        const statusSelect = document.getElementById('filter-status');
        const severitySelect = document.getElementById('filter-severity');
        const daysSelect = document.getElementById('filter-days');
        const radiusSelect = document.getElementById('filter-radius');
        // Issue types from custom multiselect
        const selectedIssueTypes = window.getSelectedMapIssueTypes ? window.getSelectedMapIssueTypes() : [];

        filters.status = statusSelect ? statusSelect.value : 'open';
        filters.severity = severitySelect ? severitySelect.value : 'all';
        filters.days = daysSelect ? parseInt(daysSelect.value) : 30;
        filters.limit = radiusSelect ? parseInt(radiusSelect.value) * 5 : 50; // Example: radius * 5
        filters.issueTypes = selectedIssueTypes;

        // Refresh map markers
        if (lastFetchRegion) {
          fetchIssuesInRegion(lastFetchRegion, true);
        } else {
          setUserLocation();
        }
        closeMapFilterModal();
      };
    }
    if (resetBtn) {
      resetBtn.onclick = function() {
        filters.status = 'open';
        filters.severity = 'all';
        filters.days = 30;
        filters.issueTypes = [];
        filters.limit = 50;
        // Reset selects if present
        const statusSelect = document.getElementById('filter-status');
        const severitySelect = document.getElementById('filter-severity');
        const daysSelect = document.getElementById('filter-days');
        const radiusSelect = document.getElementById('filter-radius');
        if (statusSelect) statusSelect.value = 'open';
        if (severitySelect) severitySelect.value = 'all';
        if (daysSelect) daysSelect.value = '30';
        if (radiusSelect) radiusSelect.value = '10';
        // Reset custom issue types multiselect if needed
        if (window.resetMapIssueTypes) window.resetMapIssueTypes();
        // Refresh map markers
        if (lastFetchRegion) {
          fetchIssuesInRegion(lastFetchRegion, true);
        } else {
          setUserLocation();
        }
        closeMapFilterModal();
      };
    }

    // Show modal with animation
    setTimeout(() => {
      const modal = document.getElementById('filter-modal-map');
      if (modal) {
        modal.classList.add('show');
      }
    }, 10);
}

function closeMapFilterModal() {
    const modal = document.getElementById('filter-modal-map');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}

// Make functions global
window.openFilterModal = openFilterModal;
window.closeMapFilterModal = closeMapFilterModal;
// ... (add other filter functions to window)


// Utility functions
function updateFilterSummary(count) {
  const summary = document.getElementById('filter-summary');
  if (summary) {
    summary.textContent = `${count || 0} issues found`;
  }
}

function showLoading(show) {
  const loadingEl = document.getElementById('loading-state');
  if (loadingEl) {
    loadingEl.style.display = show ? 'flex' : 'none';
  }
}

function showNoLocationState() {
  const noLocationEl = document.getElementById('no-location-state');
  if (noLocationEl) {
    noLocationEl.style.display = 'flex';
  }
}

function showEmptyState() {
  const emptyState = document.getElementById('empty-state');
  if (emptyState) {
    emptyState.style.display = 'flex';
  }
}

// Make functions global for onclick handlers
window.closeModal = closeModal;
window.openFilterModal = openFilterModal;

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
        // Feed-style dropdown logic for status, severity, days
        function setupDropdown(selectorId, displayId, dropdownId, optionsId, textId, filterKey, defaultTextMap) {
          const display = document.getElementById(displayId);
          const dropdown = document.getElementById(dropdownId);
          const options = document.getElementById(optionsId);
          const text = document.getElementById(textId);
          if (display && dropdown) {
            display.addEventListener('click', () => {
              dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
            });
          }
          if (options && text) {
            options.addEventListener('change', (e) => {
              if (e.target.matches('input[type="radio"]')) {
                filters[filterKey] = e.target.value;
                text.textContent = defaultTextMap[e.target.value] || e.target.value;
                dropdown.style.display = 'none';
              }
            });
          }
        }

        setupDropdown('status-selector-map', 'status-display-map', 'status-dropdown-map', 'status-options-map', 'status-text-map', 'status', {
          all: 'All', open: 'Open', closed: 'Closed'
        });
        setupDropdown('severity-selector-map', 'severity-display-map', 'severity-dropdown-map', 'severity-options-map', 'severity-text-map', 'severity', {
          all: 'All', high: 'High (8+)', medium: 'Medium (4-7)', low: 'Low (0-3)'
        });
        setupDropdown('days-selector-map', 'days-display-map', 'days-dropdown-map', 'days-options-map', 'days-text-map', 'days', {
          '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days', '365': 'Last year'
        });
  console.log("Map page loaded - Google Maps version");

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
      console.log("User authenticated, loading profile and initializing map");

      // Load user profile first
      await loadUserProfile();

      // Initialize Google Maps (requires Google Maps API to be loaded first)
      if (typeof google !== 'undefined' && google.maps) {
        initMap();
      } else {
        console.error('Google Maps API not loaded');
        showToast('Error loading map. Please refresh the page.', 'error');
      }

      // Add event listeners
      const refreshBtn = document.getElementById('refresh-btn');
      const filterBtn = document.getElementById('filter-btn');
      const myLocationBtn = document.getElementById('my-location-btn');
      const closeModalBtn = document.getElementById('close-modal');

      if (refreshBtn) refreshBtn.addEventListener('click', refreshMap);
      if (myLocationBtn) myLocationBtn.addEventListener('click', setUserLocation);
      if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);

      // Multiselect dropdown logic for issue types
      const issueTypesDisplay = document.getElementById('issue-types-display-map');
      const issueTypesDropdown = document.getElementById('issue-types-dropdown-map');
      const issueTypesSearch = document.getElementById('issue-types-search-map');
      const issueTypesOptions = document.getElementById('issue-types-options-map');
      const issueTypesText = document.getElementById('issue-types-text-map');

      if (issueTypesDisplay && issueTypesDropdown) {
        issueTypesDisplay.addEventListener('click', () => {
          issueTypesDropdown.style.display = issueTypesDropdown.style.display === 'none' ? 'block' : 'none';
        });
      }

      if (issueTypesSearch && issueTypesOptions) {
        issueTypesSearch.addEventListener('keyup', () => {
          const search = issueTypesSearch.value.toLowerCase();
          const options = issueTypesOptions.querySelectorAll('.multiselect-option');
          options.forEach(option => {
            const text = option.textContent.toLowerCase();
            option.style.display = text.includes(search) ? 'block' : 'none';
          });
        });
      }

      function updateIssueTypesDisplayMap() {
        const checked = issueTypesOptions.querySelectorAll('input[type="checkbox"]:checked');
        if (checked.length === 0) {
          issueTypesText.textContent = 'Select issue types...';
        } else {
          issueTypesText.textContent = `${checked.length} type${checked.length > 1 ? 's' : ''} selected`;
        }
      }

      if (issueTypesOptions) {
        issueTypesOptions.addEventListener('change', (e) => {
          if (e.target.matches('input[type="checkbox"]')) {
            updateIssueTypesDisplayMap();
          }
        });
      }

      // Fix: Make filter button open the correct modal
      if (filterBtn) {
        filterBtn.addEventListener('click', () => {
          const filterModal = document.getElementById('filter-modal');
          if (filterModal) {
            filterModal.style.display = 'flex';
          }
        });
      }

      // Close filter modal on close button
      const closeFilterModalBtn = document.getElementById('close-filter-modal');
      if (closeFilterModalBtn) {
        closeFilterModalBtn.addEventListener('click', () => {
          const filterModal = document.getElementById('filter-modal');
          if (filterModal) filterModal.style.display = 'none';
        });
      }

      // Apply filters logic
      const applyFiltersBtn = document.getElementById('apply-filters');
      if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', () => {
          // Read filter values from dropdowns
          const checkedTypes = issueTypesOptions ? Array.from(issueTypesOptions.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value) : [];
          // Status
          const statusRadio = document.querySelector('#status-options-map input[type="radio"]:checked');
          filters.status = statusRadio ? statusRadio.value : 'open';
          // Severity
          const severityRadio = document.querySelector('#severity-options-map input[type="radio"]:checked');
          filters.severity = severityRadio ? severityRadio.value : 'all';
          // Days
          const daysRadio = document.querySelector('#days-options-map input[type="radio"]:checked');
          filters.days = daysRadio ? parseInt(daysRadio.value) : 30;
          // Issue Types
          filters.issueTypes = checkedTypes;
          // Force refresh from backend with new filters
          if (lastFetchRegion) {
            fetchIssuesInRegion(lastFetchRegion, true);
          } else {
            setUserLocation();
          }
          // Close modal
          const filterModal = document.getElementById('filter-modal');
          if (filterModal) filterModal.style.display = 'none';
        });
      }

      // Close modal on background click
      const issueModal = document.getElementById('issue-modal');
      if (issueModal) {
        issueModal.addEventListener('click', (e) => {
          if (e.target === issueModal) closeModal();
        });
      }

    } catch (error) {
      console.error("Error during initialization:", error);
      showToast('Failed to initialize. Please refresh the page.', 'error');
    }
  });
});

// Global function for Google Maps API callback
window.initMap = initMap;

// Global slider functions for fix images
window.mapChangeFixImage = function(direction) {
  if (!window.mapFixImages || window.mapFixImages.length <= 1) return;
  
  window.mapCurrentFixImageIndex = (window.mapCurrentFixImageIndex + direction + window.mapFixImages.length) % window.mapFixImages.length;
  
  const img = document.getElementById('map-fix-slider-image');
  const counter = document.getElementById('map-fix-slider-current');
  const dots = document.querySelectorAll('.fix-image-slider .slider-dot');
  
  if (img) img.src = window.mapFixImages[window.mapCurrentFixImageIndex];
  if (counter) counter.textContent = window.mapCurrentFixImageIndex + 1;
  
  dots.forEach((dot, idx) => {
    dot.style.background = idx === window.mapCurrentFixImageIndex ? 'white' : 'rgba(255,255,255,0.5)';
  });
};

window.mapSetFixImage = function(index) {
  if (!window.mapFixImages || index < 0 || index >= window.mapFixImages.length) return;
  
  window.mapCurrentFixImageIndex = index;
  
  const img = document.getElementById('map-fix-slider-image');
  const counter = document.getElementById('map-fix-slider-current');
  const dots = document.querySelectorAll('.fix-image-slider .slider-dot');
  
  if (img) img.src = window.mapFixImages[window.mapCurrentFixImageIndex];
  if (counter) counter.textContent = window.mapCurrentFixImageIndex + 1;
  
  dots.forEach((dot, idx) => {
    dot.style.background = idx === window.mapCurrentFixImageIndex ? 'white' : 'rgba(255,255,255,0.5)';
  });
};

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
    
    // Close modals
    closeFixUploadModal();
    closeModal();
    
    // Show detailed verification results in modal
    showFixResultModal(result);
    
    // Refresh map
    if (lastFetchRegion) {
      fetchIssuesInRegion(lastFetchRegion, true);
    }
    
  } catch (error) {
    progressModal.classList.remove('open');
    console.error('Error submitting fix:', error);
    showToast(`❌ ${error.message}`, 'error');
  }
}

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
// ...existing code...
