// 🔹 Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { getFirestore, doc, setDoc } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Custom alert function for styled notifications
function showNotification(message, type = 'error') {
  // Remove existing notification if any
  const existing = document.querySelector('.error-box');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = `error-box ${type}`;
  
  notification.innerHTML = `
    <div class="error-box-content">
      <span class="error-icon">${type === 'error' ? '✖' : '✓'}</span>
      <span class="error-message">${message}</span>
    </div>
    <button class="error-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  document.body.appendChild(notification);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }
  }, 3000);
}

// 🔹 Your Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyAFNZ5sVDgoBwth_BtIZWY26QcnqzjX5n0",
  authDomain: "simple-chatapp-faaa1.firebaseapp.com",
  projectId: "simple-chatapp-faaa1",
  storageBucket: "simple-chatapp-faaa1.firebasestorage.app",
  messagingSenderId: "985124598187",
  appId: "1:985124598187:web:7bcf12e95996d0c249e2ee"
};

// 🔥 Init Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// 🔹 SIGNUP
window.signup = async function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const username = document.getElementById("username").value;

  if (!username || !email || !password) {
    return showNotification("Please fill in all fields", "error");
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
      username: username,
      email: email
    });

    showNotification("Signup successful!", "success");
    setTimeout(() => {
      navigateTo("chat.html");
    }, 1000);
  } catch (error) {
    let errorMessage = "Signup failed";
    
    if (error.code === 'auth/email-already-in-use') {
      errorMessage = "Email already in use";
    } else if (error.code === 'auth/weak-password') {
      errorMessage = "Password should be at least 6 characters";
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = "Invalid email address";
    }
    
    showNotification(errorMessage, "error");
  }
};

// 🔹 LOGIN
window.login = async function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  if (!email || !password) {
    return showNotification("Please enter email and password", "error");
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    
    showNotification("Login successful!", "success");
    
    // ✅ redirect to chat page
    setTimeout(() => {
      navigateTo("chat.html");
    }, 1000);
  } catch (error) {
    let errorMessage = "Login failed";
    
    if (error.code === 'auth/user-not-found') {
      errorMessage = "User not found";
    } else if (error.code === 'auth/wrong-password') {
      errorMessage = "Wrong password";
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = "Invalid email address";
    } else if (error.code === 'auth/invalid-credential') {
      errorMessage = "Invalid email or password";
    }
    
    showNotification(errorMessage, "error");
  }
};