// frontend/pages/profile.js
import { initThemeToggle, initMobileMenu, showToast } from './shared.js';
import { initializeAuthListener } from './auth.js';
import { auth, db } from '../firebaseConfig.js';
import { onAuthStateChanged, getIdToken } from "firebase/auth"; // Added getIdToken
import { doc, getDoc, updateDoc } from "firebase/firestore"; // Added updateDoc
// Import your location function (assuming it exists for web)
// import { getCurrentWebLocation } from './locationService.js'; // Example name

// --- UI Element References ---
let profileContentEl, loadingIndicatorEl, avatarInitialEl, usernameEl, emailEl, userTypeEl;
let karmaValueEl, rankValueEl, locationAddressEl, updateLocationBtnEl, locationLoadingEl;
let orgSectionEl, orgTextEl, orgEditViewEl, orgInputEl, editOrgBtnEl, saveOrgBtnEl, cancelOrgBtnEl;
let statReportedEl, statResolvedEl, statFixedEl, statCo2El, badgeGridEl;

let currentUserId = null;
let currentUserToken = null;
let firestoreUserData = {}; // Store basic data from Firestore

/**
 * Fetches data and updates the profile UI.
 */
async function loadUserProfile() {
    if (!currentUserId || !currentUserToken) {
        console.log("User ID or Token missing.");
        showToast("Error: Not properly logged in.");
        // Redirect handled by auth listener, but hide loading just in case
        if (loadingIndicatorEl) loadingIndicatorEl.style.display = 'none';
        if (profileContentEl) profileContentEl.style.display = 'none';
        return;
    }

    if (loadingIndicatorEl) loadingIndicatorEl.style.display = 'block';
    if (profileContentEl) profileContentEl.style.display = 'none';

    try {
        // --- 1. Fetch basic user data from Firestore ---
        const userDocRef = doc(db, "users", currentUserId);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            firestoreUserData = userDocSnap.data();
            console.log("Firestore User Data:", firestoreUserData);

            // Update basic UI immediately
            if (avatarInitialEl) avatarInitialEl.textContent = (firestoreUserData.name || '?').charAt(0).toUpperCase();
            if (usernameEl) usernameEl.textContent = firestoreUserData.name || `User ${currentUserId.substring(0,6)}`;
            if (emailEl) emailEl.textContent = auth.currentUser?.email || 'No email'; // Get from auth object
            const userTypeDisplay = (firestoreUserData.userType || 'citizen').replace(/^\w/, c => c.toUpperCase()); // Capitalize
            if (userTypeEl) userTypeEl.textContent = userTypeDisplay;

            // Show/Hide Organization section based on type
            if (orgSectionEl) {
                 orgSectionEl.style.display = (firestoreUserData.userType === 'ngo' || firestoreUserData.userType === 'volunteer') ? 'block' : 'none';
            }
            if (orgTextEl) orgTextEl.textContent = firestoreUserData.organization || 'Not set';
            if (orgInputEl) orgInputEl.value = firestoreUserData.organization || '';


        } else {
            console.error("No user document found in Firestore for UID:", currentUserId);
            showToast('❌ User profile data not found in database.');
            // Show minimal info or an error state
            if (usernameEl) usernameEl.textContent = `User ${currentUserId.substring(0,6)}`;
            if (emailEl) emailEl.textContent = auth.currentUser?.email || 'No email';
            firestoreUserData = { userType: 'citizen', karma: 0 }; // Assume defaults
        }

        // --- 2. Fetch detailed stats from Backend API ---
        let apiStats = {}; // To store stats from the API
        try {
            // --- *** FIX: Using absolute URL *** ---
            const apiUrl = `http://localhost:8000/api/users/${currentUserId}/stats`;
            console.log(`Fetching stats from: ${apiUrl}`);
            
            const response = await fetch(apiUrl, {
                headers: { 'Authorization': `Bearer ${currentUserToken}` }
            });
            // --- *** END OF FIX *** ---

            if (!response.ok) {
                 let errorMsg = `API Stats Error (${response.status})`;
                 try { 
                    const errData = await response.json(); 
                    errorMsg = errData.detail || errorMsg; 
                } catch (e) {
                    // This is where the error was happening!
                    console.error("Failed to parse error response as JSON:", e);
                }
                 throw new Error(errorMsg);
            }
            const statsResult = await response.json();
            apiStats = statsResult.stats || {};
            console.log("API Stats Data:", apiStats);

        } catch (apiError) {
             console.error("Error fetching stats from API:", apiError);
             showToast(`⚠️ Could not load detailed stats. Showing basic info.`);
             // Use Firestore karma as fallback if API fails
             apiStats.karma = firestoreUserData.karma || 0;
             apiStats.issuesReported = 0; // Default other stats to 0 or fetch basic counts if needed
             apiStats.issuesResolved = 0;
             apiStats.issuesFixed = 0;
             apiStats.co2Saved = 0;
             apiStats.currentRank = 0; // <-- ***CHANGED BACK*** to currentRank
             apiStats.badges = [];
        }

        // --- 3. Update UI with combined/API data ---
        const finalKarma = apiStats.karma ?? firestoreUserData.karma ?? 0; // Prioritize API karma
        const finalRank = apiStats.currentRank || 0; // <-- ***CHANGED BACK*** to currentRank
        const issuesReported = apiStats.issuesReported || 0;
        const issuesResolved = apiStats.issuesResolved || 0; // Citizen stat
        const issuesFixed = apiStats.issuesFixed || 0; // NGO/Volunteer stat
        const co2Saved = apiStats.co2Saved || 0;

        if (karmaValueEl) karmaValueEl.textContent = finalKarma.toLocaleString();
        
        // --- ***CHANGED BACK***: Updated logic to display currentRank ---
        if (rankValueEl) {
            if (finalRank > 0) {
                rankValueEl.textContent = `#${finalRank.toLocaleString()}`;
            } else {
                rankValueEl.textContent = 'N/A';
            }
        }
        // --- End of Change ---

        // Show relevant stats based on user type
        if (firestoreUserData.userType === 'ngo' || firestoreUserData.userType === 'volunteer') {
            if (statReportedEl) statReportedEl.style.display = 'none';
            if (statResolvedEl) statResolvedEl.style.display = 'none';
            if (statFixedEl) {
                statFixedEl.style.display = 'flex'; // Or 'block' depending on CSS
                statFixedEl.querySelector('.stat-value').textContent = issuesFixed.toLocaleString();
            }
        } else { // Citizen
            if (statReportedEl) {
                statReportedEl.style.display = 'flex';
                statReportedEl.querySelector('.stat-value').textContent = issuesReported.toLocaleString();
            }
             if (statResolvedEl) {
                 statResolvedEl.style.display = 'flex';
                 statResolvedEl.querySelector('.stat-value').textContent = issuesResolved.toLocaleString();
            }
            if (statFixedEl) statFixedEl.style.display = 'none';
        }
        if (statCo2El) statCo2El.querySelector('.stat-value').textContent = `${co2Saved.toLocaleString()} kg`;

        // --- 4. Update Badges ---
        let badgesToDisplay = apiStats.badges || [];
        if (badgesToDisplay.length === 0) { // Calculate default badges if API didn't provide any
             badgesToDisplay = calculateDefaultBadges(apiStats, firestoreUserData);
        }
        renderBadges(badgesToDisplay);

        // --- 5. Update Location (using cached context value initially) ---
        if (locationAddressEl) {
            if (firestoreUserData.lastLocation && firestoreUserData.lastLocation.latitude) {
                const { latitude, longitude } = firestoreUserData.lastLocation;
                locationAddressEl.textContent = `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`;
            } else {
                locationAddressEl.textContent = "No location set.";
            }
        }


        // Show content, hide loader
        if (profileContentEl) profileContentEl.style.display = 'block';

    } catch (error) {
        console.error("Error loading user profile:", error);
        showToast(`❌ Error loading profile: ${error.message}`);
        // Show an error state in the UI
        if (usernameEl) usernameEl.textContent = 'Error';

    } finally {
        if (loadingIndicatorEl) loadingIndicatorEl.style.display = 'none';
    }
}

/**
 * Calculates default badges based on stats.
 */
function calculateDefaultBadges(apiStats, firestoreData) {
    const earnedBadges = [];
    const karma = apiStats.karma ?? firestoreData.karma ?? 0;
    const reported = apiStats.issuesReported || 0;
    const resolved = apiStats.issuesResolved || 0; // Citizen stat
    const fixed = apiStats.issuesFixed || 0; // NGO/Volunteer stat

    if (reported >= 1) earnedBadges.push({ title: "First Report" });
    if (reported >= 10) earnedBadges.push({ title: "Reporter" }); // 10+
    if (karma >= 100) earnedBadges.push({ title: "Karma 100+" });
    if (resolved >= 5 || fixed >= 5) earnedBadges.push({ title: "Problem Solver" }); // Combined stat for badge

    // Add more badge logic here...

    return earnedBadges;
}

/**
 * Renders badges into the badge grid.
 */
function renderBadges(badges) {
    if (!badgeGridEl) return;
    badgeGridEl.innerHTML = ''; // Clear previous

    if (!badges || badges.length === 0) {
        badgeGridEl.innerHTML = '<p style="color: var(--grey-text);">No badges earned yet.</p>';
        return;
    }

    badges.forEach(badge => {
        const badgeDiv = document.createElement('div');
        badgeDiv.className = 'badge-item'; // Add class for styling
        // Use a placeholder icon, replace with actual icons later
        const icon = badge.icon || '🏅'; // Default icon
        badgeDiv.innerHTML = `
            <span class="badge-icon">${icon}</span>
            <span class="badge-title">${badge.title}</span>
        `;
        badgeGridEl.appendChild(badgeDiv);
    });
}


/**
 * Handles updating the user's location.
 */
async function handleUpdateLocation() {
    if (locationLoadingEl) locationLoadingEl.style.display = 'inline';
    if (updateLocationBtnEl) updateLocationBtnEl.disabled = true;

    try {
        // --- Replace with your actual web location fetching function ---
        // Example using basic geolocation API:
        if (!navigator.geolocation) {
             throw new Error("Geolocation is not supported by your browser.");
        }

        const position = await new Promise((resolve, reject) => {
             navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
        });

        const { latitude, longitude } = position.coords;
        console.log("Web Geolocation:", latitude, longitude);

        // TODO: Optionally reverse geocode here if needed for address
        const locationData = { latitude, longitude, /* address: 'Fetched Address' */ };

        // --- Update Firestore ---
        // NOTE: Direct Firestore update from client might need specific security rules.
        // A backend endpoint is generally safer.
        if (currentUserId) {
            const userDocRef = doc(db, "users", currentUserId);
            await updateDoc(userDocRef, {
                lastLocation: locationData // Store location object
            });
            showToast("✅ Location updated!");
            if (locationAddressEl) locationAddressEl.textContent = `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`; // Update UI immediately
            // Optionally update context if you have one: updateLastLocation(locationData);
        } else {
             throw new Error("User ID not available for update.");
        }

    } catch (error) {
        console.error("Error updating location:", error);
        let message = "Could not update location.";
        if (error.code === 1) message = "Location permission denied."; // Geolocation specific error code
        else if (error.message) message = error.message;
        showToast(`❌ ${message}`);
    } finally {
        if (locationLoadingEl) locationLoadingEl.style.display = 'none';
        if (updateLocationBtnEl) updateLocationBtnEl.disabled = false;
    }
}

/**
 * Handles saving the updated organization name.
 */
async function handleSaveOrganization() {
    const newName = orgInputEl ? orgInputEl.value.trim() : '';
    if (!newName) {
        showToast("⚠️ Organization name cannot be empty.");
        return;
    }
    if (!currentUserId) {
         showToast("❌ User not identified.");
         return;
    }

    // Disable buttons
    if (saveOrgBtnEl) saveOrgBtnEl.disabled = true;
    if (cancelOrgBtnEl) cancelOrgBtnEl.disabled = true;

    try {
        const userDocRef = doc(db, "users", currentUserId);
        await updateDoc(userDocRef, { organization: newName });

        showToast("✅ Organization updated!");
        firestoreUserData.organization = newName; // Update local state
        if (orgTextEl) orgTextEl.textContent = newName;
        // Hide edit view, show text view
        if (orgEditViewEl) orgEditViewEl.style.display = 'none';
        if (orgTextEl) orgTextEl.style.display = 'block';
        if (editOrgBtnEl) editOrgBtnEl.style.display = 'inline-block'; // Or 'block'

    } catch (error) {
         console.error("Error saving organization:", error);
         showToast(`❌ Failed to save organization: ${error.message}`);
    } finally {
         // Re-enable buttons
        if (saveOrgBtnEl) saveOrgBtnEl.disabled = false;
        if (cancelOrgBtnEl) cancelOrgBtnEl.disabled = false;
    }
}

/**
 * Initializes event listeners for the page.
 */
function initProfileListeners() {
    if (updateLocationBtnEl) {
        updateLocationBtnEl.addEventListener('click', handleUpdateLocation);
    }
    if (editOrgBtnEl) {
        editOrgBtnEl.addEventListener('click', () => {
             if (orgTextEl) orgTextEl.style.display = 'none';
             if (editOrgBtnEl) editOrgBtnEl.style.display = 'none';
             if (orgInputEl) orgInputEl.value = firestoreUserData.organization || ''; // Pre-fill
             if (orgEditViewEl) orgEditViewEl.style.display = 'block';
        });
    }
     if (cancelOrgBtnEl) {
         cancelOrgBtnEl.addEventListener('click', () => {
             if (orgEditViewEl) orgEditViewEl.style.display = 'none';
             if (orgTextEl) orgTextEl.style.display = 'block';
             if (editOrgBtnEl) editOrgBtnEl.style.display = 'inline-block'; // Or 'block'
             // Reset input value to original on cancel
             if (orgInputEl) orgInputEl.value = firestoreUserData.organization || '';
         });
    }
    if (saveOrgBtnEl) {
        saveOrgBtnEl.addEventListener('click', handleSaveOrganization);
    }
}


// --- Main execution block ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize auth first (handles redirects, navbar)
    initializeAuthListener();

    // 2. Initialize standard UI elements
    initThemeToggle();
    initMobileMenu();

    // 3. Get references to all dynamic UI elements ONCE
    profileContentEl = document.getElementById('profile-content');
    loadingIndicatorEl = document.getElementById('loading-indicator');
    avatarInitialEl = document.getElementById('avatar-initial');
    usernameEl = document.getElementById('profile-username');
    emailEl = document.getElementById('profile-email');
    userTypeEl = document.getElementById('profile-user-type');
    karmaValueEl = document.getElementById('profile-karma-value');
    rankValueEl = document.getElementById('profile-rank-value');
    locationAddressEl = document.getElementById('profile-location-address');
    updateLocationBtnEl = document.getElementById('update-location-btn');
    locationLoadingEl = document.getElementById('location-loading');
    orgSectionEl = document.getElementById('organization-section');
    orgTextEl = document.getElementById('organization-text');
    orgEditViewEl = document.getElementById('organization-edit-view');
    orgInputEl = document.getElementById('organization-input');
    editOrgBtnEl = document.getElementById('edit-org-btn');
    saveOrgBtnEl = document.getElementById('save-org-btn');
    cancelOrgBtnEl = document.getElementById('cancel-org-btn');
    statReportedEl = document.getElementById('stat-issues-reported');
    statResolvedEl = document.getElementById('stat-issues-resolved');
    statFixedEl = document.getElementById('stat-issues-fixed');
    statCo2El = document.getElementById('stat-co2-saved');
    badgeGridEl = document.getElementById('badge-grid');

    // 4. Listen for auth state change to load profile
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserId = user.uid;
            try {
                // Get a fresh token for API calls
                currentUserToken = await getIdToken(user, true);
                loadUserProfile(); // Load data now that we have ID and token
            } catch (tokenError) {
                 console.error("Error getting initial token:", tokenError);
                 showToast("Error verifying session. Please try refreshing.");
                 // Handle token error state in UI
                 if (loadingIndicatorEl) loadingIndicatorEl.style.display = 'none';
                 if (usernameEl) usernameEl.textContent = 'Auth Error';
            }
        } else {
            // User is not logged in. Redirect is handled by initializeAuthListener.
            console.log("Profile page: No user found.");
            currentUserId = null;
            currentUserToken = null;
            if (loadingIndicatorEl) loadingIndicatorEl.style.display = 'none'; // Hide loader
            // Optionally display a "Please log in" message instead of redirecting
        }
    });

    // 5. Set up event listeners for buttons
    initProfileListeners();
});


