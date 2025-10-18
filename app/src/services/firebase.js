// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAZb6MJuRZewP5d-bNlbRY6KGq6Jxwp8Dw",
  authDomain: "civicfix-9134e.firebaseapp.com",
  projectId: "civicfix-9134e",
  storageBucket: "civicfix-9134e.firebasestorage.app",
  messagingSenderId: "809772291217",
  appId: "1:809772291217:web:33609f318e2dce05c99b30",
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const firestore = getFirestore(app);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
