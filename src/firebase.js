// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { doc, getDoc, initializeFirestore } from "firebase/firestore";
import { Platform } from "react-native";

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

// Firestore on the named database "default".
// On iOS/Android the default streaming connection sometimes stalls (often
// after the app was in the background); the SDK then waits ~10s per request
// before falling back, which made creating/joining a room take up to ~20s.
// Long polling avoids that on native. Web keeps the default transport.
const db = initializeFirestore(
  app,
  Platform.OS === 'web' ? {} : { experimentalForceLongPolling: true },
  "default"
);

// Open the connection at startup (while the player types a name), so the
// first create/join doesn't also pay for connecting. Fire-and-forget: nothing
// waits on it (rules deny this path, so it fails fast once connected).
getDoc(doc(db, "_test", "connection")).catch(() => {});

// Export for use in other files
export { app, db };
export default db;