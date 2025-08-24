// Firebase 설정 (compat 방식)
const firebaseConfig = {
  apiKey: "AIzaSyB2I11XNVEjAkWzY4hTdJDdqAVbx8Y2GXw",
  authDomain: "global-investment-solutions.firebaseapp.com",
  databaseURL: "https://global-investment-solutions-default-rtdb.firebaseio.com",
  projectId: "global-investment-solutions",
  storageBucket: "global-investment-solutions.appspot.com",
  messagingSenderId: "820544337695",
  appId: "1:820544337695:web:7d2813aae98df396d6a22a"
};

// Firebase 초기화 (compat 방식)
firebase.initializeApp(firebaseConfig);

// Firestore 초기화 트리거 (전역 변수 선언 없이 인스턴스만 생성)
try { firebase.firestore(); } catch (_) {}

// Realtime Database 참조
const database = firebase.database();