import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Same Firebase project as vedatool - shared database
const firebaseConfig = {
  apiKey: "AIzaSyCcQ5i4liAx3SJjprQjahooAuWozmKizZU",
  authDomain: "vedatool.firebaseapp.com",
  projectId: "vedatool",
  storageBucket: "vedatool.firebasestorage.app",
  messagingSenderId: "226720860057",
  appId: "1:226720860057:web:c8345c1cbb472813f83508",
  measurementId: "G-X570F0Y9JJ",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
