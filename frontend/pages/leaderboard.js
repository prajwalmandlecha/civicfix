// frontend/pages/leaderboard.js

// --- Import auth listener and shared functions ---
import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js';
// --- Removed citizenLeaderboard, ngoLeaderboard ---

function initLeaderboardTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const panel = document.getElementById(`${tab}-panel`);
      if (panel) panel.classList.add('active');
    });
  });
}

function renderLeaderboardList(leaderboard, containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Leaderboard container #${containerId} not found.`);
    return;
  }
  container.innerHTML = ''; // Clear previous/loading state

  if (!leaderboard || leaderboard.length === 0) {
     container.innerHTML = '<p style="text-align: center; color: var(--grey-text);">No leaders found yet.</p>';
     return;
  }

  // Update podium with top 3 real users
  updatePodium(leaderboard, containerId);

  // Show remaining users (4th place onwards) in the list
  const remainingUsers = leaderboard.length > 3 ? leaderboard.slice(3) : [];
  
  remainingUsers.forEach(leader => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    const score = leader.co2 || 0; 
    const badges = Array.isArray(leader.badges) ? leader.badges : [];

    item.innerHTML = `
      <div class="rank-number">#${leader.rank}</div>
      <div class="leader-avatar">👤</div>
      <div class="leader-info">
        <div class="leader-name">${leader.name || 'Anonymous'}</div>
        <div class="leader-co2">${score.toLocaleString()} Karma</div>
      </div>
      <div class="leader-badges">
        ${badges.map(badge => `<span>${badge}</span>`).join('')}
      </div>
    `;
    container.appendChild(item);
  });
}

function updatePodium(leaderboard, containerId) {
  // Determine which podium to update based on container
  const isPodiumCitizen = containerId === 'citizen-list';
  const podiumSelector = isPodiumCitizen ? '#citizen-panel .podium' : '#ngo-panel .podium';
  const podium = document.querySelector(podiumSelector);
  
  if (!podium || leaderboard.length === 0) return;

  // Get top 3 users
  const top3 = leaderboard.slice(0, 3);
  
  // Clear existing podium
  podium.innerHTML = '';
  
  // Create podium items for top 3 (in display order: 2nd, 1st, 3rd)
  const podiumOrder = [1, 0, 2]; // indices for 2nd, 1st, 3rd place
  const podiumClasses = ['rank-2', 'rank-1', 'rank-3'];
  const medals = ['🥈', '🥇', '🥉'];
  const positions = [2, 1, 3];

  podiumOrder.forEach((userIndex, displayIndex) => {
    const user = top3[userIndex];
    if (user) {
      const podiumItem = document.createElement('div');
      podiumItem.className = `podium-item ${podiumClasses[displayIndex]}`;
      
      podiumItem.innerHTML = `
        <div class="podium-avatar">${medals[displayIndex]}</div>
        <div class="podium-name">${user.name || 'Anonymous'}</div>
        <div class="podium-co2">${(user.co2 || 0).toLocaleString()} Karma</div>
        <div class="podium-stand">${positions[displayIndex]}</div>
      `;
      
      podium.appendChild(podiumItem);
    }
  });
}

// --- NEW: Function to fetch leaderboard data ---
async function loadLeaderboards(user = null) {
    const citizenList = document.getElementById('citizen-list');
    const ngoList = document.getElementById('ngo-list');
    if (citizenList) citizenList.innerHTML = '<div class="loading-spinner"></div>';
    if (ngoList) ngoList.innerHTML = '<div class="loading-spinner"></div>';

    try {
        console.log('Fetching leaderboards from backend...');
        
        const API_URL = 'https://civicfix-backend-809180458813.asia-south1.run.app';
        
        // Prepare headers like mobile app
        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };
        
        // Add auth token if user is logged in (same as mobile app)
        if (user) {
            try {
                const token = await getIdToken(user);
                headers.Authorization = `Bearer ${token}`;
                console.log('Added auth token to leaderboard request');
            } catch (tokenError) {
                console.log('Could not get auth token, proceeding without auth:', tokenError);
            }
        }
        
        // Fetch both leaderboards in parallel
        const [citizenResponse, ngoResponse] = await Promise.all([
            fetch(`${API_URL}/api/leaderboard/citizens`, {
                method: 'GET',
                headers: headers
            }),
            fetch(`${API_URL}/api/leaderboard/ngos`, {
                method: 'GET', 
                headers: headers
            })
        ]);

        console.log('Citizen response status:', citizenResponse.status);
        console.log('NGO response status:', ngoResponse.status);

        if (!citizenResponse.ok) {
            const errorText = await citizenResponse.text();
            console.error('Citizen leaderboard error:', errorText);
            throw new Error(`Failed to load citizen leaderboard: ${citizenResponse.status}`);
        }
        if (!ngoResponse.ok) {
            const errorText = await ngoResponse.text();
            console.error('NGO leaderboard error:', errorText);
            throw new Error(`Failed to load NGO leaderboard: ${ngoResponse.status}`);
        }

        const citizenData = await citizenResponse.json();
        const ngoData = await ngoResponse.json();

        console.log('Citizen leaderboard data:', citizenData);
        console.log('NGO leaderboard data:', ngoData);

        // Render using the data from the API
        renderLeaderboardList(citizenData.leaderboard, 'citizen-list');
        renderLeaderboardList(ngoData.leaderboard, 'ngo-list');

    } catch (error) {
        console.error("Error loading leaderboards:", error);
        showToast(`❌ ${error.message}`);
        if (citizenList) citizenList.innerHTML = '<p style="text-align: center; color: var(--error-color);">Could not load citizen data. Please check if the backend is running.</p>';
        if (ngoList) ngoList.innerHTML = '<p style="text-align: center; color: var(--error-color);">Could not load NGO data. Please check if the backend is running.</p>';
    }
}

// --- Import auth functions ---
import { auth } from '../firebaseConfig.js';
import { onAuthStateChanged, getIdToken } from "firebase/auth";

// --- UPDATED: DOMContentLoaded listener ---
document.addEventListener('DOMContentLoaded', () => {
    initializeAuthListener(); // Handles navbar, redirects
    initThemeToggle();
    initMobileMenu();
    initLeaderboardTabs();
    
    // Wait for auth before loading leaderboards - same as mobile app
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            loadLeaderboards(user); // Pass user for token
        } else {
            loadLeaderboards(null); // Try without auth
        }
    });
});