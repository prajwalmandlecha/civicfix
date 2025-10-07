import { initThemeToggle, initMobileMenu, showToast } from './shared.js'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const API_BASE = 'http://localhost:3001';
let map = null;
let currentFilters = {
  status: [],
  issue_type: [],
  source: [],
  date_from: null,
  date_to: null
};

const ISSUE_TYPE_COLORS = {
  'Pothole': '#FF6B6B',
  'Streetlight': '#FFD93D',
  'Garbage': '#6FCF97',
  'Graffiti': '#A8E6CF',
  'Other': '#9CA3AF'
};

function initMap() {
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
        {
          id: 'osm-tiles',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19
        }
      ]
    },
    center: [77.5946, 12.9716],
    zoom: 10
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  map.on('load', () => {
    loadMapData();
  });

  map.on('moveend', () => {
    loadMapData();
  });

  map.on('zoomend', () => {
    loadMapData();
  });
}

async function loadMapData() {
  if (!map) return;

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

    const response = await fetch(`${API_BASE}/api/map-data?${queryParams}`);
    const data = await response.json();

    if (data.type === 'clusters') {
      renderClusters(data.features);
    } else if (data.type === 'points') {
      renderPoints(data.features);
    }
  } catch (error) {
    console.error('Error loading map data:', error);
    showToast('⚠️ Error loading map data');
  }
}

function renderClusters(clusters) {
  if (map.getSource('points-source')) {
    map.removeLayer('points-layer');
    map.removeSource('points-source');
  }

  if (map.getSource('clusters-source')) {
    map.getSource('clusters-source').setData({
      type: 'FeatureCollection',
      features: clusters.map(c => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: c.coordinates
        },
        properties: {
          id: c.id,
          count: c.count,
          issue_types: JSON.stringify(c.issue_types),
          total_upvotes: c.total_upvotes,
          total_co2_saved: c.total_co2_saved,
          total_fate_risk: c.total_fate_risk
        }
      }))
    });
  } else {
    map.addSource('clusters-source', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: clusters.map(c => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: c.coordinates
          },
          properties: {
            id: c.id,
            count: c.count,
            issue_types: JSON.stringify(c.issue_types),
            total_upvotes: c.total_upvotes,
            total_co2_saved: c.total_co2_saved,
            total_fate_risk: c.total_fate_risk
          }
        }))
      }
    });

    map.addLayer({
      id: 'clusters-layer',
      type: 'circle',
      source: 'clusters-source',
      paint: {
        'circle-color': '#6FCF97',
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['get', 'count'],
          1, 15,
          50, 30,
          100, 40,
          500, 50
        ],
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
      paint: {
        'text-color': '#ffffff'
      }
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
          <div class="popup-section">
            <h4>Issue Types:</h4>
            ${issueTypesList}
          </div>
          <div class="popup-stats">
            <div class="stat-item">
              <span class="stat-label">Total Upvotes:</span>
              <span class="stat-value">${Math.round(props.total_upvotes)}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">CO₂ Saved:</span>
              <span class="stat-value">${Math.round(props.total_co2_saved)} kg</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Fate Risk:</span>
              <span class="stat-value">${Math.round(props.total_fate_risk)} kg CO₂</span>
            </div>
          </div>
          <p class="zoom-hint">Zoom in to see individual issues</p>
        </div>
      `;

      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML(popupHTML)
        .addTo(map);
    });

    map.on('mouseenter', 'clusters-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'clusters-layer', () => {
      map.getCanvas().style.cursor = '';
    });
  }
}

function renderPoints(points) {
  if (map.getSource('clusters-source')) {
    map.removeLayer('cluster-count');
    map.removeLayer('clusters-layer');
    map.removeSource('clusters-source');
  }

  if (map.getSource('points-source')) {
    map.getSource('points-source').setData({
      type: 'FeatureCollection',
      features: points.map(p => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: p.coordinates
        },
        properties: p.properties
      }))
    });
  } else {
    map.addSource('points-source', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: points.map(p => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: p.coordinates
          },
          properties: p.properties
        }))
      }
    });

    map.addLayer({
      id: 'points-layer',
      type: 'circle',
      source: 'points-source',
      paint: {
        'circle-color': [
          'match',
          ['get', 'issue_type'],
          'Pothole', ISSUE_TYPE_COLORS.Pothole,
          'Streetlight', ISSUE_TYPE_COLORS.Streetlight,
          'Garbage', ISSUE_TYPE_COLORS.Garbage,
          'Graffiti', ISSUE_TYPE_COLORS.Graffiti,
          ISSUE_TYPE_COLORS.Other
        ],
        'circle-radius': 8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });

    map.on('click', 'points-layer', (e) => {
      const feature = e.features[0];
      const coordinates = feature.geometry.coordinates.slice();
      const props = feature.properties;

      let statusBadge = '';
      if (props.status === 'closed') {
        statusBadge = '<span class="status-badge closed">✅ Closed</span>';
      } else if (props.status === 'verified') {
        statusBadge = '<span class="status-badge verified">🟡 Verified</span>';
      } else if (props.status === 'open') {
        statusBadge = '<span class="status-badge open">🟠 Open</span>';
      } else {
        statusBadge = `<span class="status-badge unsolved">⚠️ ${props.status || 'Unknown'}</span>`;
      }

      const popupHTML = `
        <div class="issue-popup">
          ${props.photo_url ? `<img src="${props.photo_url}" alt="Issue photo" class="popup-image" onerror="this.style.display='none'">` : ''}
          <h3>${props.issue_type}</h3>
          ${statusBadge}
          <div class="popup-section">
            <p class="popup-description">${props.description || 'No description available'}</p>
          </div>
          <div class="popup-stats">
            <div class="stat-item">
              <span class="stat-label">❤️ Upvotes:</span>
              <span class="stat-value">${props.upvotes}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Severity:</span>
              <span class="stat-value">${props.severity}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Reports:</span>
              <span class="stat-value">${props.reports}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">🌱 CO₂ Saved:</span>
              <span class="stat-value">${props.co2_kg_saved} kg</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">⚠️ Fate Risk:</span>
              <span class="stat-value">${props.fate_risk_co2} kg CO₂</span>
            </div>
          </div>
          <div class="popup-meta">
            <div>📅 ${new Date(props.reported_at).toLocaleDateString()}</div>
            <div>📊 Source: ${props.source}</div>
          </div>
        </div>
      `;

      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML(popupHTML)
        .addTo(map);
    });

    map.on('mouseenter', 'points-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'points-layer', () => {
      map.getCanvas().style.cursor = '';
    });
  }
}

function initFilters() {
  const statusCheckboxes = document.querySelectorAll('input[name="status-filter"]');
  const typeCheckboxes = document.querySelectorAll('input[name="type-filter"]');
  const sourceCheckboxes = document.querySelectorAll('input[name="source-filter"]');
  const dateFromInput = document.getElementById('date-from');
  const dateToInput = document.getElementById('date-to');
  const applyFiltersBtn = document.getElementById('apply-filters');
  const resetFiltersBtn = document.getElementById('reset-filters');

  function updateFilters() {
    currentFilters.status = Array.from(statusCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    currentFilters.issue_type = Array.from(typeCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    currentFilters.source = Array.from(sourceCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value)
      .filter(v => v === 'citizen' || v === 'ngo' || v === 'anonymous');

    currentFilters.date_from = dateFromInput.value || null;
    currentFilters.date_to = dateToInput.value || null;

    loadMapData();
    showToast('✅ Filters applied');
  }

  function resetFilters() {
    currentFilters = {
      status: [],
      issue_type: [],
      source: [],
      date_from: null,
      date_to: null
    };

    statusCheckboxes.forEach(cb => cb.checked = false);
    typeCheckboxes.forEach(cb => cb.checked = false);
    sourceCheckboxes.forEach(cb => cb.checked = false);
    if (dateFromInput) dateFromInput.value = '';
    if (dateToInput) dateToInput.value = '';

    loadMapData();
    showToast('✅ Filters reset');
  }

  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', updateFilters);
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', resetFilters);
  }
}

function initMapFilters() {
  const dateRange = document.getElementById('date-range');
  const rangeValue = document.querySelector('.range-value');

  if (dateRange) {
    dateRange.addEventListener('input', (e) => {
      const value = e.target.value;
      rangeValue.textContent = `Last ${value} days`;
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initMobileMenu();
  initMap();
  initFilters();
  initMapFilters();
});
