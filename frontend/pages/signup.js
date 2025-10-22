// frontend/pages/signup.js

// --- Import db (Firestore) and auth ---
import { auth, db } from '../firebaseConfig.js';
import { createUserWithEmailAndPassword } from "firebase/auth";
// --- Import Firestore functions ---
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { showToast } from './shared.js';

const signupForm = document.getElementById('signup-form');
// --- Get new "name" input ---
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const errorMessageElement = document.getElementById('error-message');

if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessageElement.textContent = '';

        // --- Read new "name" value ---
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

        // --- Disable button during signup ---
        const submitButton = signupForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Creating account...';

        try {
            // --- Step 1: Create user in Firebase Auth ---
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log('Auth user created:', user.uid);

            // --- Step 2: Create user document in Firestore ---
            // Create a reference to the new document in 'users' collection using the user's UID
            const userDocRef = doc(db, "users", user.uid);

            // Define the data for the new user document
            const newUserDoc = {
                name: name,
                email: email,
                userType: "citizen", // Set default userType
                createdAt: serverTimestamp(), // Add a server timestamp
                karma: 0, // Initialize karma
                lastLocation: null // Initialize location
            };

            // Set the document in Firestore
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
            // Re-enable button on failure
            submitButton.disabled = false;
            submitButton.textContent = 'Create Account';
        }
    });
} else {
    console.error("Signup form not found!");
}