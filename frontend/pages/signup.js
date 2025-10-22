// frontend/pages/signup.js

// --- Import db (Firestore) and auth ---
import { auth, db } from '../firebaseConfig.js';
import { createUserWithEmailAndPassword } from "firebase/auth";
// --- Import Firestore functions ---
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
// --- Import shared functions AND the new auth listener ---
import { showToast, initThemeToggle, initMobileMenu } from './shared.js'; // Added theme/menu
import { initializeAuthListener } from './auth.js'; // <-- ADD THIS

const signupForm = document.getElementById('signup-form');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const errorMessageElement = document.getElementById('error-message');

if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessageElement.textContent = '';

        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        // --- Validation ---
        if (!name || !email) {
             errorMessageElement.textContent = 'Please fill out all fields.';
             return;
        }
        if (password.length < 6) {
            errorMessageElement.textContent = 'Password must be at least 6 characters long.';
            return;
        }
        if (password !== confirmPassword) {
            errorMessageElement.textContent = 'Passwords do not match.';
            return;
        }

        const submitButton = signupForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Creating account...';

        try {
            // --- Step 1: Create user in Firebase Auth ---
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log('Auth user created:', user.uid);

            // --- Step 2: Create user document in Firestore ---
            const userDocRef = doc(db, "users", user.uid);

            const newUserDoc = {
                name: name,
                email: email,
                userType: "citizen", // Set default userType
                createdAt: serverTimestamp(),
                karma: 0,
                lastLocation: null
            };

            await setDoc(userDocRef, newUserDoc);
            console.log('Firestore user document created:', user.uid);

            showToast('✅ Signup successful! Please log in.');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 1500);

        } catch (error) {
            console.error('Signup failed:', error);
            let message = 'Signup failed. Please try again.';
            if (error.code === 'auth/email-already-in-use') {
                message = 'This email is already registered. Please login.';
            } else if (error.code === 'auth/invalid-email') {
                message = 'Please enter a valid email address.';
            } else if (error.code === 'auth/weak-password') {
                message = 'Password is too weak.';
            }
            errorMessageElement.textContent = message;
            showToast(`❌ ${message}`);
            submitButton.disabled = false;
            submitButton.textContent = 'Create Account';
        }
    });
} else {
    console.error("Signup form not found!");
}

// --- ADD THIS AT THE BOTTOM ---
document.addEventListener('DOMContentLoaded', () => {
  initializeAuthListener(); // Handles redirects if already logged in + navbar
  initThemeToggle();        // Standard setup
  initMobileMenu();         // Standard setup
});