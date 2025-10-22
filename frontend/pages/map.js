import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js'; // Import new auth listener
import { auth } from '../firebaseConfig.js'; // Import auth to check state
import { onAuthStateChanged, getIdToken } from "firebase/auth"; // Import auth functions
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// This page is protected, but initializeAuthListener will handle the redirect.
// We remove the old protectPage() call.

const API_BASE = 'http://localhost:3001'; // Keep port 3001 for the map server
let map = null;
let currentFilters = {
  status: [],
  issue_type: [],
  source: [],
  date_from: null,
  date_to: null
};
let currentToken = null; // Store the auth token globally for this script

const ISSUE_TYPE_COLORS = {
  'Pothole': '#FF6B6B',
  'Streetlight': '#FFD93D',
  'Garbage': '#6FCF97',
  'Graffiti': '#A8E6CF',
  'Other': '#9CA3AF'
  // TODO: Add the rest of your canonical issue types here
};

function initMap() {
  if (map) return; // Don't re-initialize

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
    center: [77.5946, 12.9716], // Default center (e.g., Bangalore)
    zoom: 10
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  map.on('load', () => {
    console.log("Map loaded, attempting to load data.");
    loadMapData(); // Load data on initial map load
  });

  // Re-load data when map interaction finishes
  map.on('moveend', () => loadMapData());
  map.on('zoomend', () => loadMapData());
}

async function loadMapData() {
  if (!map || !currentToken) {
      console.log("Map not ready or token not available, skipping data load.");
      return; // Don't fetch if map isn't ready or user isn't logged in
  }

  const zoom = map.getZoom();
  const bounds = map.getBounds();
  const boundsObj = {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest()
  };

  try {
    const queryParams = new URLSearchParams({
      zoom: zoom.toString(),
      bounds: JSON.stringify(boundsObj),
      filters: JSON.stringify(currentFilters)
    });

    // --- UPDATED: Send Authorization header ---
    const response = await fetch(`${API_BASE}/api/map-data?${queryParams}`, {
        headers: {
            'Authorization': `Bearer ${currentToken}`
        }
    });
    // ---

    if (!response.ok) {
         let errorMsg = `Error ${response.status}`;
         try { const errData = await response.json(); errorMsg = errData.detail || errorMsg; } catch (e) {}
         throw new Error(errorMsg);
    }

    const data = await response.json();

    // --- Update logic to match new ES schema (from feed.js) ---
    // The node server might already do this, but good to be consistent
    if (data.type === 'clusters') {
      renderClusters(data.features);
    } else if (data.type === 'points') {
       // Convert /api/issues format to map point format if needed
       // Assuming node server already returns GeoJSON points
      renderPoints(data.features);
    }
  } catch (error) {
    console.error('Error loading map data:', error);
    showToast(`⚠️ Error loading map data: ${error.message}`);
  }
}

function renderClusters(clusters) {
  // ... (Your existing renderClusters function - no changes needed) ...
  if (map.getSource('points-source')) {
    map.removeLayer('points-layer');
    map.removeSource('points-source');
  }
  if (map.getSource('clusters-source')) {
    map.getSource('clusters-source').setData({
      type: 'FeatureCollection',
      features: clusters.map(c => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: c.coordinates },
        properties: { ...c, issue_types: JSON.stringify(c.issue_types) } // Ensure issue_types is stringified
      }))
    });
  } else {
    map.addSource('clusters-source', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: clusters.map(c => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: c.coordinates },
          properties: { ...c, issue_types: JSON.stringify(c.issue_types) }
        }))
      }
    });
    map.addLayer({
      id: 'clusters-layer',
      type: 'circle',
      source: 'clusters-source',
      paint: {
        'circle-color': '#6FCF97',
        'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 15, 50, 30, 100, 40, 500, 50],
        'circle-opacity': 0.7,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#4CAF79'
      }
    });
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'clusters-source',
      layout: {
        'text-field': ['get', 'count'],
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-size': 14
      },
      paint: { 'text-color': '#ffffff' }
    });
    map.on('click', 'clusters-layer', (e) => {
      const feature = e.features[0];
      const coordinates = feature.geometry.coordinates.slice();
      const props = feature.properties;
      const issueTypes = JSON.parse(props.issue_types);
      const issueTypesList = issueTypes
        .map(t => `<div class="popup-issue-type"><span class="type-dot" style="background: ${ISSUE_TYPE_COLORS[t.type] || '#9CA3AF'}"></span>${t.type}: ${t.count}</div>`)
        .join('');
      const popupHTML = `
        <div class="cluster-popup">
          <h3>Cluster: ${props.count} Issues</h3>
          <div class="popup-section"><h4>Issue Types:</h4>${issueTypesList}</div>
          <div class="popup-stats">
            <div class="stat-item"><span class="stat-label">Upvotes:</span><span class="stat-value">${Math.round(props.total_upvotes)}</span></div>
            <div class="stat-item"><span class="stat-label">CO₂ Saved:</span><span class="stat-value">${Math.round(props.total_co2_saved)} kg</span></div>
            <div class="stat-item"><span class="stat-label">CO₂ Risk:</span><span class="stat-value">${Math.round(props.total_fate_risk)} kg CO₂</span></div>
          </div>
          <p class="zoom-hint">Zoom in to see individual issues</p>
        </div>
      `;
      new maplibregl.Popup().setLngLat(coordinates).setHTML(popupHTML).addTo(map);
    });
    map.on('mouseenter', 'clusters-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'clusters-layer', () => { map.getCanvas().style.cursor = ''; });
  }
}

function renderPoints(points) {
  // ... (Your existing renderPoints function - updated to handle new schema) ...
  if (map.getSource('clusters-source')) {
    map.removeLayer('cluster-count');
    map.removeLayer('clusters-layer');
    map.removeSource('clusters-source');
  }
  if (map.getSource('points-source')) {
    map.getSource('points-source').setData({
      type: 'FeatureCollection',
      features: points
    });
  } else {
    map.addSource('points-source', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: points
      }
    });
    map.addLayer({
      id: 'points-layer',
      type: 'circle',
      source: 'points-source',
      paint: {
        'circle-color': ['interpolate', ['linear'], ['coalesce', ['get', 'severity_score'], 5], 0, '#22C55E', 3, '#EAB308', 5, '#F97316', 7, '#EF4444', 10, '#991B1B'],
        'circle-radius': 8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });
    map.on('click', 'points-layer', (e) => {
      const feature = e.features[0];
      const coordinates = feature.geometry.coordinates.slice();
      const props = feature.properties;
      
      // Use new status text
      const statusText = props.status === 'closed' ? '✅ Closed' :
                         props.status === 'verified' ? '🟡 Verified' :
                         props.status === 'spam' ? '🚫 Spam' : '🟠 Open';
      const statusBadge = `<span class="status-badge">${statusText}</span>`;
      
      // Handle issue_types (already an array from our backend)
      let issueTypesArray = Array.isArray(props.issue_types) ? props.issue_types : [props.issue_types || 'unknown'];
      
      // Handle detected_issues (nested array)
      let detectedIssues = Array.isArray(props.detected_issues) ? props.detected_issues : [];
      
      const issueTypesHTML = detectedIssues.length > 0
        ? detectedIssues.map(issue => {
            const color = ISSUE_TYPE_COLORS[issue.type] || ISSUE_TYPE_COLORS.Other;
            return `<div class="issue-type-badge" style="background: ${color}20; border-left: 3px solid ${color}; padding: 4px 8px; margin: 2px 0; border-radius: 4px; font-size: 12px;">
              <strong>${issue.type.replace(/_/g, ' ')}</strong> <span style="color: #666;">(Score: ${issue.severity_score?.toFixed(1) || 'N/A'})</span>
            </div>`;
          }).join('')
        : `<div class="issue-type-badge">Type: ${issueTypesArray.join(', ').replace(/_/g, ' ') || 'N/A'}</div>`;

      // Use display_address if available, otherwise format coords
      const locationText = props.display_address ? props.display_address : `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
      const openUpvotes = (props.upvotes && props.upvotes.open) || 0;
      const openReports = (props.reports && props.reports.open) || 0;

      const popupHTML = `
        <div class="issue-popup">
          ${props.photo_url ? `<img src="${props.photo_url}" alt="Issue photo" class="popup-image" onerror="this.style.display='none'">` : ''}
          <h3>Issue Report</h3>
          ${statusBadge}
          <div class="popup-section">
            <h4 style="font-size: 13px; margin: 8px 0 4px 0; color: #666;">Location:</h4>
            <p>${locationText}</p>
          </div>
          <div class="popup-section">
            <h4 style="font-size: 13px; margin: 8px 0 4px 0; color: #666;">AI Detected Issues:</h4>
            ${issueTypesHTML}
          </div>
          <div class="popup-section">
            <p class="popup-description">${props.description || props.auto_caption || 'No description'}</p>
          </div>
          <div class->
            <div class="stat-item"><span class="stat-label">👍 Upvotes:</span><span class="stat-value">${openUpvotes}</span></div>
            <div class="stat-item"><span class="stat-label">👎 Reports:</span><span class="stat-value">${openReports}</span></div>
            <div class="stat-item"><span class="stat-label">Severity:</span><span class="stat-value">${props.severity_score?.toFixed(1) || 'N/A'}</span></div>
          </div>
          <div class="popup-meta">
            <div>📅 ${new Date(props.reported_at).toLocaleDateString()}</div>
            <div>👤 ${props.source || 'citizen'}</div>
          </div>
        </div>
      `;
      new maplibregl.Popup().setLngLat(coordinates).setHTML(popupHTML).addTo(map);
    });
    map.on('mouseenter', 'points-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'points-layer', () => { map.getCanvas().style.cursor = ''; });
  }
}


function initFilters() {
  // ... (Your existing initFilters function - no changes needed) ...
  const statusCheckboxes = document.querySelectorAll('input[name="status-filter"]');
  const typeCheckboxes = document.querySelectorAll('input[name="type-filter"]');
  const sourceCheckboxes = document.querySelectorAll('input[name="source-filter"]');
  const dateFromInput = document.getElementById('date-from');
  const dateToInput = document.getElementById('date-to');
  const applyFiltersBtn = document.getElementById('apply-filters');
  const resetFiltersBtn = document.getElementById('reset-filters');
  function updateFilters() {
    currentFilters.status = Array.from(statusCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
    currentFilters.issue_type = Array.from(typeCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
    currentFilters.source = Array.from(sourceCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
    currentFilters.date_from = dateFromInput.value || null;
    currentFilters.date_to = dateToInput.value || null;
    loadMapData(); // Re-fetch data with new filters
    showToast('✅ Filters applied');
  }
  function resetFilters() {
    currentFilters = { status: [], issue_type: [], source: [], date_from: null, date_to: null };
    statusCheckboxes.forEach(cb => cb.checked = false);
    typeCheckboxes.forEach(cb => cb.checked = false);
    sourceCheckboxes.forEach(cb => cb.checked = false);
    if (dateFromInput) dateFromInput.value = '';
    if (dateToInput) dateToInput.value = '';
    loadMapData();
    showToast('✅ Filters reset');
  }
  if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', updateFilters);
  if (resetFiltersBtn) resetFiltersBtn.addEventListener('click', resetFilters);
}

// --- REMOVED initMapFilters function, as filters are handled in initFilters ---

// --- UPDATED: DOMContentLoaded listener ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize auth listener (handles redirects and navbar)
    initializeAuthListener();
    
    // 2. Initialize standard UI elements
    initThemeToggle();
    initMobileMenu();
    initFilters(); // Initialize filter panel logic
    // initMapFilters(); // This function was redundant

    // 3. Wait for auth state before initializing map and loading data
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is logged in
            try {
                currentToken = await getIdToken(user); // Get token
                console.log("Map page: Token retrieved, initializing map.");
                initMap(); // Now initialize the map
            } catch (error) {
                console.error("Error getting user token:", error);
                showToast("❌ Could not verify user. Please log in again.");
                window.location.replace('/login.html'); // Redirect on token error
            }
        } else {
            // User is not logged in.
            // initializeAuthListener should have already redirected, but as a fallback:
            console.log("Map page: No user found, redirecting.");
            window.location.replace('/login.html');
        }
    });
});