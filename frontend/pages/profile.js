// import { initThemeToggle, initMobileMenu, showToast } from './shared.js'
import { initThemeToggle, initMobileMenu, showToast, protectPage } from './shared.js';

protectPage();
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initMobileMenu();

  const logoutBtn = document.querySelector('.logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      showToast('👋 Logged out successfully');
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    });
  }
});
