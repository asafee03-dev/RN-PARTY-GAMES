// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBxWdCNo8RV0nNT9iGaUR3DswYZ1nbcA34",
  authDomain: "party-games-c1025.firebaseapp.com",
  databaseURL: "https://party-games-c1025-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "party-games-c1025",
  storageBucket: "party-games-c1025.firebasestorage.app",
  messagingSenderId: "182329042940",
  appId: "1:182329042940:web:6e033effe3e94d904bb479",
  measurementId: "G-ZB9EEJB3K7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

// Wait for Firestore to be ready (online)
let firestoreReady = false;
let firestoreReadyResolve = null;
const firestoreReadyPromise = new Promise((resolve) => {
  firestoreReadyResolve = resolve;
});

// Check if Firestore is online
const checkFirestoreReady = async () => {
  try {
    // Try to read from Firestore to check if it's online
    const { doc, getDoc } = await import("firebase/firestore");
    const testDoc = doc(db, "_test", "connection");
    await getDoc(testDoc);
    if (!firestoreReady) {
      firestoreReady = true;
      if (firestoreReadyResolve) {
        firestoreReadyResolve();
      }
    }
  } catch (error) {
    // If error, Firestore might be offline, but we'll still resolve after a timeout
    setTimeout(() => {
      if (!firestoreReady) {
        firestoreReady = true;
        if (firestoreReadyResolve) {
          firestoreReadyResolve();
        }
      }
    }, 1000);
  }
};

// Start checking
checkFirestoreReady();

export const waitForFirestoreReady = async () => {
  if (firestoreReady) {
    return Promise.resolve();
  }
  return firestoreReadyPromise;
};

// Export for use in other files
export { app, db };
export default db;