# Global Investment Solutions 배포 가이드

## 🚀 실시간 공유를 위한 배포 방법

### 1. **GitHub Pages (무료, 추천)**
```bash
# GitHub에 코드 업로드 후
# Settings > Pages > Source를 GitHub Pages로 설정
# https://yourusername.github.io/repository-name 으로 접속 가능
```

### 2. **Netlify (무료, 추천)**
```bash
# 1. netlify.com 가입
# 2. 파일을 드래그 앤 드롭으로 업로드
# 3. 자동으로 https://your-site.netlify.app 생성
```

### 3. **Vercel (무료, 추천)**
```bash
# 1. vercel.com 가입
# 2. GitHub 연동 후 자동 배포
# 3. https://your-project.vercel.app 생성
```

### 4. **Firebase Hosting (무료)**
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

## 🔧 실시간 공유를 위한 서버 추가

### 현재 한계점:
- 로컬 스토리지만 사용
- 실제 서버 없음
- 사용자 간 데이터 공유 불가

### 해결 방법:

#### A. **Firebase Realtime Database (추천)**
```javascript
// Firebase 설정 추가
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};

// 실시간 데이터베이스 연결
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
```

#### B. **Supabase (무료)**
```javascript
// Supabase 설정
const supabase = createClient('https://your-project.supabase.co', 'your-anon-key');

// 실시간 구독
supabase
  .from('table_data')
  .on('*', payload => {
    console.log('Change received!', payload);
    updateLocalData(payload.new);
  })
  .subscribe();
```

#### C. **간단한 Node.js 서버**
```javascript
// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

io.on('connection', (socket) => {
  socket.on('data-update', (data) => {
    socket.broadcast.emit('data-changed', data);
  });
});

server.listen(3000);
```

## 📱 배포 후 사용 방법

### 1. **URL 공유**
- 배포된 웹사이트 URL을 부서원들에게 공유
- 예: `https://your-company-gis.netlify.app`

### 2. **실시간 공유 확인**
- 여러 사용자가 동시에 접속
- 한 사용자가 데이터 수정하면 다른 사용자에게 실시간 반영
- 연결 상태 표시로 온라인/오프라인 확인

### 3. **모바일 접속**
- 핸드폰 브라우저에서 URL 접속
- 반응형 디자인으로 모바일에서도 완벽 작동

## 💡 추천 배포 순서

1. **1단계**: GitHub Pages로 간단 배포 (현재 기능 테스트)
2. **2단계**: Firebase Realtime Database 추가 (실시간 공유 구현)
3. **3단계**: 도메인 연결 (회사 도메인 사용)

## 🔒 보안 고려사항

- 데이터는 공개적으로 저장되므로 민감한 정보 주의
- 필요시 인증 시스템 추가
- HTTPS 사용 권장 