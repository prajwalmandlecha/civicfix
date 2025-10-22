// frontend/pages/auth.js
import { auth } from '../firebaseConfig.js';
import { onAuthStateChanged, signOut } from "firebase/auth";
import { showToast } from './shared.js';

/**
 * Checks auth state on EVERY page load.
 * Manages redirects for protected pages and updates the navbar.
 */
export function initializeAuthListener() {
    const publicPages = ['/', '/index.html', '/login.html', '/signup.html', '/ngo_login.html', '/ngo_signup.html'];
    const currentPage = window.location.pathname;
    const isProtectedPage = !publicPages.includes(currentPage);
    
    const idToken = localStorage.getItem('firebaseIdToken');
    // --- MODIFIED: Get userType from localStorage ---
    const userType = localStorage.getItem('userType');

    // 1. Handle protected pages
    if (isProtectedPage && !idToken) {
        console.log("No token, redirecting from protected page...");
        // Save the page they were trying to access
        localStorage.setItem('redirectAfterLogin', currentPage);
        // Redirect to the main login page
        window.location.replace('/login.html');
        return; // Stop further execution
    }

    // 2. Handle auth pages (if user is already logged in)
    if (!isProtectedPage && idToken) {
         // Don't redirect from index.html, only login/signup
        if (currentPage.includes('login') || currentPage.includes('signup')) {
            console.log("Already logged in, redirecting from auth page...");
            window.location.replace('/feed.html');
            return;
        }
    }
    
    // 3. Update UI based on auth state
    // We use onAuthStateChanged to get the current user state
    onAuthStateChanged(auth, (user) => {
        const navMenu = document.getElementById('nav-menu');
        if (!navMenu) return; // Not on a page with a nav menu

        if (user) {
            // User IS logged in
            // Remove Login/Signup
            removeNavLinks(['/login.html', '/signup.html', '/ngo_login.html', '/ngo_signup.html']);
            
            // --- MODIFIED: Add role-specific links ---
            if (userType === 'ngo') {
                // NGO Navbar
                addNavLinks([
                    { href: '/feed.html', text: '📰 StreetFeed' },
                    { href: '/ngo_upload.html', text: '🔧 Upload Fix' }, // NGO Link
                    { href: '/leaderboard.html', text: '🏆 Leaderboard' },
                    { href: '/profile.html', text: '👤 Profile' },
                    { href: '#', text: '🚪 Logout', id: 'logout-button' }
                ]);
            } else {
                // Citizen Navbar (default)
                addNavLinks([
                    { href: '/feed.html', text: '📰 StreetFeed' },
                    { href: '/map.html', text: '🗺️ StreetHeat' },
                    { href: '/upload.html', text: '📸 Upload' }, // Citizen Link
                    { href: '/leaderboard.html', text: '🏆 Leaderboard' },
                    { href: '/profile.html', text: '👤 Profile' },
                    { href: '#', text: '🚪 Logout', id: 'logout-button' }
                ]);
            }
            // --- END MODIFICATION ---

        } else {
            // User is NOT logged in
            // Remove Profile/Logout, add Login/Signup
            removeNavLinks(['/profile.html', '/upload.html', '/ngo_upload.html', '/map.html', '/feed.html', '/leaderboard.html']);
            addNavLinks([
                { href: '/feed.html', text: '📰 StreetFeed' },
                { href: '/map.html', text: '🗺️ StreetHeat' },
                { href: '/leaderboard.html', text: '🏆 Leaderboard' },
                { href: '/login.html', text: 'Citizen Login' },
                { href: '/ngo_login.html', text: 'NGO Login' }
            ]);
        }
    });
}

function addNavLinks(links) {
    const navMenu = document.getElementById('nav-menu');
    if (!navMenu) return;

    // --- MODIFIED: Clear existing links first to prevent duplication ---
    const existingLinks = navMenu.querySelectorAll("li > a.nav-link");
    const linksToKeep = ['/']; // Keep the logo, etc.
    existingLinks.forEach(link => {
        if (!linksToKeep.includes(link.getAttribute('href'))) {
            link.closest('li').remove();
        }
    });
    // --- END MODIFICATION ---

    links.forEach(link => {
        // Check if link already exists
        if (navMenu.querySelector(`a[href="${link.href}"]`)) return;

        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = link.href;
        a.textContent = link.text;
        a.className = 'nav-link';
        if (link.id) a.id = link.id;

        // --- MODIFIED: Set active class ---
        if (window.location.pathname === link.href) {
            a.classList.add('active');
        }
        // --- END MODIFICATION ---
        
        li.appendChild(a);
        navMenu.appendChild(li);

        if (link.id === 'logout-button') {
            a.addEventListener('click', handleLogout);
        }
    });
}

function removeNavLinks(hrefs) {
    const navMenu = document.getElementById('nav-menu');
    if (!navMenu) return;
    
    hrefs.forEach(href => {
        const link = navMenu.querySelector(`a[href="${href}"]`);
        if (link) {
            link.closest('li').remove(); // Remove the entire <li> list item
        }
    });
}

async function handleLogout(e) {
    e.preventDefault();
    try {
        await signOut(auth);
        localStorage.removeItem('firebaseIdToken');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userType'); // <-- ADD THIS
        showToast('✅ Logged out successfully.');
        // Redirect to home page after logout
        setTimeout(() => window.location.replace('/'), 1000);
    } catch (error) {
        console.error("Error logging out: ", error);
        showToast('❌ Logout failed.');
    }
}