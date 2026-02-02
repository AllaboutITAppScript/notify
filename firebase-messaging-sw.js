// firebase-config.js
const firebaseConfig = {
  // ⚠️ เปลี่ยนค่าตรงนี้เป็นของ Firebase Project คุณ
   apiKey: "AIzaSyAh9wbVVHoYF3XN3sBw5M3hYVxe4fihpOk",
  authDomain: "servicenotify-57f39.firebaseapp.com",
  databaseURL: "https://servicenotify-57f39-default-rtdb.firebaseio.com",
  projectId: "servicenotify-57f39",
  storageBucket: "servicenotify-57f39.firebasestorage.app",
  messagingSenderId: "548978955126",
  appId: "1:548978955126:web:f4897866d67b186a056057",
  measurementId: "G-7QLVB1X8K3",
  vapidKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"
};

// สำหรับทดสอบ ถ้ายังไม่ได้ตั้งค่า Firebase
const mockFirebaseConfig = {
  apiKey: "test-key",
  authDomain: "test.firebaseapp.com",
  projectId: "test-project",
  storageBucket: "test.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:test",
  vapidKey: "test-vapid-key"
};

// ใช้ mock ถ้า config ไม่ถูกต้อง
let configToUse = firebaseConfig;

// ตรวจสอบว่ามีค่า config จริงหรือไม่
if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("ABCDEF")) {
  console.warn("⚠️  Using mock Firebase config. Please update firebase-config.js");
  configToUse = mockFirebaseConfig;
}

// กำหนดเป็น global variable
window.firebaseConfig = configToUse;
