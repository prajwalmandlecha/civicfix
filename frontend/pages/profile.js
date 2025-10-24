// frontend/pages/profile.js

import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js';
import { auth } from '../firebaseConfig.js';
import { onAuthStateChanged } from "firebase/auth";
import { getIdToken } from "firebase/auth";

const API_BASE = 'https://civicfix-backend-809180458813.asia-south1.run.app';

/**
 * Fetches the current user's stats from the backend API and updates the page.
 * @param {object} user - The Firebase Auth user object.
 */
async function loadUserProfile(user) {
    if (!user) {
        console.log("No user passed to loadUserProfile.");
        window.location.replace('/login.html');
        return;
    }

    // Show loading, hide content
    const loadingIndicator = document.getElementById('loading-indicator');
    const profileContent = document.getElementById('profile-content');
    
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    if (profileContent) profileContent.style.display = 'none';

    try {
        // Get Firebase ID token for authentication
        const idToken = await getIdToken(user);

        // Fetch user stats from backend
        const response = await fetch(`${API_BASE}/api/users/${user.uid}/stats`, {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch stats: ${response.status}`);
        }

        const data = await response.json();
        const stats = data.stats;

        console.log("User stats fetched:", stats);

        // Hide loading, show content
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (profileContent) profileContent.style.display = 'block';

        // Update Profile Header
        const avatarInitial = document.getElementById('avatar-initial');
        const username = document.getElementById('profile-username');
        const email = document.getElementById('profile-email');
        const karmaValue = document.getElementById('profile-karma-value');
        const rankValue = document.getElementById('profile-rank-value');

        const displayName = user.displayName || user.email?.split('@')[0] || 'User';
        
        if (avatarInitial) avatarInitial.textContent = displayName.charAt(0).toUpperCase();
        if (username) username.textContent = displayName;
        if (email) email.textContent = user.email || '';
        if (karmaValue) karmaValue.textContent = (stats.karma || 0).toLocaleString();
        if (rankValue) rankValue.textContent = stats.currentRank > 0 ? `#${stats.currentRank}` : 'N/A';

        // Update stats grid
        const statReported = document.getElementById('stat-issues-reported');
        const statResolved = document.getElementById('stat-issues-resolved');
        const statFixed = document.getElementById('stat-issues-fixed');
        const statCo2 = document.getElementById('stat-co2-saved');

        // Show/hide stats based on user type (we'll assume citizen for now)
        if (stats.issuesReported !== undefined && statReported) {
            statReported.style.display = 'block';
            statReported.querySelector('.stat-value').textContent = stats.issuesReported;
        }
        
        if (stats.issuesResolved !== undefined && statResolved) {
            statResolved.style.display = 'block';
            statResolved.querySelector('.stat-value').textContent = stats.issuesResolved;
        }
        
        if (stats.issuesFixed !== undefined && stats.issuesFixed > 0 && statFixed) {
            statFixed.style.display = 'block';
            statFixed.querySelector('.stat-value').textContent = stats.issuesFixed;
        }
        
        if (statCo2) {
            statCo2.querySelector('.stat-value').textContent = `${stats.co2Saved || 0} kg`;
        }

    } catch (error) {
        console.error("Error fetching user profile:", error);
        showToast(`❌ Error loading profile: ${error.message}`);
        
        // Hide loading, show content anyway
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (profileContent) profileContent.style.display = 'block';
    }
}

// Main execution block when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeAuthListener();
    initThemeToggle();
    initMobileMenu();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadUserProfile(user);
        } else {
            console.log("No user found, redirecting to login.");
        }
    });
});
