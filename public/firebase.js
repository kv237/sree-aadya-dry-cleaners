// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDcHCOVKKyq4tL9Wvp28hEd-W9Vrl5PBRA",
  authDomain: "sree-aadya-dry-cleaners-ec791.firebaseapp.com",
  databaseURL: "https://sree-aadya-dry-cleaners-ec791-default-rtdb.firebaseio.com",
  projectId: "sree-aadya-dry-cleaners-ec791",
  storageBucket: "sree-aadya-dry-cleaners-ec791.firebasestorage.app",
  messagingSenderId: "726289161499",
  appId: "1:726289161499:web:0fbf79769b4a66b9ee07be",
  measurementId: "G-ZL08672KFF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);