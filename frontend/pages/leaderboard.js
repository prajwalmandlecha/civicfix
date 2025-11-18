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

  // Render only non-podium users (rank > 3)
  const nonPodiumUsers = leaderboard.filter(leader => leader.rank > 3);
  
  nonPodiumUsers.forEach(leader => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    // Use 'co2' field as it's named in the backend (we'll use karma for this)
    const score = leader.co2 || 0; 
    const badges = Array.isArray(leader.badges) ? leader.badges : []; // Badges are empty for now

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

// Render podium (top 3) dynamically
function renderPodium(leaderboard, podiumId) {
  const podium = document.getElementById(podiumId);
  if (!podium) {
    console.error(`Podium container #${podiumId} not found.`);
    return;
  }
  
  podium.innerHTML = ''; // Clear existing podium
  
  if (!leaderboard || leaderboard.length === 0) {
    podium.innerHTML = '<p style="text-align: center; color: var(--grey-text);">No leaders yet.</p>';
    return;
  }
  
  // Get top 3 users
  const topThree = leaderboard.slice(0, 3);
  
  // Create podium structure: 2nd, 1st, 3rd (left to right)
  const podiumOrder = [
    topThree[1], // 2nd place (left)
    topThree[0], // 1st place (center)
    topThree[2]  // 3rd place (right)
  ];
  
  podiumOrder.forEach((leader, index) => {
    if (!leader) return; // Skip if position doesn't exist
    
    const podiumItem = document.createElement('div');
    const actualRank = leader.rank;
    const medals = ['🥈', '🥇', '🥉'];
    const rankClasses = ['rank-2', 'rank-1', 'rank-3'];
    
    podiumItem.className = `podium-item ${rankClasses[index]}`;
    podiumItem.innerHTML = `
      <div class="podium-avatar">${medals[index]}</div>
      <div class="podium-name">${leader.name || 'Anonymous'}</div>
      <div class="podium-co2">${(leader.co2 || 0).toLocaleString()} Karma</div>
      <div class="podium-stand">${actualRank}</div>
    `;
    
    podium.appendChild(podiumItem);
  });
}

// --- NEW: Function to fetch leaderboard data ---
async function loadLeaderboards() {
    const citizenList = document.getElementById('citizen-list');
    const ngoList = document.getElementById('ngo-list');
    if (citizenList) citizenList.innerHTML = '<div class="loading-spinner"></div>';
    if (ngoList) ngoList.innerHTML = '<div class="loading-spinner"></div>';

    try {
        // Fetch both leaderboards in parallel
        const [citizenResponse, ngoResponse] = await Promise.all([
            fetch('http://localhost:8000/api/leaderboard/citizens'),
            fetch('http://localhost:8000/api/leaderboard/ngos')
        ]);

        if (!citizenResponse.ok) throw new Error('Failed to load citizen leaderboard');
        if (!ngoResponse.ok) throw new Error('Failed to load NGO leaderboard');

        const citizenData = await citizenResponse.json();
        const ngoData = await ngoResponse.json();

        // Render podiums and lists using the data from the API
        renderPodium(citizenData.leaderboard, 'citizen-podium');
        renderPodium(ngoData.leaderboard, 'ngo-podium');
        renderLeaderboardList(citizenData.leaderboard, 'citizen-list');
        renderLeaderboardList(ngoData.leaderboard, 'ngo-list');

    } catch (error) {
        console.error("Error loading leaderboards:", error);
        showToast(`❌ ${error.message}`);
        if (citizenList) citizenList.innerHTML = '<p style="text-align: center; color: var(--error-color);">Could not load citizen data.</p>';
        if (ngoList) ngoList.innerHTML = '<p style="text-align: center; color: var(--error-color);">Could not load NGO data.</p>';
    }
}

// --- UPDATED: DOMContentLoaded listener ---
document.addEventListener('DOMContentLoaded', () => {
    initializeAuthListener(); // Handles navbar, redirects
    initThemeToggle();
    initMobileMenu();
    initLeaderboardTabs();
    loadLeaderboards(); // Fetch dynamic data instead of using mock data
});