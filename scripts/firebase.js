// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

// ЕДИНЫЙ корректный конфиг
export const firebaseConfig = {
  apiKey: "AIzaSyDQd4RWarTBFUhRqOVihnMg5UwpuK2ctrU",
  authDomain: "amff-b73b0.firebaseapp.com",
  projectId: "amff-b73b0",
  storageBucket: "amff-b73b0.appspot.com",
  messagingSenderId: "66315775040",
  appId: "1:663157540:web:f8030ebc5ab9cbfb6a83a5",
  measurementId: "G-YH6SEVLECN"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// офлайн-кэш (если доступен)
enableIndexedDbPersistence(db).catch(() => {});
