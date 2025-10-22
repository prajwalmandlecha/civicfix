// frontend/pages/ngo_login.js
import { auth, db } from '../firebaseConfig.js'; // --- ADD db ---
import { signInWithEmailAndPassword } from "firebase/auth";
// --- ADD getDoc and doc ---
import { doc, getDoc } from "firebase/firestore";
import { showToast, initThemeToggle, initMobileMenu } from './shared.js';
import { initializeAuthListener } from './auth.js';

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessageElement = document.getElementById('error-message');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessageElement.textContent = '';

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            errorMessageElement.textContent = 'Please enter both email and password.';
            return;
        }
        
        const submitButton = loginForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Logging in...';

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log('NGO Login successful:', user.uid);

            const idToken = await user.getIdToken();
            console.log('ID Token retrieved.');

            // --- NEW: Get userType from Firestore ---
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            let userType = "ngo"; // Default
            if (userDoc.exists()) {
                userType = userDoc.data().userType || "ngo";
            }
            console.log('UserType found:', userType);
            // --- END NEW BLOCK ---

            localStorage.setItem('firebaseIdToken', idToken);
            localStorage.setItem('userEmail', user.email);
            localStorage.setItem('userType', userType); // <-- ADD THIS

            showToast('✅ NGO Login successful!');

            // Check for a redirect page, default to feed
            const redirectUrl = localStorage.getItem('redirectAfterLogin') || '/feed.html';
            localStorage.removeItem('redirectAfterLogin'); // Clear it

            setTimeout(() => {
                window.location.href = redirectUrl; // Redirect
            }, 1000);

        } catch (error) {
            console.error('NGO Login failed:', error);
            let message = 'Login failed. Please check your credentials.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                 message = 'Invalid email or password.';
            }
            errorMessageElement.textContent = message;
            showToast(`❌ ${message}`);
            
            submitButton.disabled = false;
            submitButton.textContent = 'Login';
        }
    });
} else {
    console.error("NGO Login form not found!");
}

// --- ADD THIS AT THE BOTTOM ---
document.addEventListener('DOMContentLoaded', () => {
    initializeAuthListener(); // Handles redirects if already logged in + navbar
    initThemeToggle();
    initMobileMenu();
});