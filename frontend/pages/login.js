// frontend/pages/login.js
import { auth, db } from "../firebaseConfig.js"; // --- ADD db ---
import { signInWithEmailAndPassword } from "firebase/auth";
// --- ADD getDoc and doc ---
import { doc, getDoc } from "firebase/firestore";
import { showToast, initThemeToggle, initMobileMenu } from "./shared.js";
import { initializeAuthListener } from "./auth.js";

const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorMessageElement = document.getElementById("error-message");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorMessageElement.textContent = "";

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      errorMessageElement.textContent = "Please enter both email and password.";
      return;
    }

    // --- Disable button on submit ---
    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Logging in...";

    try {
      // --- Call Firebase Auth to sign in ---
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;
      console.log("Login successful:", user.uid);

      // --- Get the ID Token ---
      const idToken = await user.getIdToken();
      console.log("ID Token retrieved.");

      // --- NEW: Get userType from Firestore ---
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      let userType = "citizen"; // Default
      if (userDoc.exists()) {
        userType = userDoc.data().userType || "citizen";
      }
      console.log("UserType found:", userType);
      // --- END NEW BLOCK ---

      // --- Store the ID Token AND userType ---
      localStorage.setItem("firebaseIdToken", idToken);
      localStorage.setItem("userEmail", user.email);
      localStorage.setItem("userType", userType); // <-- ADD THIS

      showToast("✅ Login successful!");

      // --- NEW: Check for a redirect page ---
      const redirectUrl =
        localStorage.getItem("redirectAfterLogin") || "/feed.html";
      localStorage.removeItem("redirectAfterLogin"); // Clear it after use

      setTimeout(() => {
        window.location.href = redirectUrl; // Redirect to feed or intended page
      }, 1000);
    } catch (error) {
      console.error("Login failed:", error);
      let message = "Login failed. Please check your credentials.";
      if (
        error.code === "auth/user-not-found" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/invalid-credential"
      ) {
        message = "Invalid email or password.";
      } else if (error.code === "auth/invalid-email") {
        message = "Please enter a valid email address.";
      }
      errorMessageElement.textContent = message;
      showToast(`❌ ${message}`);

      // Re-enable button on failure
      submitButton.disabled = false;
      submitButton.textContent = "Login";
    }
  });
} else {
  console.error("Login form not found!");
}

// --- ADD THIS AT THE BOTTOM ---
document.addEventListener("DOMContentLoaded", () => {
  // This will handle redirects if user is already logged in
  // and set up the navbar.
  initializeAuthListener();
  initThemeToggle();
  initMobileMenu();
});
