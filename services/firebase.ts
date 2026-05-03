// services/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth }       from 'firebase/auth';
import { getFirestore }  from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            "AIzaSyCZYGqBXRBD5uKCHpBfUXkLc18D-HJJ-zk",
  authDomain:        "fitness-dd1ab.firebaseapp.com",
  projectId:         "fitness-dd1ab",
  storageBucket:     "fitness-dd1ab.firebasestorage.app",
  messagingSenderId: "332377829269",
  appId:             "1:332377829269:web:e795b227ef5a3a354f909c",
  measurementId:     "G-552NJCLCM1",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
export default app;