import { initThemeToggle, initMobileMenu, citizenLeaderboard, ngoLeaderboard } from './shared.js'

function initLeaderboardTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`${tab}-panel`).classList.add('active');
    });
  });
}

function renderLeaderboardList(leaderboard, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  leaderboard.forEach(leader => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    item.innerHTML = `
      <div class="rank-number">#${leader.rank}</div>
      <div class="leader-avatar">👤</div>
      <div class="leader-info">
        <div class="leader-name">${leader.name}</div>
        <div class="leader-co2">${leader.co2.toLocaleString()} kg CO₂</div>
      </div>
      <div class="leader-badges">
        ${leader.badges.map(badge => `<span>${badge}</span>`).join('')}
      </div>
    `;
    container.appendChild(item);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initMobileMenu();
  initLeaderboardTabs();
  renderLeaderboardList(citizenLeaderboard, 'citizen-list');
  renderLeaderboardList(ngoLeaderboard, 'ngo-list');
});
