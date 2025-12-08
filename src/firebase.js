// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

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

// Initialize Realtime Database and get a reference to the service
const database = getDatabase(app);

// Export for use in other files
export { app, database };
export default database;