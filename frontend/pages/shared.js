import '../style.css'

export function initThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  const themeIcon = toggle.querySelector('.theme-icon');

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    themeIcon.textContent = '🌙';
  }

  toggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeIcon.textContent = isDark ? '🌙' : '☀️';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
}

export function initMobileMenu() {
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const navMenu = document.getElementById('nav-menu');

  menuToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    menuToggle.classList.toggle('active');
  });
}

export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) {
    const newToast = document.createElement('div');
    newToast.id = 'toast';
    newToast.className = 'toast';
    document.body.appendChild(newToast);
  }

  const toastEl = document.getElementById('toast');
  toastEl.textContent = message;
  toastEl.classList.add('show');

  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3000);
}

export const demoIssues = [
  {
    id: 1,
    type: 'Pothole',
    location: 'Main St & 5th Ave',
    image: 'https://images.pexels.com/photos/2101137/pexels-photo-2101137.jpeg?auto=compress&cs=tinysrgb&w=400',
    upvotes: 127,
    severity: "medium",
    reports: 5,
    status: 'unsolved',
    description: 'Large pothole causing traffic hazard. Approximately 2 feet wide and 6 inches deep.',
    co2Risk: 'High - 45kg CO₂ if unresolved',
    uploader: '#abc123',
    date: '2025-10-01'
  },
  {
    id: 2,
    type: 'Streetlight',
    location: 'Park Avenue',
    image: 'https://images.pexels.com/photos/1108572/pexels-photo-1108572.jpeg?auto=compress&cs=tinysrgb&w=400',
    upvotes: 89,
    severity: "high",
    reports: 2,
    status: 'unsolved',
    description: 'Multiple streetlights out, creating safety concerns for pedestrians at night.',
    co2Risk: 'Medium - 28kg CO₂ if unresolved',
    uploader: '#def456',
    date: '2025-09-30'
  },
  {
    id: 3,
    type: 'Garbage',
    location: 'Central Park West',
    image: 'https://images.pexels.com/photos/3171575/pexels-photo-3171575.jpeg?auto=compress&cs=tinysrgb&w=400',
    upvotes: 156,
    severity: "low",
    reports: 1,
    status: 'resolved',
    description: 'Overflowing garbage bins attracting pests. Needs immediate attention.',
    co2Risk: 'Low - 12kg CO₂ saved',
    uploader: '#xyz789',
    date: '2025-09-28'
  },
  {
    id: 4,
    type: 'Graffiti',
    location: 'Downtown Bridge',
    image: 'https://images.pexels.com/photos/1370704/pexels-photo-1370704.jpeg?auto=compress&cs=tinysrgb&w=400',
    upvotes: 64,
    severity: "medium",
    reports: 3,
    status: 'unsolved',
    description: 'Vandalism on public infrastructure requiring professional cleaning.',
    co2Risk: 'Low - 8kg CO₂ if unresolved',
    uploader: '#ghi789',
    date: '2025-09-29'
  },
  {
    id: 5,
    type: 'Pothole',
    location: 'Elm Street',
    image: 'https://images.pexels.com/photos/196666/pexels-photo-196666.jpeg?auto=compress&cs=tinysrgb&w=400',
    upvotes: 98,
    severity: "high",
    reports: 0,
    status: 'unsolved',
    description: 'Dangerous pothole near school zone, posing risk to children and vehicles.',
    co2Risk: 'High - 52kg CO₂ if unresolved',
    uploader: '#jkl012',
    date: '2025-10-02'
  },
  {
    id: 6,
    type: 'Streetlight',
    location: 'Riverside Drive',
    image: 'https://images.pexels.com/photos/220444/pexels-photo-220444.jpeg?auto=compress&cs=tinysrgb&w=400',
    upvotes: 43,
    severity: "low",
    reports: 4,
    status: 'resolved',
    description: 'Fixed - Streetlight restored to full functionality.',
    co2Risk: 'Medium - 22kg CO₂ saved',
    uploader: '#mno345',
    date: '2025-09-27'
  }
];

export const citizenLeaderboard = [
  { rank: 4, name: '#user789', co2: 842, badges: ['🌟', '⭐', '🔧'] },
  { rank: 5, name: '#leader234', co2: 756, badges: ['🌟', '⭐'] },
  { rank: 6, name: '#civic567', co2: 689, badges: ['🌟', '🔧'] },
  { rank: 7, name: '#hero890', co2: 623, badges: ['🌟'] },
  { rank: 8, name: '#fix123', co2: 587, badges: ['🌟', '⭐', '🔥'] },
  { rank: 9, name: '#green456', co2: 534, badges: ['🌟'] },
  { rank: 10, name: '#clean789', co2: 498, badges: ['🌟', '⭐'] }
];

export const ngoLeaderboard = [
  { rank: 4, name: 'EcoWarriors Collective', co2: 9876, badges: ['🏆', '🌟', '⭐'] },
  { rank: 5, name: 'Urban Renewal Group', co2: 8543, badges: ['🏆', '🌟'] },
  { rank: 6, name: 'Community First Initiative', co2: 7234, badges: ['🏆'] },
  { rank: 7, name: 'Green Tomorrow Foundation', co2: 6789, badges: ['🌟', '⭐'] },
  { rank: 8, name: 'City Helpers Alliance', co2: 5432, badges: ['🌟'] },
  { rank: 9, name: 'Neighborhood Watch Org', co2: 4567, badges: ['⭐'] },
  { rank: 10, name: 'Better Streets Coalition', co2: 3890, badges: ['🌟'] }
];

