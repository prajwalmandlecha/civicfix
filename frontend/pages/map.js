import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js'; 
import { auth } from '../firebaseConfig.js'; 
import { onAuthStateChanged, getIdToken } from "firebase/auth"; 
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const API_BASE = 'https://civicfix-backend-809180458813.asia-south1.run.app';
const HEATMAP_ZOOM_THRESHOLD = 12; // Zoom level to switch between heatmap and points

let map = null;
let currentFilters = {
  status: [], issue_type: [], source: [], date_from: null, date_to: null
};
let currentToken = null; 

// Keep colors for point popups if needed, or define heatmap colors later
const ISSUE_TYPE_COLORS = {
  'Pothole': '#FF6B6B', 'Streetlight': '#FFD93D', 'Garbage': '#6FCF97',
  'Graffiti': '#A8E6CF', 'Drain': '#A8E6CF', 'Construction': '#D1D5DB', // Added Drain/Construction
  'Other': '#9CA3AF' 
};

function initMap() {
  if (map) return; 

  map = new maplibregl.Map({
    container: 'map',
    style: { // Keep using OpenStreetMap tiles
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256, attribution: '© OpenStreetMap contributors'
        },
        // --- ADD GeoJSON Source for points (will feed both layers) ---
        'issues-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] } // Start empty
        }
      },
      layers: [
        { id: 'osm-tiles', type: 'raster', source: 'osm-tiles', minzoom: 0, maxzoom: 19 },
        // --- ADD Heatmap Layer (initially hidden) ---
        {
            id: 'heatmap-layer',
            type: 'heatmap',
            source: 'issues-source',
            maxzoom: HEATMAP_ZOOM_THRESHOLD, // Hide heatmap when zooming IN past threshold
            paint: {
                // Increase weight based on severity, default to 1 if missing
                 'heatmap-weight': [
                    'interpolate', ['linear'],
                    ['coalesce', ['get', 'severity_score'], 1], // Use severity_score or default 1
                    0, 0, // Severity 0 -> weight 0
                    5, 1, // Severity 5 -> weight 1
                    10, 2 // Severity 10 -> weight 2 
                 ],
                // Adjust intensity based on zoom
                'heatmap-intensity': [
                    'interpolate', ['linear'], ['zoom'],
                    0, 1, // Intensity 1 at zoom 0
                    HEATMAP_ZOOM_THRESHOLD, 3 // Intensity 3 approaching point view
                ],
                // Color ramp: transparent -> blue -> yellow -> red
                // 'heatmap-color': [
                //     'interpolate', ['linear'], ['heatmap-density'],
                //     0, 'rgba(33,102,172,0)',
                //     0.2, 'rgb(103,169,207)',
                //     0.4, 'rgb(209,229,240)',
                //     0.6, 'rgb(253,219,199)',
                //     0.8, 'rgb(239,138,98)',
                //     1, 'rgb(178,24,43)'
                // ],
                    'heatmap-color': [
                      'interpolate', ['linear'], ['heatmap-density'],
                      0, 'rgba(0,0,0,0)',       // Transparent (no density)
                      0.1, 'rgb(0,255,0)',      // Green (low density)
                      0.3, 'rgb(255,255,0)',    // Yellow (medium density)
                      0.6, 'rgb(255,140,0)',    // Orange (higher density)
                      1, 'rgb(255,0,0)'         // Red (highest density)
                    ],

                // Adjust radius based on zoom
                'heatmap-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    0, 2, // Radius 2px at zoom 0
                    HEATMAP_ZOOM_THRESHOLD, 20 // Radius 20px approaching point view
                ],
                 // Adjust opacity based on zoom, fade out as points appear
                'heatmap-opacity': [
                    'interpolate', ['linear'], ['zoom'],
                    HEATMAP_ZOOM_THRESHOLD - 1, 0.8, // Fully opaque just before switching
                    HEATMAP_ZOOM_THRESHOLD, 0 // Fade out completely when points appear
                 ],
            },
            layout: {
                visibility: 'none' // Start hidden
            }
        },
        // --- ADD Points Layer (initially hidden) ---
        {
            id: 'points-layer',
            type: 'circle',
            source: 'issues-source',
            minzoom: HEATMAP_ZOOM_THRESHOLD -1, // Start appearing just before heatmap fades
            paint: {
                 // Color by severity score - 3 levels only
                 // Low (0-3.9): Green, Medium (4-7.9): Yellow, High (8-10): Red
                'circle-color': [
                    'step',
                    ['coalesce', ['get', 'severity_score'], 5],
                    '#22C55E', // Green for 0-3.9 (Low)
                    4, '#EAB308', // Yellow for 4-7.9 (Medium)
                    8, '#EF4444'  // Red for 8-10 (High)
                ],
                'circle-radius': 8,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
                // Fade points in as heatmap fades out
                'circle-opacity': [
                    'interpolate', ['linear'], ['zoom'],
                    HEATMAP_ZOOM_THRESHOLD - 1, 0, // Fully transparent when heatmap is visible
                    HEATMAP_ZOOM_THRESHOLD, 1 // Fully opaque when points should be visible
                ]
            },
            layout: {
                visibility: 'none' // Start hidden
            }
        }
      ]
    },
    center: [73.9017, 18.4549], // Pune center
    zoom: 10
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  map.on('load', () => {
    console.log("Map loaded, attempting initial data load.");
    loadMapData(); // Load data on initial map load

    // --- Add Popup Logic for Points Layer ---
    map.on('click', 'points-layer', (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const coordinates = feature.geometry.coordinates.slice();
        const props = feature.properties;
        
        // Ensure properties exist before accessing
        const status = props.status || 'unknown';
        const detectedIssues = Array.isArray(props.detected_issues) ? props.detected_issues : [];
        const issueTypesArray = Array.isArray(props.issue_types) ? props.issue_types : [props.issue_types || 'unknown'];

        const statusText = status === 'closed' ? '✅ Closed' :
                           status === 'verified' ? '🟡 Verified' :
                           status === 'spam' ? '🚫 Spam' : '🟠 Open';
        const statusBadge = `<span class="status-badge">${statusText}</span>`;

        const issueTypesHTML = detectedIssues.length > 0
          ? detectedIssues.map(issue => {
              const type = issue.type || 'unknown';
              const score = issue.severity_score;
              const color = ISSUE_TYPE_COLORS[type] || ISSUE_TYPE_COLORS.Other;
              return `<div class="issue-type-badge" style="background: ${color}20; border-left: 3px solid ${color}; padding: 4px 8px; margin: 2px 0; border-radius: 4px; font-size: 12px;">
                <strong>${type.replace(/_/g, ' ')}</strong> 
                ${score ? `<span style="color: #666;">(Score: ${score.toFixed(1)})</span>` : ''}
              </div>`;
            }).join('')
          : `<div class="issue-type-badge">Type: ${issueTypesArray.join(', ').replace(/_/g, ' ') || 'N/A'}</div>`;
        
        const locationText = props.display_address ? props.display_address : `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
        const openUpvotes = (props.upvotes && props.upvotes.open) || 0;
        const openReports = (props.reports && props.reports.open) || 0;
        const severityScore = props.severity_score;

        const popupHTML = `
          <div class="issue-popup">
            ${props.photo_url ? `<img src="${props.photo_url}" alt="Issue photo" class="popup-image" onerror="this.style.display='none'">` : ''}
            <h3>Issue Report ${props.id ? `<span style="font-size: 10px; color: #999;">(${props.id.substring(0,6)})</span>`: ''}</h3>
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
            <div class="popup-stats">
              <div class="stat-item"><span class="stat-label">👍 Upvotes:</span><span class="stat-value">${openUpvotes}</span></div>
              <div class="stat-item"><span class="stat-label">👎 Reports:</span><span class="stat-value">${openReports}</span></div>
              <div class="stat-item"><span class="stat-label">Severity:</span><span class="stat-value">${severityScore ? severityScore.toFixed(1) : 'N/A'}</span></div>
            </div>
            <div class="popup-meta">
              <div>${props.created_at ? new Date(props.created_at).toLocaleDateString() : 'No Date'}</div>
              <div>${props.source || 'citizen'}</div>
            </div>
          </div>
        `;
        new maplibregl.Popup({ maxWidth: '300px' })
            .setLngLat(coordinates)
            .setHTML(popupHTML)
            .addTo(map);
    });
    map.on('mouseenter', 'points-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'points-layer', () => { map.getCanvas().style.cursor = ''; });
    // --- End Popup Logic ---

  });

  // --- Update Layers on Move/Zoom End ---
  map.on('moveend', () => loadMapData()); // Load new data for the area
  map.on('zoomend', () => loadMapData()); // Load data and potentially toggle layers

} // End initMap

async function loadMapData() {
  if (!map || !currentToken) {
     console.log("Map not ready or token unavailable.");
     return; 
  }

  const zoom = map.getZoom();
  const bounds = map.getBounds();
  const boundsObj = {
    north: bounds.getNorth(), south: bounds.getSouth(),
    east: bounds.getEast(), west: bounds.getWest()
  };

  try {
    const queryParams = new URLSearchParams({
      zoom: zoom.toString(),
      bounds: JSON.stringify(boundsObj),
      filters: JSON.stringify(currentFilters)
    });

    const response = await fetch(`${API_BASE}/api/map-data?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (!response.ok) {
        let errorMsg = `Error ${response.status}`;
        try { const errData = await response.json(); errorMsg = errData.detail || errorMsg; } catch (e) {}
        throw new Error(errorMsg);
    }

    const data = await response.json(); // Backend now ALWAYS sends {type: 'points', features: [...]}

    // --- Update the single GeoJSON source ---
    const source = map.getSource('issues-source');
    if (source && data.features) {
         console.log(`Received ${data.features.length} points from backend.`);
        source.setData({
            type: 'FeatureCollection',
            features: data.features 
        });
    } else {
         console.warn("Issues source not found or no features received.");
          // Clear source if no data
         if(source) source.setData({ type: 'FeatureCollection', features: [] });
    }
    
    // --- Update layer visibility AFTER data is loaded ---
    updateLayerVisibility(); 

  } catch (error) {
    console.error('Error loading map data:', error);
    showToast(`⚠️ Error loading map data: ${error.message}`);
     // Optionally clear the source on error
     const source = map.getSource('issues-source');
     if(source) source.setData({ type: 'FeatureCollection', features: [] });
     updateLayerVisibility(); // Ensure layers are correctly hidden/shown even on error
  }
} // End loadMapData


function updateLayerVisibility() {
    if (!map) return;
    const zoom = map.getZoom();
    
    console.log(`Current Zoom: ${zoom.toFixed(2)}, Threshold: ${HEATMAP_ZOOM_THRESHOLD}`);

    // Check if layers exist before trying to set layout property
    const heatmapLayerExists = map.getLayer('heatmap-layer');
    const pointsLayerExists = map.getLayer('points-layer');

    if (zoom < HEATMAP_ZOOM_THRESHOLD) {
        // Show Heatmap, Hide Points
        if (heatmapLayerExists) map.setLayoutProperty('heatmap-layer', 'visibility', 'visible');
        if (pointsLayerExists) map.setLayoutProperty('points-layer', 'visibility', 'none');
        console.log("Showing heatmap layer, hiding points layer.");
    } else {
        // Show Points, Hide Heatmap
        if (heatmapLayerExists) map.setLayoutProperty('heatmap-layer', 'visibility', 'none');
        if (pointsLayerExists) map.setLayoutProperty('points-layer', 'visibility', 'visible');
        console.log("Showing points layer, hiding heatmap layer.");
    }
} // End updateLayerVisibility

// --- REMOVED renderClusters and renderPoints functions ---
// The logic is now handled by updating the source and toggling layer visibility.

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
    
    // Basic date validation/formatting if needed - ensure YYYY-MM-DD for ES range query
    const formatDate = (dateStr) => {
        if (!dateStr) return null;
        // Assuming input is YYYY-MM-DD or parsable by Date
        try {
            return new Date(dateStr).toISOString().split('T')[0];
        } catch { return null; }
    };
    currentFilters.date_from = formatDate(dateFromInput?.value); 
    currentFilters.date_to = formatDate(dateToInput?.value); 
    
    loadMapData(); 
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

// --- DOMContentLoaded listener ---
document.addEventListener('DOMContentLoaded', () => {
    initializeAuthListener(); // Handles redirects
    initThemeToggle();
    initMobileMenu();
    initFilters(); 

    // Wait for auth state before getting token and initializing map
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                currentToken = await getIdToken(user); 
                console.log("Map page: Token retrieved, initializing map.");
                initMap(); // Init map AFTER token is available
            } catch (error) {
                console.error("Error getting user token:", error);
                showToast("❌ Error verifying user session.");
                window.location.replace('/login.html'); 
            }
        } else {
            console.log("Map page: No user found, redirecting.");
            window.location.replace('/login.html');
        }
    });
});
