const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where
} = require('firebase/firestore');

// Web app's Firebase configuration provided by the user
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyA8r4rNFsuVNVbwzlkmk4fbcxG32NI3VTc",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "project-tracer-dcbcc.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "project-tracer-dcbcc",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "project-tracer-dcbcc.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "552013654552",
  appId: process.env.FIREBASE_APP_ID || "1:552013654552:web:de338dae43e3c08b12b16d",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-B4VWPHYPV9"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

console.log(`Connected to Firebase Project: ${firebaseConfig.projectId}`);

module.exports = {
  firebaseApp,
  db,
  firebaseConfig,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where
};
