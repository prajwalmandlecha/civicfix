// frontend/pages/profile.js

// ... (keep existing imports)
import { initThemeToggle, initMobileMenu, showToast } from './shared.js'; // Added showToast
import { initializeAuthListener } from './auth.js';
import { auth, db } from '../firebaseConfig.js';
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

/**
 * Fetches the current user's profile data from Firestore and updates the page.
 * @param {object} user - The Firebase Auth user object.
 */
async function loadUserProfile(user) {
    if (!user) {
        console.log("No user passed to loadUserProfile.");
        // Redirect if somehow called without a user (auth listener should prevent this)
        window.location.replace('/login.html');
        return;
    }

    // Get references to the HTML elements we need to update
    const avatarNameEl = document.querySelector('.profile-avatar .avatar-hash');
    const nameFallback = 'Citizen'; // Default if name not found

    // --- Selectors for stats (adjust if HTML changes) ---
    const karmaStatEl = document.querySelector('.profile-stat span.stat-value'); // First stat
    const rankStatEl = document.querySelector('.profile-stats .profile-stat:nth-child(2) span.stat-value'); // Second stat

    // --- Selectors for other dynamic elements (Add these if needed) ---
    // const badgeGridEl = document.querySelector('.badge-grid');
    // const activityListEl = document.querySelector('.activity-list');
    // const chartContainerEl = document.querySelector('.chart-container');

    // --- Set loading states ---
    if (avatarNameEl) avatarNameEl.textContent = 'Loading...';
    if (karmaStatEl) karmaStatEl.textContent = '...';
    if (rankStatEl) rankStatEl.textContent = '#?'; // Keep rank placeholder

    try {
        // --- 1. Fetch user document from Firestore ---
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            // --- FIX: Use .data() instead of .to_dict() ---
            const userData = userDoc.data();
            console.log("User data fetched:", userData);

            // --- 2. Update Profile Card ---
            if (avatarNameEl) {
                // Display the user's name or fallback
                avatarNameEl.textContent = userData.name || nameFallback;
            }
            if (karmaStatEl) {
                // Update Karma (used for CO2 display placeholder)
                const karma = userData.karma || 0;
                karmaStatEl.textContent = karma.toLocaleString(); // Format number
            }
            // Rank needs a separate query or calculation - keep placeholder
            if (rankStatEl) {
                rankStatEl.textContent = '#?';
            }

            // --- Update Badges (Placeholder - remove static HTML) ---
            // You'll need to fetch/calculate badges later based on userData
            // const badgeGridEl = document.querySelector('.badge-grid');
            // if (badgeGridEl) {
            //    badgeGridEl.innerHTML = ''; // Clear static badges
            //    // Add dynamic badges here based on userData.karma or other stats
            //    // e.g., if (userData.karma > 100) badgeGridEl.innerHTML += '<span class="badge">🔥</span>';
            // }

        } else {
            console.error("No user document found in Firestore for UID:", user.uid);
            if (avatarNameEl) avatarNameEl.textContent = 'Not Found';
            showToast('❌ User profile data not found.');
        }

        // --- 3. Update Recent Activity & Chart (Placeholder) ---
        // These are still static in your HTML. Clear or add "Coming Soon".
        const activityListEl = document.querySelector('.activity-list');
        const chartContainerEl = document.querySelector('.chart-container svg'); // Target the SVG inside
         if (activityListEl) {
             activityListEl.innerHTML = '<p style="text-align: center; color: var(--grey-text);">Activity feed coming soon!</p>';
         }
         if (chartContainerEl) {
             chartContainerEl.innerHTML = '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="var(--grey-text)">Chart coming soon</text>';
         }

    } catch (error) {
        console.error("Error fetching user profile:", error);
        if (avatarNameEl) avatarNameEl.textContent = 'Error';
        showToast(`❌ Error loading profile: ${error.message}`);
    }
}

// --- Main execution block when the page loads (No changes needed here) ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize auth first (handles redirects, adds logout button)
    initializeAuthListener();

    // 2. Initialize standard UI elements
    initThemeToggle();
    initMobileMenu();

    // 3. Listen for the auth state to load the profile
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is logged in, load their profile data
            loadUserProfile(user);
        } else {
            // User is not logged in.
            // initializeAuthListener() should have already redirected,
            // but as a fallback:
            console.log("No user found, redirecting to login.");
            // No need for explicit redirect here, initializeAuthListener handles it earlier
        }
    });

    // 4. NOTE: The logout button logic is now handled inside auth.js
    // We don't need the old 'logoutBtn' listener here anymore.
});