import './style.css'

// ===== COUNTER ANIMATION =====
function animateCounter(element, target) {
  const duration = 2000;
  const startTime = Date.now();

  function update() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const current = Math.floor(progress * target);
    element.textContent = current.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function initHeroCounters() {
  const counters = document.querySelectorAll('.stat-number[data-count]');
  counters.forEach(counter => {
    const target = parseInt(counter.getAttribute('data-count'));
    animateCounter(counter, target);
  });
}

// ===== THEME TOGGLE =====
function initThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle');
  const body = document.body;

  if (!themeToggle) return;

  const themeIcon = themeToggle.querySelector('.theme-icon');

  // Check for saved theme preference or default to light mode
  const currentTheme = localStorage.getItem('theme') || 'light';
  if (currentTheme === 'dark') {
    body.classList.add('dark-mode');
    if (themeIcon) themeIcon.textContent = '☀️';
  } else {
    if (themeIcon) themeIcon.textContent = '🌙';
  }

  // Toggle dark mode on click
  themeToggle.addEventListener('click', () => {
    body.classList.toggle('dark-mode');
    
    const isDark = body.classList.contains('dark-mode');
    if (themeIcon) {
      themeIcon.textContent = isDark ? '☀️' : '🌙';
    }
    
    // Save preference
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });

  // Auto-detect system preference (only if no saved preference)
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && !localStorage.getItem('theme')) {
    body.classList.add('dark-mode');
    if (themeIcon) themeIcon.textContent = '☀️';
    localStorage.setItem('theme', 'dark');
  }

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('theme')) {
      if (e.matches) {
        body.classList.add('dark-mode');
        if (themeIcon) themeIcon.textContent = '☀️';
      } else {
        body.classList.remove('dark-mode');
        if (themeIcon) themeIcon.textContent = '🌙';
      }
    }
  });
}

// ===== MOBILE MENU =====
function initMobileMenu() {
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const navMenu = document.getElementById('nav-menu');

  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', () => {
      navMenu.classList.toggle('active');
      menuToggle.classList.toggle('active');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!menuToggle.contains(e.target) && !navMenu.contains(e.target)) {
        navMenu.classList.remove('active');
        menuToggle.classList.remove('active');
      }
    });

    // Close menu when clicking a link
    navMenu.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        menuToggle.classList.remove('active');
      });
    });
  }
}

// ===== SCROLL ANIMATIONS =====
function initScrollAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, observerOptions);

  document.querySelectorAll('.fade-in').forEach(el => {
    observer.observe(el);
  });
}

// ===== INITIALIZE EVERYTHING =====
document.addEventListener('DOMContentLoaded', () => {
  initHeroCounters();
  initThemeToggle();
  initMobileMenu();
  initScrollAnimations();
});
