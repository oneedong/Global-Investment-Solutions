# Firebase 실시간 공유 설정 가이드

## 1. Firebase 프로젝트 생성

### 1.1 Firebase 콘솔 접속
- [Firebase Console](https://console.firebase.google.com/) 접속
- Google 계정으로 로그인

### 1.2 새 프로젝트 생성
1. **"프로젝트 추가"** 클릭
2. **프로젝트 이름**: `global-investment-solutions` 입력
3. **Google Analytics** 비활성화 (선택사항)
4. **"프로젝트 만들기"** 클릭

## 2. Realtime Database 설정

### 2.1 Realtime Database 활성화
1. 왼쪽 메뉴에서 **"Realtime Database"** 클릭
2. **"데이터베이스 만들기"** 클릭
3. **보안 규칙**: "테스트 모드에서 시작" 선택
4. **위치**: `asia-northeast3 (서울)` 선택
5. **"완료"** 클릭

### 2.2 보안 규칙 설정
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

## 3. 웹 앱 설정

### 3.1 웹 앱 추가
1. 프로젝트 개요에서 **"웹"** 아이콘 클릭
2. **앱 닉네임**: `Global Investment Solutions` 입력
3. **"앱 등록"** 클릭

### 3.2 Firebase 설정 복사
```javascript
const firebaseConfig = {
  apiKey: "실제_API_키_입력",
  authDomain: "실제_도메인_입력",
  databaseURL: "실제_DATABASE_URL_입력",
  projectId: "실제_프로젝트_ID_입력",
  storageBucket: "실제_스토리지_버킷_입력",
  messagingSenderId: "실제_메시징_센더_ID_입력",
  appId: "실제_앱_ID_입력"
};
```

### 3.3 firebase-config.js 파일 업데이트
`firebase-config.js` 파일의 설정값을 위에서 복사한 실제 값으로 교체

## 4. 테스트

### 4.1 로컬 테스트
1. 웹 서버에서 애플리케이션 실행
2. 브라우저 개발자 도구에서 콘솔 확인
3. "Firebase에서 데이터를 가져왔습니다" 메시지 확인

### 4.2 다중 사용자 테스트
1. 두 개의 브라우저 창에서 동시 접속
2. 한 창에서 데이터 수정
3. 다른 창에서 실시간으로 변경사항 확인

## 5. 무료 사용량 제한

### 5.1 Spark 플랜 (무료) 제한
- **동시 연결**: 100개
- **데이터 저장**: 1GB
- **데이터 전송**: 10GB/월
- **일일 쓰기**: 100,000회

### 5.2 모니터링
- Firebase 콘솔에서 사용량 확인 가능
- 제한에 도달하면 자동으로 업그레이드 안내

## 6. 문제 해결

### 6.1 연결 실패
- 인터넷 연결 확인
- Firebase 설정값 확인
- 브라우저 콘솔에서 오류 메시지 확인

### 6.2 데이터 동기화 안됨
- Firebase 보안 규칙 확인
- 실시간 리스너 설정 확인
- 네트워크 상태 확인

## 7. 보안 고려사항

### 7.1 현재 설정 (테스트용)
- 모든 사용자가 읽기/쓰기 가능
- 프로덕션 환경에서는 인증 추가 권장

### 7.2 프로덕션 보안
```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

## 8. 비용 관리

### 8.1 무료 사용량 내 유지
- 데이터 크기 최소화
- 불필요한 동기화 제거
- 사용자 수 제한

### 8.2 사용량 모니터링
- Firebase 콘솔에서 실시간 사용량 확인
- 알림 설정으로 예상치 초과 방지 