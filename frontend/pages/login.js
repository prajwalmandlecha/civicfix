// frontend/pages/login.js

import { auth } from '../firebaseConfig.js'; // Adjust path if needed
import { signInWithEmailAndPassword } from "firebase/auth";
import { showToast } from './shared.js'; // Import toast function

// --- ADD THIS BLOCK ---
// Check if user is already logged in
const idToken = localStorage.getItem('firebaseIdToken');
if (idToken) {
  // If logged in, redirect them away from the login page
  console.log("User already logged in, redirecting to feed.");
  window.location.replace('/feed.html'); 
}
// --- END BLOCK ---


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

        try {
            // --- Call Firebase Auth to sign in ---
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log('Login successful:', user.uid);

            // --- Get the ID Token ---
            const idToken = await user.getIdToken();
            console.log('ID Token retrieved.');

            // --- Store the ID Token (e.g., in localStorage) ---
            // This allows other pages to access it for API calls
            localStorage.setItem('firebaseIdToken', idToken);
            localStorage.setItem('userEmail', user.email); // Store email for display maybe

            showToast('✅ Login successful!');

            // Redirect to the feed page
            setTimeout(() => {
                window.location.href = '/feed.html';
            }, 1000); // Shorter delay for login

        } catch (error) {
            console.error('Login failed:', error);
            // Provide user-friendly error messages
            let message = 'Login failed. Please check your credentials.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                 message = 'Invalid email or password.';
            } else if (error.code === 'auth/invalid-email') {
                message = 'Please enter a valid email address.';
            }
            errorMessageElement.textContent = message;
            showToast(`❌ ${message}`);
        }
    });
} else {
    console.error("Login form not found!");
}