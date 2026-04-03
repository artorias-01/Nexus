import { auth, db, storage } from "./script.js";

import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  doc,
  getDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { onAuthStateChanged, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

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

// Handle initialization when DOM is ready
let isInitialized = false;

document.addEventListener('DOMContentLoaded', function() {

  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    console.log("Adding file input handler");
    fileInput.addEventListener('change', handleFileSelect);
  }

  // Enter key handler for message input
  const messageInput = document.getElementById('message');
  if (messageInput) {
    console.log("Adding Enter key handler");
    messageInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        console.log("Enter key pressed");
        e.preventDefault();
        sendMessage();
      }
    });
    
    // Typing indicator
    messageInput.addEventListener('input', function() {
      setTypingStatus(true);
      
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        setTypingStatus(false);
      }, 2000);
    });
  }
});

async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  console.log("File selected:", file.name, "Size:", file.size, "Type:", file.type);

  if (!currentRoomId) {
    showNotification("Please join a room first", "error");
    return;
  }

  // Check file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    showNotification("File too large (max 10MB)", "error");
    event.target.value = '';
    return;
  }

  showNotification("Uploading file...", "success");

  try {
    console.log("Storage object:", storage);
    
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name}`;
    const storageRef = ref(storage, `chat-files/${currentRoomId}/${fileName}`);
    
    console.log("Storage ref created:", storageRef);

    console.log("Starting upload...");
    const uploadResult = await uploadBytes(storageRef, file);
    console.log("Upload complete:", uploadResult);
    
    console.log("Getting download URL...");
    const downloadURL = await getDownloadURL(storageRef);
    console.log("Download URL:", downloadURL);

    const fileType = file.type.startsWith('image/') ? 'image' :
                     file.type.startsWith('video/') ? 'video' : 'file';

    console.log("Saving to Firestore...");
    await addDoc(collection(db, "messages"), {
      text: file.name,
      sender: auth.currentUser.uid,
      roomId: currentRoomId,
      timestamp: serverTimestamp(),
      fileURL: downloadURL,
      fileType: fileType,
      fileName: file.name
    });

    console.log("File message saved successfully!");
    showNotification("File sent successfully!", "success");
    event.target.value = '';
  } catch (error) {
    console.error("Upload error details:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    
    let errorMsg = "Failed to upload file";
    
    if (error.code === 'storage/unauthorized') {
      errorMsg = "Upload failed: Storage permissions not configured";
    } else if (error.code === 'storage/canceled') {
      errorMsg = "Upload canceled";
    } else if (error.code === 'storage/unknown') {
      errorMsg = "Upload failed: " + error.message;
    }
    
    showNotification(errorMsg, "error");
    event.target.value = '';
  }
}

window.searchRooms = async function () {
  const search = document.getElementById("searchRoom").value;
  const resultsDiv = document.getElementById("roomResults");

  const q = query(collection(db, "rooms"), where("name", ">=", search));

  const snapshot = await getDocs(q);

  resultsDiv.innerHTML = "";

  if (snapshot.empty) {
    showNotification("No rooms found", "error");
    return;
  }

  snapshot.forEach(docSnap => {
    const data = docSnap.data();

    const div = document.createElement("div");
    div.textContent = data.name;

    resultsDiv.appendChild(div);
  });
};

let currentRoomId = null;
let unsubscribeMessages = null;
let isListenerActive = false;

// 🔹 RECENT ROOMS
function getRecentKey() {
  return auth.currentUser ? `recentRooms_${auth.currentUser.uid}` : null;
}

function saveRecentRoom(id, name, password) {
  const key = getRecentKey();
  if (!key) return;
  let recent = JSON.parse(localStorage.getItem(key) || '[]');
  recent = recent.filter(r => r.id !== id);
  recent.unshift({ id, name, password });
  recent = recent.slice(0, 5);
  localStorage.setItem(key, JSON.stringify(recent));
  renderRecentRooms();
}

function renderRecentRooms() {
  const key = getRecentKey();
  const recent = key ? JSON.parse(localStorage.getItem(key) || '[]') : [];
  const container = document.getElementById('recentRoomsSection');
  const list = document.getElementById('recentRoomsList');
  if (!container || !list) return;

  if (!recent.length) { container.style.display = 'none'; return; }

  container.style.display = 'block';
  list.innerHTML = '';
  recent.forEach(r => {
    const div = document.createElement('div');
    div.className = 'recent-room-item';
    div.innerHTML = `
      <span class="recent-room-name">${r.name}</span>
      <button class="recent-room-join" onclick="joinRecentRoom('${r.id}','${r.name}','${r.password}')">Join</button>
    `;
    list.appendChild(div);
  });
}

window.joinRecentRoom = async function(id, name, password) {
  // Verify room still exists
  const roomDoc = await getDoc(doc(db, "rooms", id));
  if (!roomDoc.exists()) {
    showNotification("Room no longer exists", "error");
    // Remove from recent
    let recent = JSON.parse(localStorage.getItem('recentRooms') || '[]');
    localStorage.setItem('recentRooms', JSON.stringify(recent.filter(r => r.id !== id)));
    renderRecentRooms();
    return;
  }

  currentRoomId = id;
  document.getElementById("roomSection").style.display = "none";
  
  
  const recent = document.getElementById("recentRoomsSection");
  if (recent) recent.style.display = "none";
  document.getElementById("chatBox").style.display = "block";
  document.getElementById("roomNameDisplay").textContent = name;

  showNotification(`Rejoined ${name}!`, "success");

  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; isListenerActive = false; }

  loadMessages();
  listenForTyping();
  listenForOnlineUsers();
};

window.createRoom = async function () {
  const name = document.getElementById("roomName").value;
  const password = document.getElementById("roomPassword").value;

  if (!name || !password) return showNotification("Please enter room name and password", "error");

  // Check if room with same name already exists
  const existing = await getDocs(query(collection(db, "rooms"), where("name", "==", name)));
  if (!existing.empty) {
    return showNotification("A room with that name already exists", "error");
  }

  const roomRef = doc(collection(db, "rooms"));

  await setDoc(roomRef, {
    name: name,
    password: password
  });

  currentRoomId = roomRef.id;

  document.getElementById("roomSection").style.display = "none";
  
  
  document.getElementById("chatBox").style.display = "block";
  document.getElementById("roomNameDisplay").textContent = name;

  showNotification("Room created successfully!", "success");
  saveRecentRoom(roomRef.id, name, password);
  
  if (unsubscribeMessages) {
    console.log("Cleaning up previous listener before creating room");
    unsubscribeMessages();
    unsubscribeMessages = null;
    isListenerActive = false;
  }
  
  loadMessages();
  listenForTyping();
  listenForOnlineUsers();
};

window.joinRoom = async function () {
  const name = document.getElementById("roomName").value;
  const password = document.getElementById("roomPassword").value;

  const q = query(collection(db, "rooms"), where("name", "==", name));

  const snapshot = await getDocs(q);

  if (snapshot.empty) return showNotification("Room not found", "error");

  const room = snapshot.docs[0];
  const data = room.data();

  if (data.password !== password) {
    return showNotification("Wrong password", "error");
  }

  currentRoomId = room.id;

  document.getElementById("roomSection").style.display = "none";
  
  
  document.getElementById("chatBox").style.display = "block";
  document.getElementById("roomNameDisplay").textContent = name;

  showNotification("Joined room successfully!", "success");
  saveRecentRoom(room.id, name, password);
  
  if (unsubscribeMessages) {
    console.log("Cleaning up previous listener before joining room");
    unsubscribeMessages();
    unsubscribeMessages = null;
    isListenerActive = false;
  }
  
  loadMessages();
  listenForTyping();
  listenForOnlineUsers();
};

// 🔹 ONLINE STATUS TRACKING
async function setUserOnlineStatus(isOnline) {
  if (!auth.currentUser) return;
  
  try {
    await setDoc(doc(db, "users", auth.currentUser.uid), {
      online: isOnline,
      lastSeen: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("Online status error:", error);
  }
}

// 🔥 CHECK LOGIN
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    navigateTo("index.html");
  } else {
    await setUserOnlineStatus(true);
    await loadUserProfile();
    renderRecentRooms(); // load per-user recent rooms after login confirmed
    
    window.addEventListener('beforeunload', () => {
      setUserOnlineStatus(false);
    });
    
    setInterval(() => {
      setUserOnlineStatus(true);
    }, 30000);
  }
});

// 🔹 LOGOUT FUNCTION
window.logout = async function () {
  try {
    if (unsubscribeMessages) {
      unsubscribeMessages();
    }
    
    await setUserOnlineStatus(false);
    await signOut(auth);
    showNotification("Logged out successfully!", "success");
    
    setTimeout(() => {
      navigateTo("index.html");
    }, 1000);
  } catch (error) {
    showNotification("Logout failed", "error");
  }
};

// 🔹 PROFILE MENU FUNCTIONS
window.toggleProfileMenu = function() {
  const menu = document.getElementById('profileMenu');
  menu.classList.toggle('active');
  
  if (menu.classList.contains('active')) {
    loadUserProfile();
  }
};

document.addEventListener('click', function(e) {
  const profileContainer = document.querySelector('.profile-container');
  const menu = document.getElementById('profileMenu');
  
  if (profileContainer && !profileContainer.contains(e.target) && menu) {
    menu.classList.remove('active');
  }
});

async function loadUserProfile() {
  if (!auth.currentUser) return;
  
  try {
    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      
      document.getElementById('profileUsername').textContent = userData.username || 'User';
      document.getElementById('profileEmail').textContent = userData.email || auth.currentUser.email;
      
      const profilePicUrl = userData.profilePic || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23333" width="100" height="100"/><text x="50%" y="50%" font-size="50" text-anchor="middle" dy=".3em" fill="white">👤</text></svg>';
      document.getElementById('profilePic').src = profilePicUrl;
      document.getElementById('profilePicLarge').src = profilePicUrl;
      
      // Show online indicator
      const onlineIndicator = document.querySelector('.online-indicator');
      if (onlineIndicator) {
        onlineIndicator.style.display = userData.online ? 'block' : 'none';
      }
    }
  } catch (error) {
    console.error("Error loading profile:", error);
  }
}

window.openProfilePicModal = function() {
  document.getElementById('profilePicModal').classList.add('active');
  document.getElementById('profileMenu').classList.remove('active');
};

window.openPasswordModal = function() {
  document.getElementById('passwordModal').classList.add('active');
  document.getElementById('profileMenu').classList.remove('active');
};

window.openThemeModal = function() {
  document.getElementById('themeModal').classList.add('active');
  document.getElementById('profileMenu').classList.remove('active');
};

window.closeModal = function(modalId) {
  document.getElementById(modalId).classList.remove('active');
};

// 🔹 HANDLE LOCAL PROFILE PIC FILE
let pendingProfilePicData = null;

window.handleProfilePicFile = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    showNotification("Image too large (max 2MB)", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    pendingProfilePicData = e.target.result; // base64 data URL
    // Show preview
    const preview = document.getElementById('profilePicPreview');
    const previewImg = document.getElementById('profilePicPreviewImg');
    previewImg.src = pendingProfilePicData;
    preview.style.display = 'block';
    // Clear URL input
    document.getElementById('profilePicUrl').value = '';
  };
  reader.readAsDataURL(file);
};

// 🔹 SAVE PROFILE PICTURE (URL or local file)
window.saveProfilePic = async function() {
  let imageData = pendingProfilePicData;

  // If no file selected, try URL
  if (!imageData) {
    const url = document.getElementById('profilePicUrl').value.trim();
    if (!url) { showNotification("Please select an image or paste a URL", "error"); return; }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      showNotification("Please enter a valid URL", "error"); return;
    }
    imageData = url;
  }

  try {
    await setDoc(doc(db, "users", auth.currentUser.uid), {
      profilePic: imageData
    }, { merge: true });

    document.getElementById('profilePic').src = imageData;
    document.getElementById('profilePicLarge').src = imageData;

    showNotification("Profile picture updated!", "success");
    closeModal('profilePicModal');

    // Reset
    pendingProfilePicData = null;
    document.getElementById('profilePicUrl').value = '';
    document.getElementById('profilePicPreview').style.display = 'none';
    document.getElementById('profilePicFile').value = '';
  } catch (error) {
    showNotification("Failed to update profile picture", "error");
  }
};

// 🔹 CHANGE PASSWORD
window.changePassword = async function() {
  const currentPwd = document.getElementById('currentPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const confirmPwd = document.getElementById('confirmPassword').value;
  
  if (!currentPwd || !newPwd || !confirmPwd) {
    showNotification("Please fill all fields", "error");
    return;
  }
  
  if (newPwd !== confirmPwd) {
    showNotification("Passwords don't match", "error");
    return;
  }
  
  if (newPwd.length < 6) {
    showNotification("Password must be at least 6 characters", "error");
    return;
  }
  
  try {
    const credential = EmailAuthProvider.credential(
      auth.currentUser.email,
      currentPwd
    );
    await reauthenticateWithCredential(auth.currentUser, credential);
    
    await updatePassword(auth.currentUser, newPwd);
    
    showNotification("Password changed successfully!", "success");
    closeModal('passwordModal');
    
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
  } catch (error) {
    console.error("Password change error:", error);
    
    if (error.code === 'auth/wrong-password') {
      showNotification("Current password is incorrect", "error");
    } else {
      showNotification("Failed to change password", "error");
    }
  }
};

// 🔹 SET THEME
window.setTheme = function(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('chat-theme', theme);
  showNotification(`${theme.charAt(0).toUpperCase() + theme.slice(1)} theme applied!`, "success");
  closeModal('themeModal');
};

const savedTheme = localStorage.getItem('chat-theme');
if (savedTheme) {
  document.body.setAttribute('data-theme', savedTheme);
}

const roomId = "room1";

// 🔹 SEND MESSAGE
let isSending = false;

window.sendMessage = async function () {
  console.log("sendMessage called, isSending:", isSending);
  
  if (isSending) return;

  const messageInput = document.getElementById("message");
  const message = messageInput.value.trim();
  if (!message) return;

  isSending = true;
  messageInput.disabled = true;
  animateSendBtn();

  try {
    const msgData = {
      text: message,
      sender: auth.currentUser.uid,
      roomId: currentRoomId,
      timestamp: serverTimestamp()
    };

    // Attach reply if set
    if (replyingTo) {
      msgData.replyTo = {
        messageId: replyingTo.messageId,
        sender: replyingTo.sender,
        text: replyingTo.text
      };
      cancelReply();
    }

    await addDoc(collection(db, "messages"), msgData);
    messageInput.value = "";
    setTypingStatus(false);
  } catch (error) {
    showNotification("Failed to send message", "error");
  } finally {
    isSending = false;
    messageInput.disabled = false;
    messageInput.focus();
  }
};

// 🔹 DELETE MESSAGE
let pendingDeleteId = null;

window.deleteMessage = function(messageId) {
  pendingDeleteId = messageId;
  document.getElementById('deleteModal').classList.add('active');
};

window.confirmDelete = async function() {
  if (!pendingDeleteId) return;
  closeModal('deleteModal');
  try {
    await deleteDoc(doc(db, "messages", pendingDeleteId));
    const el = document.querySelector(`[data-message-id="${pendingDeleteId}"]`);
    if (el) {
      el.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => el.remove(), 300);
    }
    showNotification("Message deleted", "success");
  } catch (error) {
    showNotification("Failed to delete message", "error");
  }
  pendingDeleteId = null;
};

// 🔹 TYPING INDICATOR
let typingTimeout = null;

function setTypingStatus(isTyping) {
  if (!currentRoomId || !auth.currentUser) return;
  
  setDoc(doc(db, "typing", `${currentRoomId}_${auth.currentUser.uid}`), {
    username: auth.currentUser.displayName || "User",
    typing: isTyping,
    timestamp: serverTimestamp()
  }, { merge: true });
}

function listenForOnlineUsers() {
  if (!currentRoomId) return;

  const bar = document.getElementById("onlineUsersBar");
  if (!bar) return;

  // Poll every 30s — checks lastSeen within last 2 minutes
  async function refreshOnlineUsers() {
    const snapshot = await getDocs(collection(db, "users"));
    const now = Date.now();
    const TWO_MINUTES = 2 * 60 * 1000;

    const onlineUsers = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.lastSeen) {
        const lastSeen = data.lastSeen.toMillis ? data.lastSeen.toMillis() : data.lastSeen;
        if (now - lastSeen < TWO_MINUTES) {
          onlineUsers.push(data);
        }
      }
    });

    const defaultAvatar = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect fill='%23222' width='100' height='100'/><text x='50%25' y='50%25' font-size='50' text-anchor='middle' dy='.3em' fill='white'>👤</text></svg>`;

    bar.innerHTML = `<span class="online-users-label">Online · ${onlineUsers.length}</span>`;

    onlineUsers.forEach((data) => {
      const avatar = data.profilePic || defaultAvatar;
      const name = data.username || "User";
      const chip = document.createElement("div");
      chip.className = "online-user-chip";
      chip.innerHTML = `
        <span class="online-user-dot"></span>
        <img class="online-user-avatar" src="${avatar}" onerror="this.src='${defaultAvatar}'" alt="${name}">
        <span class="online-user-name">${name}</span>
      `;
      bar.appendChild(chip);
    });
  }

  refreshOnlineUsers();
  setInterval(refreshOnlineUsers, 30000);
}

function listenForTyping() {
  if (!currentRoomId) return;
  
  const typingQuery = query(
    collection(db, "typing"),
    where("typing", "==", true)
  );
  
  onSnapshot(typingQuery, (snapshot) => {
    const typingUsers = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      const docId = doc.id;
      
      if (docId.startsWith(currentRoomId + "_") && !docId.includes(auth.currentUser.uid)) {
        typingUsers.push(data.username);
      }
    });
    
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
      if (typingUsers.length > 0) {
        typingIndicator.textContent = `${typingUsers[0]} is typing...`;
        typingIndicator.style.display = 'block';
      } else {
        typingIndicator.style.display = 'none';
      }
    }
  });
}

// 🔹 EMOJI PICKER
const emojis = ['😊', '😂', '❤️', '👍', '🎉', '🔥', '✨', '💯', '🙌', '👏', '😍', '🤔', '😎', '🚀', '💪', '🎯', '⭐', '💡', '🌟', '🎊'];

window.toggleEmojiPicker = function() {
  let picker = document.getElementById('emojiPicker');
  
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'emojiPicker';
    picker.className = 'emoji-picker';
    
    emojis.forEach(emoji => {
      const btn = document.createElement('button');
      btn.textContent = emoji;
      btn.className = 'emoji-item';
      btn.onclick = () => insertEmoji(emoji);
      picker.appendChild(btn);
    });
    
    document.querySelector('.message-input-container').appendChild(picker);
  }
  
  picker.style.display = picker.style.display === 'none' || !picker.style.display ? 'grid' : 'none';
};

function insertEmoji(emoji) {
  const messageInput = document.getElementById('message');
  messageInput.value += emoji;
  messageInput.focus();
}

document.addEventListener('click', function(e) {
  const picker = document.getElementById('emojiPicker');
  const emojiBtn = e.target.closest('.emoji-btn-trigger');
  
  if (picker && picker.style.display === 'grid' && !picker.contains(e.target) && !emojiBtn) {
    picker.style.display = 'none';
  }
});

// 🔹 BACKUP TO DEVICE (browser download, no Java needed)
window.backupToDevice = async function () {
  if (!currentRoomId) return showNotification("Please join a room first", "error");
  if (!auth.currentUser) return showNotification("Not logged in", "error");

  showNotification("Preparing backup...", "success");

  try {
    const q = query(
      collection(db, "messages"),
      where("roomId", "==", currentRoomId),
      orderBy("timestamp", "asc")
    );
    const snapshot = await getDocs(q);

    const userCache = {};
    for (const docSnap of snapshot.docs) {
      const sid = docSnap.data().sender;
      if (!userCache[sid]) {
        const u = await getDoc(doc(db, "users", sid));
        userCache[sid] = u.exists() ? u.data().username : sid;
      }
    }

    const messages = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id:        d.id,
        sender:    userCache[data.sender] || data.sender,
        text:      data.text || "",
        timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : "",
        fileURL:   data.fileURL  || "",
        fileType:  data.fileType || "",
        fileName:  data.fileName || ""
      };
    });

    const meDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    const myUsername = meDoc.exists() ? meDoc.data().username : auth.currentUser.email;
    const roomDisplay = document.getElementById("roomNameDisplay").textContent || currentRoomId;

    // Build readable .txt transcript
    const line = "─".repeat(60);
    let txt = `${"═".repeat(60)}\n  CHAT TRANSCRIPT\n${"═".repeat(60)}\n`;
    txt += `  Room       : ${roomDisplay}\n`;
    txt += `  Exported by: ${myUsername}\n`;
    txt += `  Exported at: ${new Date().toLocaleString()}\n`;
    txt += `  Messages   : ${messages.length}\n`;
    txt += `${"═".repeat(60)}\n\n`;

    messages.forEach(m => {
      const time = m.timestamp ? m.timestamp.replace("T", " ").replace("Z", "").slice(0, 19) : "unknown";
      const content = m.fileURL
        ? `[${m.fileType || "file"}: ${m.fileName}] ${m.fileURL}`
        : m.text;
      txt += `[${time}]  ${m.sender}\n${content}\n${line}\n`;
    });

    const safeRoom = roomDisplay.replace(/[^a-z0-9]/gi, "_");
    const dateStr  = new Date().toISOString().slice(0, 10);
    const baseName = `backup_${safeRoom}_${dateStr}`;

    // Download JSON
    const jsonBlob = new Blob([JSON.stringify({ roomName: roomDisplay, exportedBy: myUsername, exportedAt: new Date().toISOString(), totalMessages: messages.length, messages }, null, 2)], { type: "application/json" });
    const jsonUrl  = URL.createObjectURL(jsonBlob);
    const a1 = document.createElement("a");
    a1.href = jsonUrl; a1.download = `${baseName}.json`; a1.click();
    URL.revokeObjectURL(jsonUrl);

    // Download TXT
    setTimeout(() => {
      const txtBlob = new Blob([txt], { type: "text/plain" });
      const txtUrl  = URL.createObjectURL(txtBlob);
      const a2 = document.createElement("a");
      a2.href = txtUrl; a2.download = `${baseName}.txt`; a2.click();
      URL.revokeObjectURL(txtUrl);
    }, 500);

    showNotification(`✅ Backup downloaded! (${messages.length} messages)`, "success");
  } catch (error) {
    console.error("Backup error:", error);
    showNotification("Backup failed: " + error.message, "error");
  }
};

// 🔹 BACKUP MESSAGES — sends to local Java server
const BACKUP_SERVER = "http://localhost:7432";

window.backupMessages = async function () {
  if (!currentRoomId) {
    showNotification("Please join a room first", "error");
    return;
  }
  if (!auth.currentUser) {
    showNotification("Not logged in", "error");
    return;
  }

  // Check if local server is running first
  try {
    const ping = await fetch(BACKUP_SERVER + "/ping", { method: "GET" });
    if (!ping.ok) throw new Error("Server not responding");
  } catch (e) {
    showNotification("⚠️ Backup server is not running! Start start-server.bat first.", "error");
    return;
  }

  showNotification("Backing up messages...", "success");

  try {
    // Fetch all messages for current room
    const q = query(
      collection(db, "messages"),
      where("roomId", "==", currentRoomId),
      orderBy("timestamp", "asc")
    );
    const snapshot = await getDocs(q);

    // Resolve sender UIDs to usernames
    const userCache = {};
    for (const docSnap of snapshot.docs) {
      const senderId = docSnap.data().sender;
      if (!userCache[senderId]) {
        const userDoc = await getDoc(doc(db, "users", senderId));
        userCache[senderId] = userDoc.exists() ? userDoc.data().username : senderId;
      }
    }

    // Build messages array
    const messages = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id:        docSnap.id,
        sender:    userCache[data.sender] || data.sender,
        text:      data.text || "",
        timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : "",
        fileURL:   data.fileURL  || "",
        fileType:  data.fileType || "",
        fileName:  data.fileName || ""
      };
    });

    // Get current user's username
    const meDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    const myUsername = meDoc.exists() ? meDoc.data().username : auth.currentUser.email;

    const roomDisplay = document.getElementById("roomNameDisplay").textContent || currentRoomId;

    const backup = {
      roomName:      roomDisplay,
      roomId:        currentRoomId,
      exportedBy:    myUsername,
      exportedAt:    new Date().toISOString(),
      totalMessages: messages.length,
      messages:      messages
    };

    // Send to local Java server
    const response = await fetch(BACKUP_SERVER + "/backup", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(backup, null, 2)
    });

    if (!response.ok) throw new Error("Server returned " + response.status);

    const result = await response.json();
    showNotification(`✅ Backup saved! (${messages.length} messages → Downloads/ChatBackups)`, "success");

  } catch (error) {
    console.error("Backup error:", error);
    showNotification("Backup failed: " + error.message, "error");
  }
};

window.toggleSearch = function() {
  const container = document.getElementById('searchContainer');
  const input = document.getElementById('searchInput');
  const isVisible = container.style.display !== 'none';
  container.style.display = isVisible ? 'none' : 'flex';
  if (!isVisible) {
    input.focus();
  } else {
    input.value = '';
    window.searchMessages();
  }
};

// 🔹 DESKTOP THREE-DOT DROPDOWN
window.toggleDropdown = function(e, id) {
  e.stopPropagation();
  document.querySelectorAll('.msg-dropdown.active').forEach(d => {
    if (d.id !== id) d.classList.remove('active');
  });
  document.getElementById(id)?.classList.toggle('active');
};

window.closeDropdown = function() {
  document.querySelectorAll('.msg-dropdown.active').forEach(d => d.classList.remove('active'));
};

document.addEventListener('click', closeDropdown);

// 🔹 MOBILE SWIPE TO REPLY
function setupSwipeReply(wrapper, docId, username, text) {
  const inner = wrapper.querySelector('.message');
  let startX = 0, isDragging = false;

  inner.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    isDragging = true;
  }, { passive: true });

  inner.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - startX;
    if (dx > 0 && dx < 80) {
      inner.style.transform = `translateX(${dx}px)`;
      inner.style.transition = 'none';
    }
  }, { passive: true });

  inner.addEventListener('touchend', e => {
    if (!isDragging) return;
    isDragging = false;
    const dx = e.changedTouches[0].clientX - startX;
    inner.style.transition = 'transform 0.25s ease';
    inner.style.transform = 'translateX(0)';
    if (dx > 50) {
      setReply(docId, username, text);
      // haptic if available
      if (navigator.vibrate) navigator.vibrate(30);
    }
  });
}

// 🔹 MOBILE LONG PRESS ACTION SHEET
function setupLongPress(wrapper, docId, username, text, isMine) {
  const inner = wrapper.querySelector('.message');
  let timer = null;

  const show = () => {
    if (navigator.vibrate) navigator.vibrate(40);
    const truncated = text.length > 50 ? text.slice(0, 50) + '…' : text;
    const deleteItem = isMine
      ? `<button class="sheet-item danger" onclick="deleteMessage('${docId}');closeSheet()">✕  Delete Message</button>`
      : '';

    const sheet = document.createElement('div');
    sheet.className = 'msg-action-sheet';
    sheet.id = 'msgActionSheet';
    sheet.innerHTML = `
      <div class="msg-action-sheet-content">
        <div class="sheet-handle"></div>
        <div class="sheet-preview">${username}: ${truncated}</div>
        <button class="sheet-item" onclick="setReply('${docId}','${username.replace(/'/g,"\\'")}','${text.replace(/'/g,"\\'").replace(/\n/g,' ')}');closeSheet()">↩  Reply</button>
        ${deleteItem}
      </div>
    `;
    sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
    document.body.appendChild(sheet);
  };

  inner.addEventListener('touchstart', () => { timer = setTimeout(show, 500); }, { passive: true });
  inner.addEventListener('touchend',   () => clearTimeout(timer));
  inner.addEventListener('touchmove',  () => clearTimeout(timer), { passive: true });
}

window.closeSheet = function() {
  document.getElementById('msgActionSheet')?.remove();
};

// 🔹 SCROLL TO BOTTOM
let unreadCount = 0;
let isUserScrolled = false;

window.scrollToBottom = function() {
  const messagesDiv = document.getElementById("messages");
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  unreadCount = 0;
  document.getElementById("scrollBottomBtn").style.display = "none";
  document.getElementById("unreadBadge").style.display = "none";
};

function setupScrollListener() {
  const messagesDiv = document.getElementById("messages");
  messagesDiv.addEventListener("scroll", () => {
    const atBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < 60;
    isUserScrolled = !atBottom;
    if (atBottom) {
      unreadCount = 0;
      document.getElementById("scrollBottomBtn").style.display = "none";
      document.getElementById("unreadBadge").style.display = "none";
    }
  });
}

// 🔹 REPLY SYSTEM
let replyingTo = null;

window.setReply = function(messageId, sender, text) {
  replyingTo = { messageId, sender, text };
  const bar = document.getElementById("replyBar");
  const preview = document.getElementById("replyPreview");
  const truncated = text.length > 60 ? text.slice(0, 60) + "…" : text;
  preview.innerHTML = `<strong>${sender}</strong>${truncated}`;
  bar.style.display = "flex";
  document.getElementById("message").focus();
};

window.cancelReply = function() {
  replyingTo = null;
  document.getElementById("replyBar").style.display = "none";
  document.getElementById("replyPreview").innerHTML = "";
};

// 🔹 SEND BUTTON ANIMATION
function animateSendBtn() {
  const btn = document.getElementById("sendBtn");
  if (!btn) return;
  btn.classList.remove("sending");
  void btn.offsetWidth; // force reflow
  btn.classList.add("sending");
  setTimeout(() => btn.classList.remove("sending"), 400);
}

// 🔹 SEARCH MESSAGES
window.searchMessages = function() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
  const messages = document.querySelectorAll('.message-wrapper');
  
  if (!searchTerm) {
    messages.forEach(msg => {
      msg.style.display = 'block';
      msg.style.backgroundColor = '';
    });
    return;
  }
  
  messages.forEach(msg => {
    const text = msg.textContent.toLowerCase();
    if (text.includes(searchTerm)) {
      msg.style.display = 'block';
      msg.style.backgroundColor = 'rgba(255, 255, 0, 0.1)';
    } else {
      msg.style.display = 'none';
    }
  });
};

window.clearSearch = function() {
  document.getElementById('searchInput').value = '';
  const messages = document.querySelectorAll('.message-wrapper');
  messages.forEach(msg => {
    msg.style.display = 'block';
    msg.style.backgroundColor = '';
  });
};

// 🔹 LOAD MESSAGES
// 🔹 LOAD MESSAGES (Updated with online status for other users)
let renderedMessageIds = new Set();

export function loadMessages() {
  if (isListenerActive) return;
  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
  if (!currentRoomId) return;

  renderedMessageIds.clear();
  const messagesDiv = document.getElementById("messages");
  setupScrollListener();

  const q = query(
    collection(db, "messages"),
    where("roomId", "==", currentRoomId),
    orderBy("timestamp", "asc")
  );

  isListenerActive = true;
  let initialLoad = true;
  let callCount = 0;

  unsubscribeMessages = onSnapshot(q, async (snapshot) => {
    callCount++;
    const changes = snapshot.docChanges().filter(c => c.type === "added");

    // After first snapshot, mark initial load done
    if (initialLoad && callCount === 1) {
      // Process all initial messages
      for (const change of changes) {
        await renderMessage(change.doc, messagesDiv, false);
      }
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      initialLoad = false;
      return;
    }

    // New messages after initial load
    for (const change of changes) {
      if (change.type === "added") {
        await renderMessage(change.doc, messagesDiv, true);
      }
    }
  });
}

async function renderMessage(docSnap, messagesDiv, isNew) {
  const docId = docSnap.id;
  if (renderedMessageIds.has(docId)) return;
  renderedMessageIds.add(docId);

  const data = docSnap.data();
  const userDoc = await getDoc(doc(db, "users", data.sender));
  const username = userDoc.exists() ? userDoc.data().username : "Unknown";
  const isOnline  = userDoc.exists() ? userDoc.data().online : false;

  let timeString = "";
  if (data.timestamp) {
    const date = data.timestamp.toDate();
    const now = new Date();
    const diffMins  = Math.floor((now - date) / 60000);
    const diffHours = Math.floor((now - date) / 3600000);
    const diffDays  = Math.floor((now - date) / 86400000);
    if (diffMins < 1)       timeString = "Just now";
    else if (diffMins < 60) timeString = `${diffMins}m ago`;
    else if (diffHours < 24)timeString = `${diffHours}h ago`;
    else if (diffDays < 7)  timeString = `${diffDays}d ago`;
    else                    timeString = date.toLocaleDateString();
  }

  const isSentByCurrentUser = data.sender === auth.currentUser.uid;

  let messageContent = "";
  if (data.fileURL) {
    if (data.fileType === "image")      messageContent = `<img src="${data.fileURL}" alt="${data.fileName}" onclick="window.open('${data.fileURL}', '_blank')">`;
    else if (data.fileType === "video") messageContent = `<video controls src="${data.fileURL}"></video>`;
    else                                messageContent = `📄 <a href="${data.fileURL}" target="_blank">${data.fileName}</a>`;
  } else {
    messageContent = data.text;
  }

  // Reply quote
  let replyHTML = "";
  if (data.replyTo) {
    const truncated = data.replyTo.text.length > 60 ? data.replyTo.text.slice(0, 60) + "…" : data.replyTo.text;
    replyHTML = `<div class="reply-quote"><strong>${data.replyTo.sender}</strong>${truncated}</div>`;
  }

  const onlineIndicator = !isSentByCurrentUser && isOnline
    ? '<span class="user-online-dot"></span>' : "";

  // Three-dot menu (desktop) — reply always, delete only for own messages
  const deleteItem = isSentByCurrentUser
    ? `<button class="msg-dropdown-item danger" onclick="deleteMessage('${docId}');closeDropdown()">✕ Delete</button>`
    : "";
  const menuHTML = `
    <button class="msg-menu-btn" onclick="toggleDropdown(event,'drop-${docId}')">⋯</button>
    <div class="msg-dropdown" id="drop-${docId}">
      <button class="msg-dropdown-item" onclick="setReply('${docId}','${username.replace(/'/g,"\\'")}','${(data.text||"").replace(/'/g,"\\'").replace(/\n/g," ")}');closeDropdown()">↩ Reply</button>
      ${deleteItem}
    </div>
  `;

  const msg = document.createElement("div");
  msg.className = `message-wrapper ${isSentByCurrentUser ? "sent-wrapper" : "received-wrapper"}`;
  msg.setAttribute("data-message-id", docId);
  msg.setAttribute("data-sender", data.sender);
  msg.innerHTML = `
    <div class="message ${isSentByCurrentUser ? "sent" : "received"}">
      <div class="message-header">
        <strong>${username} ${onlineIndicator}</strong>
        <span class="message-time">${timeString}</span>
      </div>
      ${replyHTML}
      <div class="message-content">${messageContent}</div>
      ${menuHTML}
    </div>
  `;

  // Mobile: swipe right to reply
  setupSwipeReply(msg, docId, username, data.text || "");

  // Mobile: long press for action sheet
  setupLongPress(msg, docId, username, data.text || "", isSentByCurrentUser);

  messagesDiv.appendChild(msg);

  // Hide empty state once messages exist
  const emptyState = document.getElementById('emptyState');
  if (emptyState) emptyState.style.display = 'none';

  // Scroll or show unread badge
  if (isNew && isUserScrolled && !isSentByCurrentUser) {
    unreadCount++;
    const badge = document.getElementById("unreadBadge");
    const btn   = document.getElementById("scrollBottomBtn");
    badge.textContent = unreadCount;
    badge.style.display = "inline-block";
    btn.style.display = "flex";
  } else {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}