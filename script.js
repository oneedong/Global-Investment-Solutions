// 전역 변수
let currentTab = 'pe-pd';
let currentDashboard = 'contacts';
let tableData = {
    'pe-pd': [],
    'real-estate': [],
    infra: []
};
let rfpData = [];
let institutionsData = {
    연기금: [],
    공제회: [],
    보험사: [],
    중앙회: [],
    은행: [],
    증권사: [],
    운용사: [],
    캐피탈: [],
    기타: []
};
let gpsData = {};
let selectedInstitutionCategory = '';
let selectedGpLetter = 'A';
// Firestore 핸들
let db = null;
// 삭제 tombstone(모든 클라이언트에서 숨길 연락처 기록) - { ownerId: { byId:Set, byEmail:Set } }
let deletedTombstones = {}; // 예: { 'ownerA': { byId: {id1:1}, byEmail:{'a@b.com':1} } }

// 삭제된 항목들을 추적하는 전역 변수들
let deletedTableRows = new Set(); // 삭제된 테이블 행 ID들
let deletedRfpRows = new Set(); // 삭제된 RFP 행 ID들
let deletedInstitutions = new Set(); // 삭제된 기관 ID들
let deletedGps = new Set(); // 삭제된 GP ID들
let deletedContacts = new Set(); // 삭제된 연락처 ID들

// tombstone 헬퍼
function ensureTombstoneBucket(owner) {
  const key = String(owner||'').trim();
  if (!deletedTombstones[key]) deletedTombstones[key] = { byId: {}, byEmail: {} };
  return deletedTombstones[key];
}
function ownerAliases(owner) {
  const raw = String(owner||'').startsWith('gp_') ? owner.slice(3) : owner;
  return new Set([String(owner||''), String(raw), 'gp_' + String(raw)]);
}
function isContactTombstoned(owner, contact) {
  const aliases = ownerAliases(owner);
  for (const k of aliases) {
    const b = deletedTombstones[k];
    if (!b) continue;
    if (contact && contact.id && b.byId[String(contact.id)]) return true;
    const em = (contact && contact.email ? String(contact.email).trim().toLowerCase() : '');
    if (em && b.byEmail[em]) return true;
  }
  return false;
}
function addContactTombstone(owner, contact) {
  const aliases = ownerAliases(owner);
  aliases.forEach(k => {
    const b = ensureTombstoneBucket(k);
    if (contact && contact.id) b.byId[String(contact.id)] = 1;
    const em = (contact && contact.email ? String(contact.email).trim().toLowerCase() : '');
    if (em) b.byEmail[em] = 1;
  });
}

// 삭제된 항목들을 localStorage에 저장
function saveDeletedItems() {
  try {
    localStorage.setItem('deletedTableRows', JSON.stringify(Array.from(deletedTableRows)));
    localStorage.setItem('deletedRfpRows', JSON.stringify(Array.from(deletedRfpRows)));
    localStorage.setItem('deletedInstitutions', JSON.stringify(Array.from(deletedInstitutions)));
    localStorage.setItem('deletedGps', JSON.stringify(Array.from(deletedGps)));
    localStorage.setItem('deletedContacts', JSON.stringify(Array.from(deletedContacts)));
  } catch (e) {
    console.warn('삭제된 항목 저장 실패:', e);
  }
}

// 삭제된 항목들을 localStorage에서 로드
function loadDeletedItems() {
  try {
    const tableRows = localStorage.getItem('deletedTableRows');
    const rfpRows = localStorage.getItem('deletedRfpRows');
    const institutions = localStorage.getItem('deletedInstitutions');
    const gps = localStorage.getItem('deletedGps');
    const contacts = localStorage.getItem('deletedContacts');
    
    if (tableRows) deletedTableRows = new Set(JSON.parse(tableRows));
    if (rfpRows) deletedRfpRows = new Set(JSON.parse(rfpRows));
    if (institutions) deletedInstitutions = new Set(JSON.parse(institutions));
    if (gps) deletedGps = new Set(JSON.parse(gps));
    if (contacts) deletedContacts = new Set(JSON.parse(contacts));
  } catch (e) {
    console.warn('삭제된 항목 로드 실패:', e);
  }
}

// 삭제된 항목들의 개수를 반환
function getDeletedItemsCount() {
  const total = deletedTableRows.size + deletedRfpRows.size + deletedInstitutions.size + 
                deletedGps.size + deletedContacts.size;
  return total;
}

// 삭제된 항목 개수를 버튼에 표시
function updateDeletedItemsCount() {
  const clearDeletedBtn = document.getElementById('clearDeletedBtn');
  if (clearDeletedBtn) {
    const count = getDeletedItemsCount();
    if (count > 0) {
      clearDeletedBtn.innerHTML = `<i class="fas fa-trash-alt"></i> 삭제된 항목 정리 (${count})`;
      clearDeletedBtn.style.backgroundColor = '#ff6b6b';
    } else {
      clearDeletedBtn.innerHTML = `<i class="fas fa-trash-alt"></i> 삭제된 항목 정리`;
      clearDeletedBtn.style.backgroundColor = '';
    }
  }
}

// 삭제된 항목들을 필터링하는 강력한 가드 함수
function filterDeletedItems(data, type) {
  if (!data) return data;
  
  switch (type) {
    case 'tableData':
      if (Array.isArray(data)) {
        return data.filter(row => !deletedTableRows.has(row.id));
      } else if (typeof data === 'object') {
        const filtered = {};
        Object.keys(data).forEach(category => {
          if (Array.isArray(data[category])) {
            filtered[category] = data[category].filter(row => !deletedTableRows.has(row.id));
          }
        });
        return filtered;
      }
      break;
    case 'rfpData':
      if (Array.isArray(data)) {
        return data.filter(rfp => !deletedRfpRows.has(rfp.id));
      }
      break;
    case 'institutionsData':
      if (typeof data === 'object') {
        const filtered = {};
        Object.keys(data).forEach(category => {
          if (Array.isArray(data[category])) {
            filtered[category] = data[category].filter(inst => !deletedInstitutions.has(inst.id));
          }
        });
        return filtered;
      }
      break;
    case 'gpsData':
      if (typeof data === 'object') {
        const filtered = {};
        Object.keys(data).forEach(letter => {
          if (Array.isArray(data[letter])) {
            filtered[letter] = data[letter].filter(gp => !deletedGps.has(gp.id));
          }
        });
        return filtered;
      }
      break;
    case 'contacts':
      if (typeof data === 'object') {
        const filtered = {};
        Object.keys(data).forEach(ownerId => {
          if (Array.isArray(data[ownerId])) {
            filtered[ownerId] = data[ownerId].filter(contact => !deletedContacts.has(contact.id));
          }
        });
        return filtered;
      }
      break;
  }
  
  return data;
}

// 삭제된 항목들을 영구적으로 제거
function clearDeletedItems() {
  const count = getDeletedItemsCount();
  if (count === 0) {
    alert('삭제된 항목이 없습니다.');
    return;
  }
  
  if (!confirm(`삭제된 항목 ${count}개를 영구적으로 제거하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
    return;
  }
  
  try {
    // 삭제된 항목들 초기화
    deletedTableRows.clear();
    deletedRfpRows.clear();
    deletedInstitutions.clear();
    deletedGps.clear();
    deletedContacts.clear();
    deletedTombstones = {};
    
    // localStorage에서 삭제된 항목들 제거
    localStorage.removeItem('deletedTableRows');
    localStorage.removeItem('deletedRfpRows');
    localStorage.removeItem('deletedInstitutions');
    localStorage.removeItem('deletedGps');
    localStorage.removeItem('deletedContacts');
    localStorage.removeItem('deletedTombstones');
    
    alert('삭제된 항목들이 영구적으로 제거되었습니다.');
    
    // 페이지 새로고침하여 모든 데이터를 다시 로드
    window.location.reload();
  } catch (e) {
    console.error('삭제된 항목 제거 실패:', e);
    alert('삭제된 항목 제거 중 오류가 발생했습니다.');
  }
}

// Roadshow Scheduling 데이터
let roadshowData = {
    days: [], // [{id, label}]
    meetings: [], // [{id, fundId, dayId, start, end, company, staff, note, address, lpAttendees, kbSecurities}]
    investors: [],
    funds: [] // [{id, name}]
};
// 선택 상태
let openRoadshowMeetingId = null;
let selectedFundId = null;

// 기관 연락처(팝업 대시보드) 상태
let institutionsContacts = {}; // key: institutionId, value: Contact[]
let openContactsInstitutionId = null; // 현재 모달이 가리키는 기관 ID
// GP 연락처 상태
let gpContacts = {}; // key: gpId, value: Contact[]
let openGpContactId = null;

// Firebase Auth 사용으로 로컬 계정 상수는 사용하지 않음

// 현재 페이지 경로 기준으로 안전하게 상대 경로 이동
function goTo(path) {
  try {
    // 항상 현재 디렉터리 기준 상대 경로(./path)로 이동해 404 위험 최소화
    const normalized = path.startsWith('./') ? path : (`./${path}`);
    const url = new URL(normalized, window.location.href);
    window.location.assign(url.href);
  } catch (_) {
    window.location.href = path;
  }
}

// SHA-256 해시 함수 (브라우저 내장 SubtleCrypto 사용)
async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    // 제목 클릭 시 새로고침
    const title = document.getElementById('app-title');
    if (title) {
        title.style.cursor = 'pointer';
        title.addEventListener('click', () => window.location.reload());
    }

    // 현재 페이지가 대시보드인지 판별 후에만 대시보드 초기화 수행
    const isDashboardPage = !!document.querySelector('.dashboard-container');
    if (isDashboardPage) {
        // 인증 게이트: 미인증 시 랜딩으로
        if (firebase && firebase.auth) {
            firebase.auth().onAuthStateChanged((user) => {
                if (!user) {
                    goTo('landing.html');
                }
                // 로그아웃 버튼 바인딩
                const logoutBtn = document.getElementById('logoutBtn');
                if (logoutBtn) {
                    logoutBtn.onclick = async () => {
                        try {
                            await firebase.auth().signOut();
                            goTo('landing.html');
                        } catch (e) {
                            alert('로그아웃 실패: ' + (e && e.message ? e.message : '잠시 후 다시 시도해주세요.'));
                        }
                    };
                }

                

            });
        }
        // onAuthStateChanged 도달 전이라도 클릭 무시되거나 NPE 방지용 1회 바인딩
        const restoreBtnEarly = document.getElementById('restoreBtn');
        if (restoreBtnEarly && !restoreBtnEarly._bound) {
            restoreBtnEarly._bound = true;
            restoreBtnEarly.onclick = () => {
                alert('로그인 후 복구를 사용할 수 있습니다.');
            };
        }
        initializeTabs();
        initializeDashboardTabs();
        loadDataFromLocalStorage();
        loadDeletedItems(); // 삭제된 항목들 로드
        updateDeletedItemsCount(); // 삭제된 항목 개수 업데이트
        
        // 각 탭 데이터가 없으면 배열로 초기화 (안전 가드)
        if (!Array.isArray(tableData['pe-pd'])) tableData['pe-pd'] = [];
        if (!Array.isArray(tableData['real-estate'])) tableData['real-estate'] = [];
        if (!Array.isArray(tableData['infra'])) tableData['infra'] = [];
        
        renderTable();
        renderRfpTable();
        renderInstitutionsDashboard();
        renderGpsDashboard();
        initializeRealTimeSync();
        updateConnectionStatus();
        // Firestore 초기화 및 리스너
        initializeFirestoreSync();
        // 연락처가 비어 있으면 Firestore에서 전량 부트스트랩 (표시 누락 방지)
        setTimeout(() => { try { ensureContactsBootstrapped(); } catch (_) {} }, 200);
        
        // 열 리사이즈 기능 초기화
        setTimeout(() => {
            initializeColumnResize();
            // 저장된 열 너비 복원
            document.querySelectorAll('.data-table').forEach(table => {
                restoreColumnWidths(table);
            });
        }, 100);

        scheduleAutoFitDashboard();

        // 글로벌 검색 바인딩
        const globalSearchInput = document.getElementById('global-search-input');
        const globalSearchBtn = document.getElementById('global-search-btn');
        if (globalSearchInput) {
            globalSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    performGlobalSearch((globalSearchInput.value || '').trim());
                }
            });
        }
        if (globalSearchBtn && globalSearchInput) {
            globalSearchBtn.addEventListener('click', () => {
                performGlobalSearch((globalSearchInput.value || '').trim());
            });
        }

        // ESC로 팝업 모두 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeAllOpenPopups();
            }
        });
    }

    // Firebase Auth 로그인 로직
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;
    const useridInput = document.getElementById('userid');
    const passwordInput = document.getElementById('password');
    const saveIdCheckbox = document.getElementById('saveId');
    const savePwCheckbox = document.getElementById('savePw');
    const loginError = document.getElementById('loginError');

    // 아이디 저장 불러오기
    const savedId = localStorage.getItem('savedUserId');
    if (savedId) {
      useridInput.value = savedId;
      saveIdCheckbox.checked = true;
    } else {
      // 기본값으로 AV1 설정
      useridInput.value = 'AV1';
      saveIdCheckbox.checked = true;
    }

    // 안전한 비밀번호 저장/복원 유틸 (AES-GCM with per-session key, fallback base64)
    async function getCryptoKey() {
      try {
        const raw = (await sha256('kbsec-local-pw-key'));
        const bytes = new Uint8Array(raw.match(/.{1,2}/g).map(h=>parseInt(h,16))).slice(0,32);
        return await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt','decrypt']);
      } catch (_) { return null; }
    }
    async function encryptPw(key, text){
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder().encode(text);
        const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc);
        const out = new Uint8Array(iv.length + new Uint8Array(ct).length);
        out.set(iv,0); out.set(new Uint8Array(ct), iv.length);
        return btoa(String.fromCharCode(...out));
      } catch (_) { return btoa(unescape(encodeURIComponent(text))); }
    }
    async function decryptPw(key, b64){
      try {
        const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const iv = buf.slice(0,12); const data = buf.slice(12);
        const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, data);
        return new TextDecoder().decode(pt);
      } catch (_) { try { return decodeURIComponent(escape(atob(b64))); } catch { return ''; } }
    }

    // 저장된 비밀번호 복원 및 자동 로그인 옵션
    (async () => {
      try {
        const encPw = localStorage.getItem('savedUserPw');
        if (encPw) {
          const key = await getCryptoKey();
          const pw = await decryptPw(key, encPw);
          if (pw) {
            passwordInput.value = pw;
            if (savePwCheckbox) savePwCheckbox.checked = true;
          }
        }
      } catch (_) {}
    })();

    // 인증 상태 관찰: 인증되면 메인으로, 아니면 대기
    if (firebase && firebase.auth) {
      firebase.auth().onAuthStateChanged((user) => {
        if (user && window.location.pathname.endsWith('landing.html')) {
          goTo('main.html');
        }
        // 로그인이 성립하면 백그라운드 자동 정규화 1회 실행
        if (user) {
          try { autoNormalizeContactsDaily(); } catch (_) {}
        }
      });
    }

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = useridInput.value.trim();
      const password = passwordInput.value;
      loginError.textContent = '';
      try {
        await firebase.auth().signInWithEmailAndPassword(email, password);
        if (saveIdCheckbox.checked) {
          localStorage.setItem('savedUserId', email);
        } else {
          localStorage.removeItem('savedUserId');
        }
        if (savePwCheckbox && savePwCheckbox.checked) {
          try { const key = await getCryptoKey(); const enc = await encryptPw(key, password); localStorage.setItem('savedUserPw', enc); } catch(_) {}
        } else {
          localStorage.removeItem('savedUserPw');
        }
        goTo('main.html');
      } catch (err) {
        loginError.textContent = '로그인 실패: ' + (err && err.message ? err.message : '확인해주세요.');
      }
    });
});

// 탭 초기화
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

// 대시보드 탭 초기화
function initializeDashboardTabs() {
    const dashboardTabs = document.querySelectorAll('.dashboard-tab');
    
    dashboardTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetDashboard = tab.getAttribute('data-dashboard');
            switchDashboard(targetDashboard);
        });
    });
}

// 대시보드 전환
function switchDashboard(dashboardName) {
    // 대시보드 탭 상태 변경
    document.querySelectorAll('.dashboard-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    const tabEl = document.querySelector(`[data-dashboard="${dashboardName}"]`);
    if (tabEl) {
        tabEl.classList.add('active');
    }

    // 대시보드 콘텐츠 상태 변경
    document.querySelectorAll('.dashboard-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    const targetPane = document.getElementById(`${dashboardName}-dashboard`);
    if (targetPane) targetPane.classList.add('active');

    currentDashboard = dashboardName;
}

// 그룹핑 방식 전환
function switchGrouping(type) {
    // 버튼 상태 변경
    document.querySelectorAll('.grouping-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`${type}-grouping`).classList.add('active');
    
    // 리스트 표시/숨김
    const categoryList = document.getElementById('institutions-category-list');
    const regionList = document.getElementById('institutions-region-list');
    
    if (type === 'category') {
        categoryList.style.display = 'block';
        regionList.style.display = 'none';
        renderInstitutionsDashboard();
    } else if (type === 'region') {
        categoryList.style.display = 'none';
        regionList.style.display = 'block';
        renderInstitutionsByRegion();
    } else if (type === 'regionAll') {
        categoryList.style.display = 'none';
        regionList.style.display = 'none';
        renderInstitutionsRegionAll();
    }
}

// 주소에서 지역 추출
function extractRegionFromAddress(address) {
    if (!address || typeof address !== 'string') return '기타';
    
    const addr = address.trim();
    
    // 서울 지역
    if (addr.includes('강남') || addr.includes('강남대로')) return '강남';
    if (addr.includes('서초') || addr.includes('서초대로')) return '서초';
    if (addr.includes('종로') || addr.includes('종로구')) return '종로';
    if (addr.includes('중구') || addr.includes('중구 ')) return '중구';
    if (addr.includes('용산') || addr.includes('용산구')) return '용산';
    if (addr.includes('성동') || addr.includes('성동구')) return '성동';
    if (addr.includes('광진') || addr.includes('광진구')) return '광진';
    if (addr.includes('동대문') || addr.includes('동대문구')) return '동대문';
    if (addr.includes('중랑') || addr.includes('중랑구')) return '중랑';
    if (addr.includes('성북') || addr.includes('성북구')) return '성북';
    if (addr.includes('강북') || addr.includes('강북구')) return '강북';
    if (addr.includes('도봉') || addr.includes('도봉구')) return '도봉';
    if (addr.includes('노원') || addr.includes('노원구')) return '노원';
    if (addr.includes('은평') || addr.includes('은평구')) return '은평';
    if (addr.includes('서대문') || addr.includes('서대문구')) return '서대문';
    if (addr.includes('마포') || addr.includes('마포구')) return '마포';
    if (addr.includes('양천') || addr.includes('양천구')) return '양천';
    if (addr.includes('강서') || addr.includes('강서구')) return '강서';
    if (addr.includes('구로') || addr.includes('구로구')) return '구로';
    if (addr.includes('금천') || addr.includes('금천구')) return '금천';
    if (addr.includes('영등포') || addr.includes('영등포구')) return '영등포';
    if (addr.includes('동작') || addr.includes('동작구')) return '동작';
    if (addr.includes('관악') || addr.includes('관악구')) return '관악';
    if (addr.includes('서초') || addr.includes('서초구')) return '서초';
    if (addr.includes('강남') || addr.includes('강남구')) return '강남';
    if (addr.includes('송파') || addr.includes('송파구')) return '송파';
    if (addr.includes('강동') || addr.includes('강동구')) return '강동';
    
    // 경기도 지역
    if (addr.includes('수원') || addr.includes('수원시')) return '수원';
    if (addr.includes('성남') || addr.includes('성남시')) return '성남';
    if (addr.includes('의정부') || addr.includes('의정부시')) return '의정부';
    if (addr.includes('안양') || addr.includes('안양시')) return '안양';
    if (addr.includes('부천') || addr.includes('부천시')) return '부천';
    if (addr.includes('광명') || addr.includes('광명시')) return '광명';
    if (addr.includes('평택') || addr.includes('평택시')) return '평택';
    if (addr.includes('동두천') || addr.includes('동두천시')) return '동두천';
    if (addr.includes('안산') || addr.includes('안산시')) return '안산';
    if (addr.includes('고양') || addr.includes('고양시')) return '고양';
    if (addr.includes('과천') || addr.includes('과천시')) return '과천';
    if (addr.includes('구리') || addr.includes('구리시')) return '구리';
    if (addr.includes('남양주') || addr.includes('남양주시')) return '남양주';
    if (addr.includes('오산') || addr.includes('오산시')) return '오산';
    if (addr.includes('시흥') || addr.includes('시흥시')) return '시흥';
    if (addr.includes('군포') || addr.includes('군포시')) return '군포';
    if (addr.includes('의왕') || addr.includes('의왕시')) return '의왕';
    if (addr.includes('하남') || addr.includes('하남시')) return '하남';
    if (addr.includes('용인') || addr.includes('용인시')) return '용인';
    if (addr.includes('파주') || addr.includes('파주시')) return '파주';
    if (addr.includes('이천') || addr.includes('이천시')) return '이천';
    if (addr.includes('안성') || addr.includes('안성시')) return '안성';
    if (addr.includes('김포') || addr.includes('김포시')) return '김포';
    if (addr.includes('화성') || addr.includes('화성시')) return '화성';
    if (addr.includes('광주') || addr.includes('광주시')) return '광주(경기)';
    if (addr.includes('여주') || addr.includes('여주시')) return '여주';
    if (addr.includes('양평') || addr.includes('양평군')) return '양평';
    if (addr.includes('고양') || addr.includes('고양시')) return '고양';
    if (addr.includes('연천') || addr.includes('연천군')) return '연천';
    if (addr.includes('가평') || addr.includes('가평군')) return '가평';
    if (addr.includes('포천') || addr.includes('포천시')) return '포천';
    
    // 인천 지역
    if (addr.includes('인천') || addr.includes('인천시')) return '인천';
    if (addr.includes('중구') && addr.includes('인천')) return '인천 중구';
    if (addr.includes('동구') && addr.includes('인천')) return '인천 동구';
    if (addr.includes('미추홀구') || addr.includes('남구') && addr.includes('인천')) return '인천 남구';
    if (addr.includes('연수') || addr.includes('연수구')) return '인천 연수구';
    if (addr.includes('남동') || addr.includes('남동구')) return '인천 남동구';
    if (addr.includes('부평') || addr.includes('부평구')) return '인천 부평구';
    if (addr.includes('계양') || addr.includes('계양구')) return '인천 계양구';
    if (addr.includes('서구') && addr.includes('인천')) return '인천 서구';
    if (addr.includes('강화') || addr.includes('강화군')) return '인천 강화군';
    if (addr.includes('옹진') || addr.includes('옹진군')) return '인천 옹진군';
    
    // 부산 지역
    if (addr.includes('부산') || addr.includes('부산시')) return '부산';
    
    // 대구 지역
    if (addr.includes('대구') || addr.includes('대구시')) return '대구';
    
    // 대전 지역
    if (addr.includes('대전') || addr.includes('대전시')) return '대전';
    
    // 광주 지역
    if (addr.includes('광주') || addr.includes('광주시')) return '광주';
    
    // 울산 지역
    if (addr.includes('울산') || addr.includes('울산시')) return '울산';
    
    // 기타 지역
    if (addr.includes('충청') || addr.includes('충남') || addr.includes('충북')) return '충청도';
    if (addr.includes('전라') || addr.includes('전남') || addr.includes('전북')) return '전라도';
    if (addr.includes('경상') || addr.includes('경남') || addr.includes('경북')) return '경상도';
    if (addr.includes('강원') || addr.includes('강원도')) return '강원도';
    if (addr.includes('제주') || addr.includes('제주도')) return '제주도';
    
    return '기타';
}

// 지역별로 기관 렌더링
function renderInstitutionsByRegion() {
    const regionList = document.getElementById('institutions-region-list');
    const detailTitle = document.getElementById('institutions-detail-title');
    const detailTbody = document.getElementById('institutions-detail-tbody');
    
    // 지역별로 기관 그룹핑
    const regionGroups = {};
    let totalCount = 0;
    
    Object.entries(institutionsData).forEach(([category, institutions]) => {
        institutions.forEach(institution => {
            const region = extractRegionFromAddress(institution.address);
            if (!regionGroups[region]) {
                regionGroups[region] = [];
            }
            regionGroups[region].push(institution);
            totalCount++;
        });
    });
    
    // 지역별 리스트 렌더링
    regionList.innerHTML = '';
    Object.keys(regionGroups).sort().forEach(region => {
        const count = regionGroups[region].length;
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${region}</span>
            <span class="count">${count}</span>
        `;
        li.onclick = () => showInstitutionsByRegion(region, regionGroups[region]);
        regionList.appendChild(li);
    });
    
    // 총 기관 수 업데이트
    document.getElementById('institutions-total-count').textContent = totalCount;
    
    // 기본적으로 첫 번째 지역 선택
    const firstRegion = Object.keys(regionGroups).sort()[0];
    if (firstRegion) {
        showInstitutionsByRegion(firstRegion, regionGroups[firstRegion]);
    }
}

// 특정 지역의 기관들 표시
function showInstitutionsByRegion(region, institutions) {
    const regionList = document.getElementById('institutions-region-list');
    const detailTitle = document.getElementById('institutions-detail-title');
    const detailTbody = document.getElementById('institutions-detail-tbody');
    
    // 활성 지역 표시
    regionList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
    regionList.querySelectorAll('li').forEach(li => {
        if (li.querySelector('span').textContent === region) {
            li.classList.add('active');
        }
    });
    
    // 제목 업데이트
    detailTitle.textContent = region;
    
    // 기관 목록 렌더링
    detailTbody.innerHTML = '';
    institutions.forEach(institution => {
        const row = document.createElement('tr');
        row.setAttribute('data-institution-id', institution.id);
        row.innerHTML = `
            <td>${institution.name || ''}</td>
            <td>${institution.fullName || ''}</td>
            <td>${institution.abbreviation || ''}</td>
            <td>${institution.address || ''}</td>
            <td>
                <button class="contact-open-btn" onclick="openInstitutionContacts('${institution.id}')" title="연락처 보기">
                    <i class="fas fa-address-book"></i>
                </button>
            </td>
            <td class="action-col">
                <div class="table-actions">
                    <button class="table-action-btn edit" onclick="editInstitution('${institution.id}')" title="수정">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="table-action-btn delete" onclick="deleteInstitution('${getInstitutionCategory(institution.id)}','${institution.id}')" title="삭제">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        detailTbody.appendChild(row);
    });
    
    // 지도 뷰인 경우 지도 업데이트
    if (isMapView) {
        showInstitutionsOnMap();
    }
}

// 기관의 카테고리 찾기
function getInstitutionCategory(institutionId) {
    for (const [category, institutions] of Object.entries(institutionsData)) {
        if (institutions.find(inst => inst.id === institutionId)) {
            return category;
        }
    }
    return '기타';
}

// 지도 관련 변수
let map = null;
let markers = [];
let isMapView = false;
let markerClusterer = null;
const geocodeCache = new Map(); // address -> {lat, lng}

// 지도 뷰 토글
function toggleMapView() {
    const mapBtn = document.getElementById('map-view-btn');
    const tableView = document.getElementById('table-view');
    const mapView = document.getElementById('map-view');
    
    isMapView = !isMapView;
    
    if (isMapView) {
        mapBtn.classList.add('active');
        mapBtn.innerHTML = '<i class="fas fa-table"></i> 테이블로 보기';
        tableView.style.display = 'none';
        mapView.style.display = 'block';
        initializeMap();
        showInstitutionsOnMap();
    } else {
        mapBtn.classList.remove('active');
        mapBtn.innerHTML = '<i class="fas fa-map"></i> 지도로 보기';
        tableView.style.display = 'block';
        mapView.style.display = 'none';
    }
}

// 지도 초기화
function initializeMap() {
	if (map) return; // 이미 초기화된 경우
	
	const mapContainer = document.getElementById('seoul-map');
	const options = {
		center: new kakao.maps.LatLng(37.5665, 126.9780), // 서울시청
		level: 8
	};
	
	map = new kakao.maps.Map(mapContainer, options);
}

// 지도에 기관들 표시
function showInstitutionsOnMap() {
	if (!map) return;
	
	// 기존 마커들 제거
	markers.forEach(marker => marker.setMap(null));
	markers = [];
	
	// 현재 선택된 지역의 기관들만 표시
	const currentGrouping = document.querySelector('.grouping-btn.active').id;
	
	let institutionsToShow = [];
	
	if (currentGrouping === 'category-grouping') {
		Object.values(institutionsData).forEach(institutions => {
			institutionsToShow = institutionsToShow.concat(institutions);
		});
	} else if (currentGrouping === 'region-grouping') {
		const activeRegion = document.querySelector('#institutions-region-list li.active span').textContent;
		Object.entries(institutionsData).forEach(([category, institutions]) => {
			institutions.forEach(institution => {
				const region = extractRegionFromAddress(institution.address);
				if (region === activeRegion) {
					institutionsToShow.push(institution);
				}
			});
		});
	} else if (currentGrouping === 'region-all-grouping') {
		Object.values(institutionsData).forEach(list => {
			institutionsToShow = institutionsToShow.concat(list);
		});
	}
	
	// 주소를 좌표로 변환하여 마커 표시 (Kakao Geocoder)
	const geocoder = new kakao.maps.services.Geocoder();
	const bounds = new kakao.maps.LatLngBounds();
	const newMarkers = [];
	
	const addMarker = (institution, lat, lng) => {
		const coords = new kakao.maps.LatLng(lat, lng);
		const marker = new kakao.maps.Marker({ position: coords });
		const infowindow = new kakao.maps.InfoWindow({
			content: `
				<div style="padding: 10px; min-width: 200px;">
					<h4 style="margin: 0 0 5px 0; font-size: 14px;">${institution.name || '기관명 없음'}</h4>
					<p style="margin: 0 0 5px 0; font-size: 12px; color: #666;">${institution.address || '주소 없음'}</p>
					<button onclick="openInstitutionContacts('${institution.id}')" style="background: #007bff; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
						연락처 보기
					</button>
				</div>`
		});
		kakao.maps.event.addListener(marker, 'click', function() { infowindow.open(map, marker); });
		newMarkers.push(marker);
		bounds.extend(coords);
	};
	
	const tasks = institutionsToShow.map(inst => {
		return new Promise((resolve) => {
			if (!inst.address) return resolve();
			const cached = geocodeCache.get(inst.address);
			if (cached) {
				addMarker(inst, cached.lat, cached.lng);
				return resolve();
			}
			geocoder.addressSearch(inst.address, function(result, status) {
				if (status === kakao.maps.services.Status.OK) {
					const lat = Number(result[0].y);
					const lng = Number(result[0].x);
					geocodeCache.set(inst.address, { lat, lng });
					addMarker(inst, lat, lng);
				}
				resolve();
			});
		});
	});
	
	Promise.all(tasks).then(() => {
		// 기존 단일 마커 제거
		markers.forEach(m => m.setMap(null));
		markers = newMarkers;
		
		// 클러스터러 초기화/갱신
		if (!markerClusterer) {
			markerClusterer = new kakao.maps.MarkerClusterer({
				map: map,
				averageCenter: true,
				minLevel: 7
			});
		}
		markerClusterer.clear();
		markerClusterer.addMarkers(markers);
		
		// 마커가 있으면 지도 범위 맞춤
		if (!bounds.isEmpty()) {
			map.setBounds(bounds);
		}
	});
}

// 지역별 보기에서 지역 변경 시 지도 업데이트
function updateMapForRegion() {
    if (isMapView) {
        showInstitutionsOnMap();
    }
}

// 탭 전환
function switchTab(tabName) {
    // 탭 버튼 상태 변경
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // 탭 콘텐츠 상태 변경
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');

    currentTab = tabName;
    renderTable();
}



// 테이블 행 추가
function addTableRow(category) {
    // 카테고리 배열 보장
    if (!Array.isArray(tableData[category])) tableData[category] = [];

    const newRow = {
        id: generateId(),
        institution: '',
        customer: '',
        title: '',
        email: ''
    };
    
    tableData[category].push(newRow);
    saveDataToLocalStorage();
    // 현재 탭이 다른 경우에도 사용자에게 즉시 보이도록 현재 탭을 해당 카테고리로 전환
    if (currentTab !== category) {
        switchTab(category);
        return;
    }
    renderTable();
    syncDataToServer();
}

// 테이블 행 삭제
function deleteTableRow(category, rowId) {
    if (confirm('정말로 이 행을 삭제하시겠습니까?')) {
        // 즉시 UI에서 제거
        const row = document.querySelector(`[data-row-id="${rowId}"]`);
        if (row) {
            row.remove();
            // 빈 테이블 처리
            const tbody = document.getElementById(`${category}-tbody`);
            if (tbody && tbody.children.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="empty-table">
                            <i class="fas fa-table"></i>
                            <h3>데이터가 없습니다</h3>
                            <p>행 추가 버튼을 클릭하여 데이터를 추가해보세요!</p>
                        </td>
                    </tr>
                `;
            }
        }
        
        // 삭제된 항목 추적에 추가
        deletedTableRows.add(rowId);
        saveDeletedItems();
        updateDeletedItemsCount();
        
        // 데이터에서 제거
        tableData[category] = tableData[category].filter(row => row.id !== rowId);
        saveDataToLocalStorage();
        
        // 즉시 서버 동기화
        syncDataToServer();
    }
}

// 테이블 데이터 업데이트
function updateTableData(category, rowId, field, value) {
    const row = tableData[category].find(r => r.id === rowId);
    if (row) {
        row[field] = value;
        saveDataToLocalStorage();
        syncDataToServer();
    }
}

// 데이터를 기관별로 그룹핑
function groupDataByInstitution(data) {
    const groups = {};
    const ungrouped = [];
    
    data.forEach(row => {
        const institution = row.institution.trim();
        if (institution) {
            if (!groups[institution]) {
                groups[institution] = [];
            }
            groups[institution].push(row);
        } else {
            ungrouped.push(row);
        }
    });
    
    return { groups, ungrouped };
}

// 모든 이메일 복사
function copyAllEmails(category) {
    const emails = tableData[category]
        .filter(row => row.email && row.email.trim() !== '')
        .map(row => row.email)
        .join(', ');
    
    if (emails === '') {
        alert('복사할 이메일이 없습니다.');
        return;
    }
    
    navigator.clipboard.writeText(emails).then(() => {
        alert(`${category.toUpperCase()} 탭의 모든 이메일이 클립보드에 복사되었습니다!`);
    }).catch(err => {
        // 폴백: 텍스트 영역을 사용한 복사
        const textArea = document.createElement('textarea');
        textArea.value = emails;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert(`${category.toUpperCase()} 탭의 모든 이메일이 클립보드에 복사되었습니다!`);
    });
}

// GP suggestions cache
let __gpSuggestionsCache = null;
function getGpSuggestionsCached() {
  try {
    if (Array.isArray(__gpSuggestionsCache)) return __gpSuggestionsCache;
    const names = Object.values(gpsData || {})
      .flat()
      .map(g => g && g.name ? String(g.name) : '')
      .filter(Boolean);
    __gpSuggestionsCache = Array.from(new Set(names)).sort((a,b)=>a.localeCompare(b,'en',{ignoreCase:true}));
    return __gpSuggestionsCache;
  } catch (_) { return []; }
}
function invalidateGpSuggestionsCache() { __gpSuggestionsCache = null; }

// 테이블 렌더링
function renderTable() {
    const tbody = document.getElementById(`${currentTab}-tbody`);
    const data = tableData[currentTab];
    
    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-table">
                    <i class="fas fa-table"></i>
                    <h3>데이터가 없습니다</h3>
                    <p>행 추가 버튼을 클릭하여 데이터를 추가해보세요!</p>
                </td>
            </tr>
        `;
        scheduleAutoFitDashboard();
        return;
    }
    
    // 기존 리사이즈 이벤트 제거
    const table = document.getElementById(`${currentTab}-table`);
    if (table) {
        const headers = table.querySelectorAll('th');
        headers.forEach(header => {
            header.removeEventListener('mousedown', header._resizeHandler);
        });
    }
    
    // 그룹 헤더 제거: 모든 항목을 일반 행으로 렌더링
    let rowNumber = 1;
    let html = '';

    data.forEach(row => {
        html += `
            <tr data-row-id="${row.id}">
                <td class="number-col">${rowNumber++}</td>
                <td>
                    <input type="text" 
                           value="${row.institution || ''}" 
                           placeholder="기관명 입력"
                           data-row-id="${row.id}">
                </td>
                <td>
                    <input type="text" 
                           value="${row.customer || ''}" 
                           placeholder="고객명 입력"
                           onchange="updateTableData('${currentTab}', '${row.id}', 'customer', this.value)">
                </td>
                <td>
                    <input type="text" 
                           value="${row.title || ''}" 
                           placeholder="직급 입력"
                           onchange="updateTableData('${currentTab}', '${row.id}', 'title', this.value)">
                </td>
                <td>
                    <input type="email" 
                           value="${row.email || ''}" 
                           placeholder="이메일 입력"
                           onchange="updateTableData('${currentTab}', '${row.id}', 'email', this.value)">
                </td>
                <td class="action-col">
                    <div class="table-actions">
                        <button class="table-action-btn delete" 
                                onclick="deleteTableRow('${currentTab}', '${row.id}')" 
                                title="행 삭제">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // 기관명 입력: 포커스 시 1회 자동완성 초기화(지연 로딩)
    const institutionInputs = tbody.querySelectorAll('input[placeholder="기관명 입력"]');
    const suggestions = getGpSuggestionsCached();
    institutionInputs.forEach(input => {
        input.addEventListener('focus', () => {
            if (input._acInited) return;
            input._acInited = true;
            createAutocompleteInput(input, suggestions, (selectedValue) => {
                const rowId = input.getAttribute('data-row-id');
                updateTableData(currentTab, rowId, 'institution', selectedValue);
            });
        }, { once: true });
        input.addEventListener('change', () => {
            const rowId = input.getAttribute('data-row-id');
            updateTableData(currentTab, rowId, 'institution', input.value);
        });
    });
    
    // 리사이즈 기능 재초기화 (rAF로 프레임 단위 배치)
    requestAnimationFrame(() => {
        const table = document.getElementById(`${currentTab}-table`);
        if (table) {
            initializeColumnResize();
            restoreColumnWidths(table);
        }
        scheduleAutoFitDashboard();
    });
}

// 같은 기관에 행 추가
function addRowToInstitution(category, institution) {
    const newRow = {
        id: generateId(),
        institution: institution,
        customer: '',
        email: ''
    };
    
    tableData[category].push(newRow);
    saveDataToLocalStorage();
    renderTable();
    syncDataToServer();
}

// RFP 행 추가
function addRfpRow() {
    const newRfp = {
        id: generateId(),
        institutionCategory: '',
        institution: '',
        type: 'RFP',
        strategy: 'PE',
        announcementDate: '',
        deadline: '',
        participatingGps: [],
        selectedGps: [],
        memos: []
    };
    
    rfpData.push(newRfp);
    saveDataToLocalStorage();
    renderRfpTable();
    syncDataToServer();
}

// RFP 행 삭제
function deleteRfpRow(rfpId) {
    if (confirm('정말로 이 공고를 삭제하시겠습니까?')) {
        // 즉시 UI에서 제거
        const row = document.querySelector(`[data-rfp-id="${rfpId}"]`);
        if (row) {
            row.remove();
            // 빈 테이블 처리
            const tbody = document.querySelector('#rfp-table tbody');
            if (tbody && tbody.children.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="empty-table">
                            <i class="fas fa-table"></i>
                            <h3>데이터가 없습니다</h3>
                            <p>공고 추가 버튼을 클릭하여 데이터를 추가해보세요!</p>
                        </td>
                    </tr>
                `;
            }
        }
        
        // 삭제된 항목 추적에 추가
        deletedRfpRows.add(rfpId);
        saveDeletedItems();
        updateDeletedItemsCount();
        
        // 데이터에서 제거
        rfpData = rfpData.filter(rfp => rfp.id !== rfpId);
        saveDataToLocalStorage();
        
        // 즉시 서버 동기화
        syncDataToServer();
    }
}

// RFP 데이터 업데이트
function updateRfpData(rfpId, field, value) {
    const rfp = rfpData.find(r => r.id === rfpId);
    if (rfp) {
        rfp[field] = value;
        saveDataToLocalStorage();
        // 기관/분류 변경 시 LP 리스트 동기화
        if (field === 'institution' || field === 'institutionCategory') {
            syncInstitutionsFromRfp();
        }
        syncDataToServer();
    }
}

// GP 추가
function addGpToRfp(rfpId) {
    const gpSuggestions = getGpSuggestions();
    if (gpSuggestions.length === 0) {
        alert('먼저 GP 관리에서 GP를 추가해주세요.');
        return;
    }
    
    // 간단한 선택 다이얼로그 생성
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 12px;
        max-width: 400px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
    `;
    
    content.innerHTML = `
        <h3 style="margin-bottom: 15px;">GP 선택</h3>
        <input type="text" id="gp-search" placeholder="GP명 검색..." style="width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 6px;">
        <div id="gp-list" style="max-height: 300px; overflow-y: auto;">
            ${gpSuggestions.map(gp => `
                <div class="gp-option" data-gp="${gp}" style="padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; transition: background 0.2s;">
                    ${gp}
                </div>
            `).join('')}
        </div>
        <div style="margin-top: 15px; text-align: right;">
            <button onclick="this.closest('.gp-dialog').remove()" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer;">취소</button>
        </div>
    `;
    
    dialog.className = 'gp-dialog';
    dialog.appendChild(content);
    document.body.appendChild(dialog);
    
    // 검색 기능
    const searchInput = content.querySelector('#gp-search');
    const gpList = content.querySelector('#gp-list');
    const gpOptions = gpList.querySelectorAll('.gp-option');
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        gpOptions.forEach(option => {
            const gpName = option.getAttribute('data-gp').toLowerCase();
            if (gpName.includes(query)) {
                option.style.display = 'block';
            } else {
                option.style.display = 'none';
            }
        });
    });
    
    // GP 선택
    gpOptions.forEach(option => {
        option.addEventListener('click', () => {
            const selectedGp = option.getAttribute('data-gp');
            const rfp = rfpData.find(r => r.id === rfpId);
            if (rfp && !rfp.participatingGps.includes(selectedGp)) {
                rfp.participatingGps.push(selectedGp);
                saveDataToLocalStorage();
                renderRfpTable();
                syncDataToServer();
            }
            dialog.remove();
        });
        
        option.addEventListener('mouseenter', () => {
            option.style.backgroundColor = '#f8f9fa';
        });
        
        option.addEventListener('mouseleave', () => {
            option.style.backgroundColor = 'transparent';
        });
    });
    
    // 검색 입력에 포커스
    searchInput.focus();
}

// GP 제거
function removeGpFromRfp(rfpId, gpName) {
    const rfp = rfpData.find(r => r.id === rfpId);
    if (rfp) {
        rfp.participatingGps = rfp.participatingGps.filter(gp => gp !== gpName);
        saveDataToLocalStorage();
        renderRfpTable();
        syncDataToServer();
    }
}

// GP를 알파벳 순으로 그룹핑
function groupGpsAlphabetically(gps) {
    const groups = {};
    const safeGps = Array.isArray(gps) ? gps : [];
    safeGps.forEach(gp => {
        const firstLetter = (gp || '').toString().charAt(0).toUpperCase();
        if (!firstLetter) return;
        if (!groups[firstLetter]) {
            groups[firstLetter] = [];
        }
        groups[firstLetter].push(gp);
    });
    Object.keys(groups).forEach(letter => {
        groups[letter].sort((a, b) => a.localeCompare(b, 'en', { ignoreCase: true }));
    });
    return groups;
}

// GP 수정
function editGp(rfpId, oldGpName) {
    const newGpName = prompt('GP명을 수정하세요:', oldGpName);
    if (newGpName && newGpName.trim() && newGpName.trim() !== oldGpName) {
        const rfp = rfpData.find(r => r.id === rfpId);
        if (rfp) {
            const index = rfp.participatingGps.indexOf(oldGpName);
            if (index !== -1) {
                rfp.participatingGps[index] = newGpName.trim();
                saveDataToLocalStorage();
                renderRfpTable();
                syncDataToServer();
            }
        }
    }
}

// RFP 테이블 렌더링
function renderRfpTable() {
    const tbody = document.getElementById('rfp-tbody');
    
    if (rfpData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-table">
                    <i class="fas fa-file-contract"></i>
                    <h3>등록된 공고가 없습니다</h3>
                    <p>공고 추가 버튼을 클릭하여 공고를 추가해보세요!</p>
                </td>
            </tr>
        `;
        scheduleAutoFitDashboard();
        return;
    }
    
    tbody.innerHTML = rfpData.map((rfp, index) => {
        // participatingGps 기본값 보정
        if (!Array.isArray(rfp.participatingGps)) {
            rfp.participatingGps = [];
        }
        if (!Array.isArray(rfp.selectedGps)) {
            rfp.selectedGps = [];
        }
        if (!Array.isArray(rfp.memos)) {
            rfp.memos = [];
        }

        // 대소문자 무시 정렬
        const sortedGps = [...rfp.participatingGps].sort((a, b) =>
            String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
        );
        const gpHtml = sortedGps.map(gp => `
                <span class="gp-tag">
                    ${gp}
                    <button class="edit-gp" onclick="editGp('${rfp.id}', '${gp}')" title="수정">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="remove-gp" onclick="removeGpFromRfp('${rfp.id}', '${gp}')" title="제거">
                        <i class="fas fa-times"></i>
                    </button>
                </span>
        `).join('');

        const sortedSelected = [...rfp.selectedGps].sort((a, b) =>
            String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
        );
        const selectedHtml = sortedSelected.map(gp => `
                <span class="gp-tag">
                    ${gp}
                    <button class="edit-gp" onclick="editSelectedGp('${rfp.id}', '${gp}')" title="수정">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="remove-gp" onclick="removeSelectedGpFromRfp('${rfp.id}', '${gp}')" title="제거">
                        <i class="fas fa-times"></i>
                    </button>
                </span>
        `).join('');

        // 메모 표시: 칩 대신 '메모 됨' 텍스트 + 툴팁, 편집 버튼
        const memosSafe = Array.isArray(rfp.memos) ? rfp.memos : [];
        const memoText = memosSafe.map(m => String(m)).join('\n');
        const memoHtml = memosSafe.length > 0
            ? `
                <span class="memo-indicator" title="${escapeHtml(memoText)}">메모 됨</span>
                <button class="add-gp-btn" onclick="editMemoOnRfp('${rfp.id}', 0)" title="메모 수정">
                    <i class="fas fa-edit"></i>
                </button>
            `
            : `
                <button class="add-gp-btn" onclick="addMemoToRfp('${rfp.id}')" title="메모 추가">
                    <i class="fas fa-plus"></i>
                </button>
            `;
        
        return `
            <tr data-rfp-id="${rfp.id}">
                <td class="number-col">${index + 1}</td>
                <td class="institution-cell">
                    <select onchange="handleDropdownChange(this, 'institutionCategory', '${rfp.id}'); updateInstitutionDropdown('${rfp.id}', this.value)" style="margin-bottom: 5px; width: 100%;">
                        <option value="">기관 분류 선택</option>
                        <option value="연기금" ${rfp.institutionCategory === '연기금' ? 'selected' : ''}>연기금</option>
                        <option value="공제회" ${rfp.institutionCategory === '공제회' ? 'selected' : ''}>공제회</option>
                        <option value="보험사" ${rfp.institutionCategory === '보험사' ? 'selected' : ''}>보험사</option>
                        <option value="중앙회" ${rfp.institutionCategory === '중앙회' ? 'selected' : ''}>중앙회</option>
                        <option value="은행" ${rfp.institutionCategory === '은행' ? 'selected' : ''}>은행</option>
                        <option value="증권사" ${rfp.institutionCategory === '증권사' ? 'selected' : ''}>증권사</option>
                        <option value="운용사" ${rfp.institutionCategory === '운용사' ? 'selected' : ''}>운용사</option>
                        <option value="캐피탈" ${rfp.institutionCategory === '캐피탈' ? 'selected' : ''}>캐피탈</option>
                        <option value="기타" ${rfp.institutionCategory === '기타' ? 'selected' : ''}>기타</option>
                    </select>
                    <input type="text" 
                           id="institutionCategory-custom-${rfp.id}"
                           value="${rfp.institutionCategory !== '연기금' && rfp.institutionCategory !== '공제회' && rfp.institutionCategory !== '보험사' && rfp.institutionCategory !== '중앙회' && rfp.institutionCategory !== '은행' && rfp.institutionCategory !== '증권사' && rfp.institutionCategory !== '운용사' && rfp.institutionCategory !== '캐피탈' && rfp.institutionCategory !== '기타' && rfp.institutionCategory ? rfp.institutionCategory : ''}"
                           placeholder="기타 기관 분류 입력"
                           onchange="updateRfpData('${rfp.id}', 'institutionCategory', this.value)"
                           style="width: 100%; margin-bottom: 5px; display: ${rfp.institutionCategory === '기타' ? 'block' : 'none'};">
                    <select id="institution-dropdown-${rfp.id}" 
                            onchange="handleDropdownChange(this, 'institution', '${rfp.id}')" 
                            style="width: 100%;"
                            ${!rfp.institutionCategory ? 'disabled' : ''}>
                        <option value="">기관명 선택</option>
                    </select>
                    <input type="text" 
                           id="institution-custom-${rfp.id}"
                           value="${rfp.institution !== '' && !institutionsData[rfp.institutionCategory]?.some(inst => inst.name === rfp.institution) ? rfp.institution : ''}"
                           placeholder="기타 기관명 입력"
                           onchange="updateRfpData('${rfp.id}', 'institution', this.value)"
                           style="width: 100%; display: ${rfp.institution === '기타' ? 'block' : 'none'};">
                </td>
                <td class="type-cell">
                    <select onchange="handleDropdownChange(this, 'type', '${rfp.id}')">
                        <option value="RFP" ${rfp.type === 'RFP' ? 'selected' : ''}>RFP</option>
                        <option value="RFI" ${rfp.type === 'RFI' ? 'selected' : ''}>RFI</option>
                        <option value="기타" ${rfp.type === '기타' ? 'selected' : ''}>기타</option>
                    </select>
                    <input type="text" 
                           id="type-custom-${rfp.id}"
                           value="${rfp.type !== 'RFP' && rfp.type !== 'RFI' && rfp.type !== '기타' ? rfp.type : ''}"
                           placeholder="기타 종류 입력"
                           onchange="updateRfpData('${rfp.id}', 'type', this.value)"
                           style="width: 100%; margin-top: 5px; display: ${rfp.type === '기타' ? 'block' : 'none'};">
                </td>
                <td class="strategy-cell">
                    <select onchange="updateRfpData('${rfp.id}', 'strategy', this.value); handleStrategyChange('${rfp.id}', this.value)">
                        <option value="PE" ${rfp.strategy === 'PE' ? 'selected' : ''}>PE</option>
                        <option value="PD" ${rfp.strategy === 'PD' ? 'selected' : ''}>PD</option>
                        <option value="Real Estate Equity" ${rfp.strategy === 'Real Estate Equity' ? 'selected' : ''}>Real Estate Equity</option>
                        <option value="Real Estate Debt" ${rfp.strategy === 'Real Estate Debt' ? 'selected' : ''}>Real Estate Debt</option>
                        <option value="Infra Equity" ${rfp.strategy === 'Infra Equity' ? 'selected' : ''}>Infra Equity</option>
                        <option value="Infra Debt" ${rfp.strategy === 'Infra Debt' ? 'selected' : ''}>Infra Debt</option>
                        <option value="기타" ${rfp.strategy === '기타' ? 'selected' : ''}>기타</option>
                    </select>
                    <input type="text" 
                           id="strategy-custom-${rfp.id}"
                           value="${rfp.strategy !== 'PE' && rfp.strategy !== 'PD' && rfp.strategy !== 'Real Estate Equity' && rfp.strategy !== 'Real Estate Debt' && rfp.strategy !== 'Infra Equity' && rfp.strategy !== 'Infra Debt' && rfp.strategy !== '기타' ? rfp.strategy : ''}"
                           placeholder="기타 전략 입력"
                           onchange="updateRfpData('${rfp.id}', 'strategy', this.value)"
                           style="width: 100%; margin-top: 5px; display: ${rfp.strategy === '기타' ? 'block' : 'none'};">
                </td>
                <td class="date-cell">
                    <input type="date" 
                           value="${rfp.announcementDate || ''}" 
                           onchange="updateRfpData('${rfp.id}', 'announcementDate', this.value)">
                </td>
                <td class="date-cell">
                    <input type="date" 
                           value="${rfp.deadline || ''}" 
                           onchange="updateRfpData('${rfp.id}', 'deadline', this.value)">
                </td>
                <td class="gp-cell">
                    <div class="gp-list">
                        ${gpHtml}
                        <button class="add-gp-btn" onclick="addGpToRfp('${rfp.id}')" title="GP 추가">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </td>
                <td class="final-cell">
                    <div class="gp-list">
                        ${selectedHtml}
                        <button class="add-gp-btn" onclick="addSelectedGpToRfp('${rfp.id}')" title="최종 선정 추가">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </td>
                <td class="memo-cell">
                    <div class="memo-wrapper">
                        ${memoHtml}
                    </div>
                </td>
                <td class="action-col">
                    <div class="table-actions">
                        <button class="table-action-btn delete" 
                                onclick="deleteRfpRow('${rfp.id}')" 
                                title="공고 삭제">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    // 기관명 드롭다운 초기화
    setTimeout(() => {
        rfpData.forEach(rfp => {
            if (rfp.institutionCategory) {
                updateInstitutionDropdown(rfp.id, rfp.institutionCategory);
            }
        });
        
        // 리사이즈 기능 재초기화
        const table = document.getElementById('rfp-table');
        if (table) {
            initializeColumnResize();
            restoreColumnWidths(table);
        }
        scheduleAutoFitDashboard();
    }, 100);
}

// 최종 선정 GP 추가/수정/삭제
function addSelectedGpToRfp(rfpId) {
    const gpSuggestions = getGpSuggestions();
    if (gpSuggestions.length === 0) {
        alert('먼저 GP 관리에서 GP를 추가해주세요.');
        return;
    }
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000;`;
    const content = document.createElement('div');
    content.style.cssText = `background: white; padding: 20px; border-radius: 12px; max-width: 400px; width: 90%; max-height: 80vh; overflow-y: auto;`;
    content.innerHTML = `
        <h3 style="margin-bottom: 15px;">최종 선정 GP 선택</h3>
        <input type="text" id="sel-gp-search" placeholder="GP명 검색..." style="width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 6px;">
        <div id="sel-gp-list" style="max-height: 300px; overflow-y: auto;">
            ${gpSuggestions.map(gp => `
                <div class="gp-option" data-gp="${gp}" style="padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; transition: background 0.2s;">
                    ${gp}
                </div>
            `).join('')}
        </div>
        <div style="margin-top: 15px; text-align: right;">
            <button onclick="this.closest('.gp-dialog').remove()" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer;">취소</button>
        </div>`;
    dialog.className = 'gp-dialog';
    dialog.appendChild(content);
    document.body.appendChild(dialog);

    const searchInput = content.querySelector('#sel-gp-search');
    const gpList = content.querySelector('#sel-gp-list');
    const gpOptions = gpList.querySelectorAll('.gp-option');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        gpOptions.forEach(option => {
            const gpName = option.getAttribute('data-gp').toLowerCase();
            option.style.display = gpName.includes(query) ? 'block' : 'none';
        });
    });
    gpOptions.forEach(option => {
        option.addEventListener('click', () => {
            const selectedGp = option.getAttribute('data-gp');
            const rfp = rfpData.find(r => r.id === rfpId);
            if (rfp && !rfp.selectedGps.includes(selectedGp)) {
                rfp.selectedGps.push(selectedGp);
                saveDataToLocalStorage();
                renderRfpTable();
                syncDataToServer();
            }
            dialog.remove();
        });
        option.addEventListener('mouseenter', () => option.style.backgroundColor = '#f8f9fa');
        option.addEventListener('mouseleave', () => option.style.backgroundColor = 'transparent');
    });
    searchInput.focus();
}
function removeSelectedGpFromRfp(rfpId, gpName) {
    const rfp = rfpData.find(r => r.id === rfpId);
    if (rfp) {
        rfp.selectedGps = rfp.selectedGps.filter(gp => gp !== gpName);
        saveDataToLocalStorage();
        renderRfpTable();
        syncDataToServer();
    }
}
function editSelectedGp(rfpId, oldGpName) {
    const newGpName = prompt('최종 선정 GP명을 수정하세요:', oldGpName);
    if (newGpName && newGpName.trim() && newGpName.trim() !== oldGpName) {
        const rfp = rfpData.find(r => r.id === rfpId);
        if (rfp) {
            const index = rfp.selectedGps.indexOf(oldGpName);
            if (index !== -1) {
                rfp.selectedGps[index] = newGpName.trim();
                saveDataToLocalStorage();
                renderRfpTable();
                syncDataToServer();
            }
        }
    }
}

// ===== 메모 기능 =====
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function addMemoToRfp(rfpId) {
    const rfp = rfpData.find(r => r.id === rfpId);
    if (!rfp) return;
    if (!Array.isArray(rfp.memos)) rfp.memos = [];
    openMemoModal(rfpId, null, '');
}

function editMemoOnRfp(rfpId, index) {
    const rfp = rfpData.find(r => r.id === rfpId);
    if (!rfp || !Array.isArray(rfp.memos) || rfp.memos[index] === undefined) return;
    openMemoModal(rfpId, index, String(rfp.memos[index]));
}

function removeMemoFromRfp(rfpId, index) {
    const rfp = rfpData.find(r => r.id === rfpId);
    if (!rfp || !Array.isArray(rfp.memos) || rfp.memos[index] === undefined) return;
    if (!confirm('이 메모를 삭제하시겠습니까?')) return;
    rfp.memos.splice(index, 1);
    saveDataToLocalStorage();
    renderRfpTable();
    syncDataToServer();
}

// 모달 기반 메모 편집기
function openMemoModal(rfpId, memoIndex, initialText) {
    const modal = document.getElementById('memo-modal');
    const textarea = document.getElementById('memo-textarea');
    const saveBtn = document.getElementById('memo-save-btn');
    if (!modal || !textarea || !saveBtn) return;
    textarea.value = initialText || '';
    modal.style.display = 'block';
    textarea.focus();
    // 기존 핸들러 제거 후 재바인딩
    saveBtn.onclick = () => {
        const text = (textarea.value || '').trim();
        const rfp = rfpData.find(r => r.id === rfpId);
        if (!rfp) { closeMemoModal(); return; }
        if (!Array.isArray(rfp.memos)) rfp.memos = [];
        if (memoIndex == null) {
            if (!text) { closeMemoModal(); return; }
            rfp.memos.push(text);
        } else {
            rfp.memos[memoIndex] = text;
        }
        saveDataToLocalStorage();
        renderRfpTable();
        syncDataToServer();
        closeMemoModal();
    };
}

function closeMemoModal() {
    const modal = document.getElementById('memo-modal');
    if (modal) modal.style.display = 'none';
}

// RFP 테이블 필터링
function filterRfpTable() {
    const categoryFilter = document.getElementById('category-filter').value;
    const institutionFilter = document.getElementById('institution-filter').value.toLowerCase();
    const typeFilter = document.getElementById('type-filter').value;
    const strategyFilter = document.getElementById('strategy-filter').value;
    const announcementFilter = document.getElementById('announcement-filter').value;
    const deadlineFilter = document.getElementById('deadline-filter').value;
    const gpFilter = document.getElementById('gp-filter').value.toLowerCase();
    
    const rows = document.querySelectorAll('#rfp-tbody tr');
    
    rows.forEach(row => {
        if (row.querySelector('.empty-table')) return;
        
        // 각 열의 데이터 가져오기
        const category = row.querySelector('td:nth-child(2) select').value;
        const institution = row.querySelector('td:nth-child(2) select[id^="institution-dropdown"]').value.toLowerCase();
        const type = row.querySelector('td:nth-child(3) select').value;
        const strategy = row.querySelector('td:nth-child(4) select').value;
        const announcement = row.querySelector('td:nth-child(5) input').value;
        const deadline = row.querySelector('td:nth-child(6) input').value;
        const gps = row.querySelector('td:nth-child(7) .gp-list').textContent.toLowerCase();
        
        let show = true;
        
        // 기관 분류 필터
        if (categoryFilter && category !== categoryFilter) {
            show = false;
        }
        
        // 기관명 필터
        if (institutionFilter && !institution.includes(institutionFilter)) {
            show = false;
        }
        
        // 종류 필터
        if (typeFilter && type !== typeFilter) {
            show = false;
        }
        
        // 전략 필터
        if (strategyFilter && strategy !== strategyFilter) {
            show = false;
        }
        
        // 공고일 필터
        if (announcementFilter && announcement !== announcementFilter) {
            show = false;
        }
        
        // 마감일 필터
        if (deadlineFilter && deadline) {
            const deadlineDate = new Date(deadline);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            switch (deadlineFilter) {
                case 'today':
                    if (deadlineDate.getTime() !== today.getTime()) show = false;
                    break;
                case 'week':
                    const weekFromNow = new Date(today);
                    weekFromNow.setDate(today.getDate() + 7);
                    if (deadlineDate > weekFromNow) show = false;
                    break;
                case 'month':
                    const monthFromNow = new Date(today);
                    monthFromNow.setMonth(today.getMonth() + 1);
                    if (deadlineDate > monthFromNow) show = false;
                    break;
                case 'overdue':
                    if (deadlineDate >= today) show = false;
                    break;
            }
        }
        
        // 참여 GP 필터
        if (gpFilter && !gps.includes(gpFilter)) {
            show = false;
        }
        
        row.style.display = show ? '' : 'none';
    });
}

// RFP 필터 초기화
function clearRfpFilters() {
    document.getElementById('category-filter').value = '';
    document.getElementById('institution-filter').value = '';
    document.getElementById('type-filter').value = '';
    document.getElementById('strategy-filter').value = '';
    document.getElementById('announcement-filter').value = '';
    document.getElementById('deadline-filter').value = '';
    document.getElementById('gp-filter').value = '';
    filterRfpTable();
}

// 자동완성 기능
function createAutocompleteInput(inputElement, suggestions, onSelect) {
    const container = document.createElement('div');
    container.className = 'autocomplete-container';
    inputElement.parentNode.insertBefore(container, inputElement);
    container.appendChild(inputElement);
    inputElement.className = 'autocomplete-input';
    
    let dropdown = null;
    let selectedIndex = -1;
    
    function showDropdown() {
        if (dropdown) {
            dropdown.remove();
        }
        
        if (suggestions.length === 0) return;
        
        dropdown = document.createElement('div');
        dropdown.className = 'autocomplete-dropdown';
        
        suggestions.forEach((suggestion, index) => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = suggestion;
            item.addEventListener('click', () => {
                inputElement.value = suggestion;
                hideDropdown();
                if (onSelect) onSelect(suggestion);
            });
            dropdown.appendChild(item);
        });
        
        container.appendChild(dropdown);
    }
    
    function hideDropdown() {
        if (dropdown) {
            dropdown.remove();
            dropdown = null;
        }
        selectedIndex = -1;
    }
    
    function filterSuggestions(query) {
        if (!query) return [];
        return suggestions.filter(suggestion => 
            suggestion.toLowerCase().includes(query.toLowerCase())
        );
    }
    
    inputElement.addEventListener('input', (e) => {
        const query = e.target.value;
        const filtered = filterSuggestions(query);
        if (filtered.length > 0) {
            showDropdown();
        } else {
            hideDropdown();
        }
    });
    
    inputElement.addEventListener('focus', () => {
        const query = inputElement.value;
        const filtered = filterSuggestions(query);
        if (filtered.length > 0) {
            showDropdown();
        }
    });
    
    inputElement.addEventListener('blur', () => {
        setTimeout(hideDropdown, 200);
    });
    
    inputElement.addEventListener('keydown', (e) => {
        if (!dropdown) return;
        
        const items = dropdown.querySelectorAll('.autocomplete-item');
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                updateSelection(items);
                break;
            case 'ArrowUp':
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                updateSelection(items);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && items[selectedIndex]) {
                    inputElement.value = items[selectedIndex].textContent;
                    hideDropdown();
                    if (onSelect) onSelect(items[selectedIndex].textContent);
                }
                break;
            case 'Escape':
                hideDropdown();
                break;
        }
    });
    
    function updateSelection(items) {
        items.forEach((item, index) => {
            if (index === selectedIndex) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }
}

// GP 목록에서 자동완성 제안 가져오기
function getGpSuggestions() {
    const suggestions = [];
    Object.values(gpsData).forEach(gpList => {
        gpList.forEach(gp => {
            suggestions.push(gp.name);
        });
    });
    return suggestions;
}

// 기관 목록에서 자동완성 제안 가져오기
function getInstitutionSuggestions() {
    const suggestions = [];
    Object.values(institutionsData).forEach(institutionList => {
        institutionList.forEach(institution => {
            suggestions.push(institution.name);
        });
    });
    return suggestions;
}

// 기관 관리 함수들
function addInstitutionCategory() {
    const categoryName = prompt('새로운 기관 분류명을 입력하세요:');
    if (categoryName && categoryName.trim()) {
        institutionsData[categoryName.trim()] = [];
        saveDataToLocalStorage();
        renderInstitutionsDashboard();
        syncDataToServer();
    }
}

function addInstitution(category) {
    const institutionName = prompt(`${category}에 추가할 기관명을 입력하세요:`);
    if (institutionName && institutionName.trim()) {
        const newInstitution = {
            id: generateId(),
            name: institutionName.trim()
        };
        institutionsData[category].push(newInstitution);
        saveDataToLocalStorage();
        renderInstitutionsDashboard();
        syncDataToServer();
    }
}

function editInstitution(category, institutionId) {
    const institution = institutionsData[category].find(inst => inst.id === institutionId);
    if (!institution) return;
    
    const newName = prompt('기관명을 수정하세요:', institution.name);
    if (newName && newName.trim() && newName.trim() !== institution.name) {
        institution.name = newName.trim();
        saveDataToLocalStorage();
        renderInstitutionsDashboard();
        syncDataToServer();
    }
}

function deleteInstitution(category, institutionId) {
    if (confirm('정말로 이 기관을 삭제하시겠습니까?')) {
        // 즉시 UI에서 제거
        const row = document.querySelector(`[data-institution-id="${institutionId}"]`);
        if (row) {
            row.remove();
            // 빈 테이블 처리
            const tbody = document.querySelector(`#${category}-institutions-tbody`);
            if (tbody && tbody.children.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="empty-table">
                            <i class="fas fa-building"></i>
                            <h3>데이터가 없습니다</h3>
                            <p>기관 추가 버튼을 클릭하여 데이터를 추가해보세요!</p>
                        </td>
                    </tr>
                `;
            }
        }
        
        // 삭제된 항목 추적에 추가
        deletedInstitutions.add(institutionId);
        saveDeletedItems();
        updateDeletedItemsCount();
        
        // 데이터에서 제거
        institutionsData[category] = institutionsData[category].filter(inst => inst.id !== institutionId);
        saveDataToLocalStorage();
        
        // 즉시 서버 동기화
        syncDataToServer();
    }
}

function renderInstitutionsDashboard() {
    // 렌더 직전 선택/전체 중복 제거 및 저장
    try {
        const changedAll = dedupeInstitutionsData(false);
        const cats = Object.keys(institutionsData||{});
        cats.forEach(c => dedupeInstitutionsCategory(c, false));
        if (changedAll) { try { saveDataToLocalStorage(); } catch(_) {} try { syncDataToServer(); } catch(_) {} }
    } catch(_) {}
    const sidebar = document.getElementById('institutions-category-list');
    const detailTitle = document.getElementById('institutions-detail-title');
    const detailTbody = document.getElementById('institutions-detail-tbody');
    const totalCountEl = document.getElementById('institutions-total-count');
    if (!sidebar || !detailTitle || !detailTbody) return;

    // 카테고리 정렬 고정: 요청 순서 우선, 나머지 사전순
    const preferredOrder = ['연기금','공제회','보험사','중앙회','은행','증권사','운용사','캐피탈','기타'];
    const allCats = Object.keys(institutionsData || {});
    const orderedCats = [
        ...preferredOrder.filter(c => allCats.includes(c)),
        ...allCats.filter(c => !preferredOrder.includes(c)).sort((a,b)=>a.localeCompare(b,'ko'))
    ];

    // 선택값 기본 세팅
    if (!selectedInstitutionCategory || !orderedCats.includes(selectedInstitutionCategory)) {
        selectedInstitutionCategory = orderedCats[0] || '';
    }

    // 총 기관 수 계산
    const totalCount = orderedCats.reduce((acc, cat) => acc + ((institutionsData[cat] || []).length), 0);
    if (totalCountEl) totalCountEl.textContent = String(totalCount);

    // 사이드바 렌더
    sidebar.innerHTML = orderedCats.map(cat => {
        const count = Array.isArray(institutionsData[cat]) ? institutionsData[cat].length : 0;
        const active = cat === selectedInstitutionCategory ? 'active' : '';
        return `<li class="${active}" onclick="setSelectedInstitutionCategory('${cat}')">
                    <span>${cat}</span>
                    <span class="count">${count}</span>
                </li>`;
    }).join('');

    // 상세 테이블 렌더
    detailTitle.textContent = selectedInstitutionCategory || '카테고리';
    const rows = (institutionsData[selectedInstitutionCategory] || []);

    if (rows.length === 0) {
        detailTbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-table">
                    <i class="fas fa-building"></i>
                    <h3>등록된 기관이 없습니다</h3>
                    <p>오른쪽 상단의 기관 추가 버튼으로 등록하세요.</p>
                </td>
            </tr>
        `;
        return;
    }

    detailTbody.innerHTML = rows.map(inst => `
        <tr data-inst-id="${inst.id}">
            <td>
                <input type="text" value="${inst.name || ''}" title="${inst.name || ''}" placeholder="한글명" oninput="this.title=this.value" ondblclick="autoFitColumnForCell(this)" onchange="updateInstitutionField('${selectedInstitutionCategory}','${inst.id}','name', this.value)">
            </td>
            <td>
                <input type="text" value="${inst.englishFullName || ''}" title="${inst.englishFullName || ''}" placeholder="영문 전체 명칭" oninput="this.title=this.value" ondblclick="autoFitColumnForCell(this)" onchange="updateInstitutionField('${selectedInstitutionCategory}','${inst.id}','englishFullName', this.value)">
            </td>
            <td>
                <input type="text" value="${inst.abbreviation || ''}" title="${inst.abbreviation || ''}" placeholder="영문 약어" oninput="this.title=this.value" ondblclick="autoFitColumnForCell(this)" onchange="updateInstitutionField('${selectedInstitutionCategory}','${inst.id}','abbreviation', this.value)">
            </td>
            <td>
                <button class="address-edit-btn" onclick="openAddressModal('${selectedInstitutionCategory}','${inst.id}')">주소</button>
            </td>
            <td>
                <button class="add-institution-btn contact-open-btn" onclick="openInstitutionContactsDashboard('${inst.id}', '${(inst.name || '').replace(/'/g, "&#39;")}')">
                    <i class="fas fa-address-book"></i> Contact
                </button>
            </td>
            <td class="action-col">
                <div class="table-actions">
                    <button class="institution-action-btn delete" onclick="deleteInstitution('${selectedInstitutionCategory}','${inst.id}')" title="기관 삭제">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    // 더블클릭 자동 맞춤: 이벤트 위임(1회 바인딩)
    const tableEl = document.getElementById('institutions-detail-table');
    if (tableEl && !tableEl._autoFitBound) {
        tableEl.addEventListener('dblclick', (e) => {
            const target = e.target;
            const cell = target.closest('td, th');
            if (!cell || !tableEl.contains(cell)) return;
            autoFitColumnForCell(target);
        });
        tableEl._autoFitBound = true;
    }

    // LP 테이블 리사이즈 초기화/복원 보강
    const lpTable = document.getElementById('institutions-detail-table');
    if (lpTable) {
        initializeColumnResize();
        restoreColumnWidths(lpTable);
    }

    scheduleAutoFitDashboard();
}

function setSelectedInstitutionCategory(category) {
    selectedInstitutionCategory = category;
    renderInstitutionsDashboard();
}

function openAddInstitutionDialog() {
    // 선택된 카테고리 확인
    if (!selectedInstitutionCategory) {
        // 가능한 카테고리 중 첫 번째로 자동 선택
        const categories = Object.keys(institutionsData || {});
        if (categories.length === 0) return;
        selectedInstitutionCategory = categories[0];
    }

    // 빈 행 추가
    const newInstitution = {
        id: generateId(),
        name: '',
        englishFullName: '',
        abbreviation: '',
        addressKorean: '',
        addressEnglish: ''
    };
    institutionsData[selectedInstitutionCategory] = institutionsData[selectedInstitutionCategory] || [];
    institutionsData[selectedInstitutionCategory].push(newInstitution);
    saveDataToLocalStorage();
    renderInstitutionsDashboard();
    syncDataToServer();

    // UX: 방금 추가한 행의 첫 번째 입력에 포커스
    setTimeout(() => {
        const lastRowFirstInput = document.querySelector('#institutions-detail-tbody tr:last-child td:first-child input');
        if (lastRowFirstInput) lastRowFirstInput.focus();
    }, 0);
}

function updateInstitutionField(category, institutionId, field, value) {
    const list = institutionsData[category] || [];
    const item = list.find(i => i.id === institutionId);
    if (!item) return;
    item[field] = value;
    saveDataToLocalStorage();
    if (field === 'name') {
        document.querySelectorAll('[id^="institution-dropdown-"]').forEach(sel => {
        });
    }
    syncDataToServer();
}

// GP 관리 함수들
function addGpCategory() {
    const gpName = prompt('새로운 GP명을 입력하세요:');
    if (gpName && gpName.trim()) {
        const firstLetter = gpName.charAt(0).toUpperCase();
        if (!gpsData[firstLetter]) {
            gpsData[firstLetter] = [];
        }
        gpsData[firstLetter].push({
            id: generateId(),
            name: gpName.trim(),
            englishFullName: '',
            strategy: []
        });
        saveDataToLocalStorage();
        renderGpsDashboard();
        syncDataToServer();
    }
}

function addGpToCategory(letter) {
    const gpName = prompt(`${letter} 그룹에 추가할 GP명을 입력하세요:`);
    if (gpName && gpName.trim()) {
        if (!gpsData[letter]) {
            gpsData[letter] = [];
        }
        gpsData[letter].push({
            id: generateId(),
            name: gpName.trim(),
            englishFullName: '',
            strategy: []
        });
        saveDataToLocalStorage();
        renderGpsDashboard();
        syncDataToServer();
    }
}

function editGpInCategory(letter, gpId) {
    const gp = gpsData[letter].find(g => g.id === gpId);
    if (!gp) return;
    
    const newName = prompt('GP명을 수정하세요:', gp.name);
    if (newName && newName.trim() && newName.trim() !== gp.name) {
        gp.name = newName.trim();
        saveDataToLocalStorage();
        renderGpsDashboard();
        syncDataToServer();
    }
}

function deleteGpFromCategory(letter, gpId) {
    if (confirm('정말로 이 GP를 삭제하시겠습니까?')) {
        gpsData[letter] = gpsData[letter].filter(gp => gp.id !== gpId);
        saveDataToLocalStorage();
        renderGpsDashboard();
        syncDataToServer();
    }
}

function renderGpsDashboard() {
    const letterList = document.getElementById('gp-letter-list');
    const detailTitle = document.getElementById('gp-detail-title');
    const tbody = document.getElementById('gp-detail-tbody');
    const totalEl = document.getElementById('gps-total-count');
    if (!letterList || !detailTitle || !tbody) return;

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    // 기본 선택 보정
    if (!selectedGpLetter || !alphabet.includes(selectedGpLetter)) selectedGpLetter = 'A';

    // 총계
    const total = alphabet.reduce((sum, L) => sum + ((gpsData[L] || []).length), 0);
    if (totalEl) totalEl.textContent = String(total);

    // 좌측 레터 목록 렌더
    letterList.innerHTML = alphabet.map(L => {
        const count = (gpsData[L] || []).length;
        const active = L === selectedGpLetter ? 'active' : '';
        return `<li class="${active}" onclick="setSelectedGpLetter('${L}')">
                    <span>${L}</span>
                    <span class="count">${count}</span>
                </li>`;
    }).join('');

    // 전략 옵션 정의 (PE/PD → PE, PD로 분리)
    const STRATEGY_OPTIONS = ['PE','PD','Real Estate','Infra','Aviation','기타'];

    // 우측 상세 렌더
    detailTitle.textContent = `GP (${selectedGpLetter})`;
    const rows = gpsData[selectedGpLetter] || [];

    if (rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-table">
                    <i class="fas fa-user-friends"></i>
                    <h3>등록된 GP가 없습니다</h3>
                    <p>우측 상단의 GP 추가 버튼으로 등록하세요.</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map(gp => {
        const selected = Array.isArray(gp.strategy)
            ? gp.strategy
            : (gp.strategy ? [gp.strategy] : []);
        const tagsHtml = selected.length
            ? selected.map(s => `<span class="strategy-tag">${s}</span>`).join('')
            : '<span class="strategy-placeholder">전략 선택</span>';
        const menuHtml = STRATEGY_OPTIONS.map(opt => `
            <label class="strategy-option">
                <input type="checkbox" value="${opt}" ${selected.includes(opt) ? 'checked' : ''}>
                <span>${opt}</span>
            </label>
        `).join('');
        return `
        <tr data-gp-id="${gp.id}">
            <td>
                <input type="text" value="${gp.name || ''}" placeholder="GP명" onchange="updateGpField('${selectedGpLetter}','${gp.id}','name', this.value)">
            </td>
            <td>
                <input type="text" value="${gp.englishFullName || ''}" placeholder="영문 전체 명칭" onchange="updateGpField('${selectedGpLetter}','${gp.id}','englishFullName', this.value)">
            </td>
            <td>
                <div class="strategy-dropdown" data-letter="${selectedGpLetter}" data-id="${gp.id}">
                    <div class="strategy-display" tabindex="0">${tagsHtml}</div>
                    <div class="strategy-menu">${menuHtml}</div>
                </div>
            </td>
            <td class="action-col">
                <div class="table-actions">
                    <button class="add-institution-btn contact-open-btn" onclick="openGpContactsDashboard('${selectedGpLetter}','${gp.id}','${(gp.name || '').replace(/'/g, "&#39;")}')">
                        <i class="fas fa-address-book"></i> Contact
                    </button>
                </div>
            </td>
            <td class="action-col">
                <div class="table-actions">
                    <button class="institution-action-btn delete" onclick="deleteGpFromLetter('${selectedGpLetter}','${gp.id}')" title="GP 삭제">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    // 전략 드롭다운 이벤트 바인딩
    attachStrategyDropdownEvents();

    // 열 리사이즈 활성화 및 저장값 복원
    setTimeout(() => {
        const table = document.getElementById('gps-detail-table');
        if (table) {
            initializeColumnResize();
            restoreColumnWidths(table);
        }
        scheduleAutoFitDashboard();
    }, 50);
}

// 기존 데이터의 전략값 정규화: 'PE/PD' → ['PE','PD']
function normalizeGpStrategies() {
    const letters = Object.keys(gpsData || {});
    let changed = false;
    letters.forEach(L => {
        (gpsData[L] || []).forEach(gp => {
            if (!gp) return;
            if (Array.isArray(gp.strategy)) {
                if (gp.strategy.includes('PE/PD')) {
                    gp.strategy = Array.from(new Set(gp.strategy.flatMap(s => (s === 'PE/PD' ? ['PE','PD'] : [s]))));
                    changed = true;
                }
            } else if (typeof gp.strategy === 'string' && gp.strategy === 'PE/PD') {
                gp.strategy = ['PE','PD'];
                changed = true;
            }
        });
    });
    if (changed) {
        try { saveDataToLocalStorage(); } catch (e) {}
    }
}

// 좌측 레터 클릭 시 현재 선택 레터 갱신 및 재렌더
function setSelectedGpLetter(letter) {
  const upper = String(letter || '').toUpperCase();
  if (!/[A-Z]/.test(upper)) return;
  selectedGpLetter = upper;
  renderGpsDashboard();
}

// 전략 드롭다운 동작: 태그/체크박스 UI 처리 및 저장
function attachStrategyDropdownEvents() {
    // 닫기 헬퍼
    function closeAllStrategyMenus() {
        document.querySelectorAll('.strategy-dropdown.open').forEach(el => el.classList.remove('open'));
    }

    document.querySelectorAll('.strategy-dropdown').forEach(drop => {
        const display = drop.querySelector('.strategy-display');
        const menu = drop.querySelector('.strategy-menu');

        display.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = drop.classList.contains('open');
            closeAllStrategyMenus();
            if (!isOpen) drop.classList.add('open');
        });

        // 체크 변경 시 저장
        menu.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const selected = Array.from(menu.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
                const letter = drop.getAttribute('data-letter');
                const id = drop.getAttribute('data-id');
                updateGpStrategy(letter, id, selected);
                // 표시 업데이트
                display.innerHTML = selected.length
                    ? selected.map(s => `<span class=\"strategy-tag\">${s}</span>`).join('')
                    : '<span class="strategy-placeholder">전략 선택</span>';
            });
        });
    });

    // 외부 클릭 시 닫기
    document.addEventListener('click', closeAllStrategyMenus, { once: true });
}

function updateGpStrategy(letter, gpId, strategies) {
    const list = gpsData[letter] || [];
    const item = list.find(g => g.id === gpId);
    if (!item) return;
    item.strategy = Array.isArray(strategies) ? strategies : [];
    saveDataToLocalStorage();
    syncDataToServer();
}

// GP명을 기반으로 분류 레터 산출 (A~Z 외 문자는 A로 기본 처리)
function getLetterFromName(name) {
    if (!name || typeof name !== 'string') return 'A';
    const first = name.trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(first) ? first : 'A';
}

function openAddGpDialog() {
    // 사용자가 바로 GP명을 입력하면 자동 분류
    const inputName = prompt('추가할 GP명을 입력하세요 (영문권 추천):');
    const trimmed = (inputName || '').trim();

    if (trimmed) {
        const letter = getLetterFromName(trimmed);
        gpsData[letter] = gpsData[letter] || [];
        const newItem = {
            id: generateId(),
            name: trimmed,
            englishFullName: '',
            strategy: []
        };
        gpsData[letter].push(newItem);
        selectedGpLetter = letter;
        saveDataToLocalStorage();
        renderGpsDashboard();
        syncDataToServer();
        // UX: 방금 추가한 행의 첫 번째 입력에 포커스
        setTimeout(() => {
            const lastRowFirstInput = document.querySelector('#gp-detail-tbody tr:last-child td:first-child input');
            if (lastRowFirstInput) lastRowFirstInput.focus();
        }, 0);
        return;
    }

    // 이름을 입력하지 않은 경우: 기존 동작(현재 레터에 빈 행 추가)
    if (!selectedGpLetter) selectedGpLetter = 'A';
    gpsData[selectedGpLetter] = gpsData[selectedGpLetter] || [];
    gpsData[selectedGpLetter].push({
        id: generateId(),
        name: '',
        englishFullName: '',
        strategy: []
    });
    saveDataToLocalStorage();
    renderGpsDashboard();

    setTimeout(() => {
        const lastRowFirstInput = document.querySelector('#gp-detail-tbody tr:last-child td:first-child input');
        if (lastRowFirstInput) lastRowFirstInput.focus();
    }, 0);
}

function updateGpField(letter, gpId, field, value) {
    const list = gpsData[letter] || [];
    const item = list.find(g => g.id === gpId);
    if (!item) return;

    // 값 반영 (strategy는 별도 함수에서 처리)
    if (field !== 'strategy') {
        item[field] = value;
    }

    if (field === 'name') {
        const targetLetter = getLetterFromName(value);
        if (targetLetter !== letter) {
            // 다른 레터로 이동
            gpsData[letter] = list.filter(g => g.id !== gpId);
            gpsData[targetLetter] = gpsData[targetLetter] || [];
            gpsData[targetLetter].push(item);
            selectedGpLetter = targetLetter;
            saveDataToLocalStorage();
            renderGpsDashboard();
            syncDataToServer();
            return;
        }
    }

    saveDataToLocalStorage();
}

// 기존 추가 함수들도 기본 필드 포함되도록 보정
function addGpCategory() {
    const gpName = prompt('새로운 GP명을 입력하세요:');
    if (gpName && gpName.trim()) {
        const firstLetter = gpName.charAt(0).toUpperCase();
        if (!gpsData[firstLetter]) {
            gpsData[firstLetter] = [];
        }
        gpsData[firstLetter].push({
            id: generateId(),
            name: gpName.trim(),
            englishFullName: '',
            strategy: []
        });
        saveDataToLocalStorage();
        renderGpsDashboard();
        syncDataToServer();
    }
}

function addGpToCategory(letter) {
    const gpName = prompt(`${letter} 그룹에 추가할 GP명을 입력하세요:`);
    if (gpName && gpName.trim()) {
        if (!gpsData[letter]) {
            gpsData[letter] = [];
        }
        gpsData[letter].push({
            id: generateId(),
            name: gpName.trim(),
            englishFullName: '',
            strategy: []
        });
        saveDataToLocalStorage();
        renderGpsDashboard();
        syncDataToServer();
    }
}

function deleteGpFromLetter(letter, gpId) {
    if (!confirm('정말로 이 GP를 삭제하시겠습니까?')) return;
    // 즉시 UI에서 제거
    const row = document.querySelector(`[data-gp-id="${gpId}"]`);
    if (row) {
        row.remove();
        // 빈 테이블 처리
        const tbody = document.querySelector(`#${letter}-gps-tbody`);
        if (tbody && tbody.children.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-table">
                        <i class="fas fa-users"></i>
                        <h3>데이터가 없습니다</h3>
                        <p>GP 추가 버튼을 클릭하여 데이터를 추가해보세요!</p>
                    </td>
                </tr>
            `;
        }
    }
    
    // 삭제된 항목 추적에 추가
    deletedGps.add(gpId);
    saveDeletedItems();
    updateDeletedItemsCount();
    
    // 데이터에서 제거
    gpsData[letter] = (gpsData[letter] || []).filter(g => g.id !== gpId);
    saveDataToLocalStorage();
    
    // 즉시 서버 동기화
    syncDataToServer();
}

// ID 생성
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 기본 LP 데이터 정의
function getDefaultInstitutionsData() {
    const make = (koreanName, abbreviation = '', englishFullName = '') => ({
        id: generateId(),
        name: koreanName,
        abbreviation: abbreviation === '-' ? '' : abbreviation,
        englishFullName: englishFullName === '-' ? '' : englishFullName
    });

    return {
        연기금: [
            make('사학연금', 'KTP', "Korea Teachers' Pension"),
            make('공무원연금', 'GEPS', 'Government Employees Pension Service'),
            make('미래에셋증권 OCIO 고용기금 EIF', 'EIF', 'Mirae Asset Securities EIF (Employment Insurance Fund)'),
            make('미래에셋자산운용 국토부 주택도시기금 MOEL', 'MOEL', 'Mirae Asset AM MOEL (Ministry of Employment and Labor)'),
            make('NH투자증권 국토부 주택도시기금 MOEL', 'MOEL', 'NH Securities MOEL (Ministry of Employment and Labor)'),
            make('(우정사업본부) 우체국보험 / 우체국예금', '', 'K-Post Insurance / K-Post Savings')
        ],
        공제회: [
            make('한국교직원공제회', 'KTCU', 'Korea Teachers\' Credit Union'),
            make('전문건설공제회', 'K-FINCO', 'Korea Finance for Construction'),
            make('건설근로자공제회', 'CWMA', 'Construction Workers Mutual Aid Association'),
            make('행정공제회', 'POBA', 'Public Officials Benefit Association'),
            make('경찰공제회', 'PMAA', 'The Police Mutual Aid Association'),
            make('과학기술인공제회', 'SEMA', 'Korea Scientists & Engineers Mutual Aid Association'),
            make('군인공제회', 'MMAA', 'Military Mutual Aid Association'),
            make('엔지니어링공제조합', 'EGI', 'Engineering Guarantee Insurance'),
            make('소방공제회', 'FOCU', 'Korea Fire Officials Credit Union'),
            make('한국지방재정공제회', 'LOFA', 'Local Finance Association'),
            make('기계설비건설조합', '', ''),
            make('새마을금고복지회', 'KFCC', 'Korea Federation of Community Credit Cooperatives')
        ],
        중앙회: [
            make('수협중앙회', 'NFFC', 'National Federation of Fisheries Cooperatives'),
            make('농협중앙회', 'NACF', 'National Agricultural Cooperative Federation'),
            make('신협중앙회', 'CU', 'National Credit Union Federation of Korea'),
            make('중소기업중앙회', 'K-BIZ', 'Korea Federation of Small and Medium Business'),
            make('산림조합중앙회', '', 'National Forestry Cooperatives Federation')
        ],
        보험사: [
            make('코리안리', '', 'Korean Re'),
            make('서울보증보험', 'SGIC', 'Seoul Guarantee Insurance'),
            make('NH생명', '', 'NH Life'),
            make('미래에셋생명', '', 'Mirae Asset Life'),
            make('라이나생명', '', 'LINA Korea'),
            make('KDB생명', '', 'KDB Life'),
            make('교보생명', '', 'Kyobo Life'),
            make('하나생명', '', 'Hana Life'),
            make('IM라이프(前 DGB생명)', '', 'IM Life (DGB Life)'),
            make('한화생명', '', 'Hanwha Life'),
            make('푸본현대생명', '', 'Fubon Hyundai Life'),
            make('신한라이프', '', 'Shinhan Life'),
            make('삼성생명', '', 'Samsung Life'),
            make('동양생명', '', 'Tong Yang Life'),
            make('흥국생명', '', 'Heungkuk Life'),
            make('NH손보', '', 'NH Property & Casualty Insurance'),
            make('한화손보', '', 'Hanwha General Insurance'),
            make('MG손보', '', 'MG Insurance'),
            make('DB LDI (DB손보)', '', 'DB Insurance'),
            make('DB LDI (DB생명)', '', 'DB Life'),
            make('농협손보', '', 'NH Property & Casualty Insurance'),
            make('롯데손보', '', 'Lotte Non-Life Insurance'),
            make('삼성화재', '', 'Samsung Fire & Marine Insurance'),
            make('흥국화재', '', 'Heungkuk Fire & Marine Insurance'),
            make('메리츠화재', '', 'Meritz Fire & Marine Insurance'),
            make('현대해상', '', 'Hyundai Marine & Fire Insurance'),
            make('IBK연금보험', '', 'IBK Insurance'),
            make('하나손보', '', 'Hana Insurance'),
            make('ABL생명', '', 'ABL Life Insurance'),
            make('프리드라이프', '', 'Preedlife')
        ],
        은행: [
            make('우리은행', '', 'Woori Bank'),
            make('하나은행', '', 'KEB Hana Bank'),
            make('신한은행', '', 'Shinhan Bank'),
            make('DGB은행', '', 'Daegu Bank (IM Bank)'),
            make('IBK기업은행', 'IBK', 'Industrial Bank of Korea'),
            make('KB은행', '', 'KB Bank'),
            make('NH농협은행', '', 'NongHyup Bank'),
            make('KDB은행', 'KDB', 'Korea Development Bank'),
            make('MG새마을금고', 'KFCC', 'Korean Federation of Community Credit Cooperatives')
        ],
        증권사: [
            make('삼성증권', '', 'Samsung Securities'),
            make('NH투자증권', '', 'NH Investment & Securities'),
            make('신한투자증권', '', 'Shinhan Securities'),
            make('미래에셋증권', '', 'Mirae Asset Securities'),
            make('하나증권', '', 'Hana Financial Investment'),
            make('한국투자증권', 'KIS', 'Korea Investment & Securities'),
            make('KB증권 WM상품부', '', 'KB Securities Wealth Management Business Unit'),
            make('KB증권', '', 'KB Securities')
        ],
        운용사: [
            make('미래에셋자산운용', '', 'Mirae Asset Global Investments'),
            make('삼성자산운용', '', 'Samsung Asset Management'),
            make('신한자산운용', '', 'Shinhan Asset Management'),
            make('KB자산운용', '', 'KB Asset Management'),
            make('DB자산운용', '', 'Dongbu Asset Management'),
            make('삼성SRA자산운용', '', 'Samsung SRA Asset Management'),
            make('파인스트리트 자산운용', '', 'PineStreet Asset Management'),
            make('한국투자신탁운용', '', 'Korea Investment Management'),
            make('NH아문디 자산운용', '', ''),
            make('키움자산운용', '', ''),
            make('이지스자산운용', '', ''),
            make('보고자산운용', '', '')
        ],
        캐피탈: [
            make('신한캐피탈', '', 'Shinhan Capital'),
            make('IBK캐피탈', '', 'IBK Capital'),
            make('현대커머셜', '', 'Hyundai Commercial Inc'),
            make('현대카드', '', ''),
            make('NH캐피탈', '', 'NongHyup Capital'),
            make('KB캐피탈', '', 'KB Capital')
        ],
        기타: []
    };
}

// 연락처 맵 병합: {ownerId: Contact[]} 형태를 안전하게 합칩니다.
function mergeContactsMaps(baseMap, incomingMap) {
    const out = { ...(baseMap || {}) };
    const incoming = incomingMap || {};
    Object.entries(incoming).forEach(([owner, list]) => {
        const existing = Array.isArray(out[owner]) ? out[owner] : [];
        const seen = new Set(existing.map(c => c && c.id));
        const merged = existing.slice();
        (list || []).forEach(c => {
            const cid = c && c.id;
            if (!cid || !seen.has(cid)) {
                merged.push(c);
                if (cid) seen.add(cid);
            }
        });
        out[owner] = merged;
    });
    return out;
}

// LP 데이터 비어있는지 확인
function isInstitutionsDataEmpty(data) {
    const categories = Object.keys(data || {});
    if (categories.length === 0) return true;
    return categories.every(cat => !Array.isArray(data[cat]) || data[cat].length === 0);
}

// 사용자 ID 생성 및 관리
function generateUserId() {
    let userId = localStorage.getItem('userId');
    if (!userId) {
        // AV1 계정으로 통일
        userId = 'AV1';
        localStorage.setItem('userId', userId);
    }
    return userId;
}

// 현재 사용자 ID 가져오기
function getCurrentUserId() {
    return localStorage.getItem('userId') || generateUserId();
}

// 로컬 스토리지에 데이터 저장
function saveDataToLocalStorage() {
    localStorage.setItem('tableData', JSON.stringify(tableData));
    localStorage.setItem('rfpData', JSON.stringify(rfpData));
    localStorage.setItem('institutionsData', JSON.stringify(institutionsData));
    localStorage.setItem('gpsData', JSON.stringify(gpsData));
    localStorage.setItem('institutionsContacts', JSON.stringify(institutionsContacts));
    localStorage.setItem('gpContacts', JSON.stringify(gpContacts));
    localStorage.setItem('roadshowData', JSON.stringify(roadshowData));
    
    // Firebase에 실시간 동기화
    syncDataToServer();
}

// 로컬 스토리지에서 데이터 로드
function loadDataFromLocalStorage() {
    const savedData = localStorage.getItem('tableData');
    if (savedData) {
        tableData = JSON.parse(savedData);
        // 삭제된 항목들 필터링
        Object.keys(tableData).forEach(category => {
            if (Array.isArray(tableData[category])) {
                tableData[category] = tableData[category].filter(row => !deletedTableRows.has(row.id));
            }
        });
    }
    // 안전하게 키 초기화
    if (!tableData || typeof tableData !== 'object') tableData = {};
    if (!Array.isArray(tableData['pe-pd'])) tableData['pe-pd'] = [];
    if (!Array.isArray(tableData['real-estate'])) tableData['real-estate'] = [];
    if (!Array.isArray(tableData['infra'])) tableData['infra'] = [];

    const savedRfpData = localStorage.getItem('rfpData');
    if (savedRfpData) {
        rfpData = JSON.parse(savedRfpData);
        // 삭제된 항목들 필터링
        if (Array.isArray(rfpData)) {
            rfpData = rfpData.filter(rfp => !deletedRfpRows.has(rfp.id));
        }
    }
    
    const savedInstitutionsData = localStorage.getItem('institutionsData');
    if (savedInstitutionsData) {
        institutionsData = JSON.parse(savedInstitutionsData);
        // 삭제된 항목들 필터링
        Object.keys(institutionsData).forEach(category => {
            if (Array.isArray(institutionsData[category])) {
                institutionsData[category] = institutionsData[category].filter(inst => !deletedInstitutions.has(inst.id));
            }
        });
        // 누락된 신규 카테고리 보정
        if (!institutionsData['운용사']) institutionsData['운용사'] = [];
        // 기존 저장 데이터가 사실상 비어있다면 기본 데이터 시드
        if (isInstitutionsDataEmpty(institutionsData)) {
            institutionsData = getDefaultInstitutionsData();
        }
    } else {
        // 기본 LP 리스트 초기화
        institutionsData = getDefaultInstitutionsData();
    }
    
    const savedGpsData = localStorage.getItem('gpsData');
    if (savedGpsData) {
        gpsData = JSON.parse(savedGpsData);
        // 삭제된 항목들 필터링
        Object.keys(gpsData).forEach(letter => {
            if (Array.isArray(gpsData[letter])) {
                gpsData[letter] = gpsData[letter].filter(gp => !deletedGps.has(gp.id));
            }
        });
    }
    const savedContacts = localStorage.getItem('institutionsContacts');
    if (savedContacts) {
        institutionsContacts = JSON.parse(savedContacts);
        // 삭제된 항목들 필터링
        Object.keys(institutionsContacts).forEach(ownerId => {
            if (Array.isArray(institutionsContacts[ownerId])) {
                institutionsContacts[ownerId] = institutionsContacts[ownerId].filter(contact => !deletedContacts.has(contact.id));
            }
        });
    }
    const savedGpContacts = localStorage.getItem('gpContacts');
    if (savedGpContacts) {
        gpContacts = JSON.parse(savedGpContacts);
        // 삭제된 항목들 필터링
        Object.keys(gpContacts).forEach(ownerId => {
            if (Array.isArray(gpContacts[ownerId])) {
                gpContacts[ownerId] = gpContacts[ownerId].filter(contact => !deletedContacts.has(contact.id));
            }
        });
    }
    const savedRoadshow = localStorage.getItem('roadshowData');
    if (savedRoadshow) {
        try { roadshowData = JSON.parse(savedRoadshow) || {}; } catch (_) { roadshowData = {}; }
    }
    if (!roadshowData || typeof roadshowData !== 'object') roadshowData = {};
    if (!Array.isArray(roadshowData.days)) roadshowData.days = [];
    if (!Array.isArray(roadshowData.meetings)) roadshowData.meetings = [];
    if (!Array.isArray(roadshowData.investors)) roadshowData.investors = [];

    // 전략 정규화 적용
    normalizeGpStrategies();

    // 사용자가 입력한 RFP의 기관/분류를 LP 리스트에 반영
    syncInstitutionsFromRfp();
}

// 실시간 동기화 초기화
function initializeRealTimeSync() {
	// Firebase 실시간 리스너 설정
	if (window.__rtdbSyncInited) return;
	window.__rtdbSyncInited = true;
	if (database) {
		database.ref('/').on('value', (snapshot) => {
			const data = snapshot.val();
			if (!data) return;
            // 자기 에코 무시: 내가 막 올린 업데이트는 잠시 무시해 불필요한 재렌더 방지
            try {
                const myId = generateUserId();
                const updatedBy = String(data.updatedBy || '');
                if (updatedBy && updatedBy === String(myId)) {
                    const ts = Date.parse(data.lastUpdated || '') || 0;
                    if (Date.now() - ts < 2000) return; // 2초 이내면 에코로 간주
                }
            } catch (_) {}
			let changed = false;
			if (data.tableData && JSON.stringify(data.tableData) !== JSON.stringify(tableData)) {
				// 삭제된 항목들 필터링
				const filteredTableData = filterDeletedItems(data.tableData, 'tableData');
				tableData = filteredTableData;
				renderIfActive('contacts-dashboard', renderTable);
				changed = true;
			}
			if (data.rfpData && JSON.stringify(data.rfpData) !== JSON.stringify(rfpData)) {
				// 빈 배열로 로컬 데이터를 덮어쓰는 것을 방지
				try {
					const incoming = Array.isArray(data.rfpData) ? data.rfpData : [];
					const currentLen = Array.isArray(rfpData) ? rfpData.length : 0;
					const incomingLen = incoming.length;
					if (currentLen > 0 && incomingLen === 0) {
						// skip
					} else {
						rfpData = filterDeletedItems(incoming, 'rfpData');
						renderIfActive('rfp-dashboard', renderRfpTable);
						changed = true;
					}
				} catch (_) {}
			}
			if (data.institutionsData && JSON.stringify(data.institutionsData) !== JSON.stringify(institutionsData)) {
				// 삭제된 항목들 필터링
				institutionsData = filterDeletedItems(data.institutionsData, 'institutionsData');
				renderIfActive('institutions-dashboard', renderInstitutionsDashboard);
				changed = true;
			}
			if (data.gpsData && JSON.stringify(data.gpsData) !== JSON.stringify(gpsData)) {
				// 삭제된 항목들 필터링
				gpsData = filterDeletedItems(data.gpsData, 'gpsData');
				// 동기화 데이터에도 전략 정규화 적용
				normalizeGpStrategies();
				renderIfActive('gps-dashboard', renderGpsDashboard);
				changed = true;
			}
			// contacts: 빈 맵으로 덮어쓰지 않도록 가드
			const countMap = (m) => {
				try { return Object.values(m || {}).reduce((a, l) => a + (Array.isArray(l) ? l.length : 0), 0); } catch (_) { return 0; }
			};
			if (data.gpContacts) {
				const incoming = countMap(data.gpContacts);
				const current = countMap(gpContacts);
				if (incoming === 0 && current > 0) {
					// ignore empty overwrite
				} else if (incoming > 0) {
					// 삭제가 되살아나는 문제를 막기 위해 병합이 아니라 전면 대체
					gpContacts = data.gpContacts;
					changed = true;
				}
			}
			if (data.institutionsContacts) {
				const incoming = countMap(data.institutionsContacts);
				const current = countMap(institutionsContacts);
				if (incoming === 0 && current > 0) {
					// ignore empty overwrite
				} else if (incoming > 0) {
					// 전면 대체하여 삭제가 전파되도록 함
					institutionsContacts = data.institutionsContacts;
					if (openContactsInstitutionId) renderInstitutionContacts(openContactsInstitutionId);
					changed = true;
				}
			}
			if (data.roadshowData && JSON.stringify(data.roadshowData) !== JSON.stringify(roadshowData)) {
				roadshowData = data.roadshowData;
				renderIfActive('roadshow-dashboard', renderRoadshow);
				changed = true;
			}
			if (changed) updateConnectionStatus(true);
		});
	}
	
	// 페이지 포커스 시 동기화
	window.addEventListener('focus', syncDataFromServer);
	
	// 온라인 상태 변경 시 동기화
	window.addEventListener('online', () => {
		updateConnectionStatus();
		syncDataFromServer();
	});
	
	window.addEventListener('offline', () => {
		updateConnectionStatus();
	});
}

// Firestore 실시간 리스너(읽기 경로 예시)
function initializeFirestoreSync() {
    try {
        if (window.__firestoreSyncInited) return;
        window.__firestoreSyncInited = true;
        if (!db && firebase && firebase.firestore) db = firebase.firestore();
        const user = firebase.auth && firebase.auth().currentUser;
        if (!db) return;
        // 로그인 이후에만 리스너 붙이기
        firebase.auth().onAuthStateChanged(u => {
            if (!u) return;
            
            // 삭제된 항목들이 로드되었는지 확인
            if (deletedTableRows.size === 0 && deletedRfpRows.size === 0 && 
                deletedInstitutions.size === 0 && deletedGps.size === 0 && 
                deletedContacts.size === 0) {
                loadDeletedItems();
            }
            // 부트스트랩용 헬퍼: Firestore의 contacts/institutions/gps를 즉시 한 번 끌어와 병합
            window.ensureContactsBootstrapped = async function ensureContactsBootstrapped() {
                try {
                    const colToArr = async (name) => {
                        const out = [];
                        const qs = await db.collection(name).get();
                        qs.forEach(doc => {
                            const data = { id: doc.id, ...doc.data() };
                            // 삭제된 항목은 제외
                            if (name === 'contacts' && deletedContacts.has(doc.id)) return;
                            if (name === 'institutions' && deletedInstitutions.has(doc.id)) return;
                            if (name === 'gps' && deletedGps.has(doc.id)) return;
                            out.push(data);
                        });
                        return out;
                    };
                    const [contactsArr, instArr, gpArr] = await Promise.all([
                        colToArr('contacts'), colToArr('institutions'), colToArr('gps')
                    ]);
                    // institutions/gps 병합
                    const byCat = {};
                    instArr.forEach(it => {
                        const cat = it.category || '기타';
                        (byCat[cat] = byCat[cat] || []).push(it);
                    });
                    if (Object.keys(byCat).length) {
                        institutionsData = byCat;
                        renderIfActive('institutions-dashboard', renderInstitutionsDashboard);
                    }
                    const byLetter = {};
                    gpArr.forEach(it => {
                        const L = (it.name || 'A').charAt(0).toUpperCase();
                        (byLetter[L] = byLetter[L] || []).push(it);
                    });
                    if (Object.keys(byLetter).length) {
                        gpsData = byLetter;
                        normalizeGpStrategies();
                        renderIfActive('gps-dashboard', renderGpsDashboard);
                    }
                    // contacts 병합 + 별칭 키 구성
                    const map = {};
                    contactsArr.forEach(c => {
                        const owner = (c.ownerId || '').trim();
                        if (!owner) return;
                        (map[owner] = map[owner] || []).push(c);
                    });
                    Object.entries(map).forEach(([owner, list]) => {
                        let isGpId = false;
                        Object.values(gpsData || {}).forEach(lst => {
                            (lst || []).forEach(item => { if (item.id === owner) isGpId = true; });
                        });
                        if (isGpId && !map['gp_' + owner]) map['gp_' + owner] = list;
                    });
                    const before = Object.values(institutionsContacts||{}).reduce((a,l)=>a+(Array.isArray(l)?l.length:0),0);
                    const incoming = Object.values(map||{}).reduce((a,l)=>a+(Array.isArray(l)?l.length:0),0);
                    if (incoming > 0) {
                        institutionsContacts = mergeContactsMaps(institutionsContacts, map);
                        if (before === 0) {
                            // 처음 채워지는 경우 즉시 렌더 보장
                            if (openContactsInstitutionId) renderInstitutionContacts(openContactsInstitutionId);
                        }
                        try { safeSyncToRtdb(); } catch (_) {}
                    }
                } catch (e) {
                    console.warn('ensureContactsBootstrapped 오류:', e);
                }
            };
            // 예시: rfp 컬렉션 실시간 반영
            db.collection('rfp').onSnapshot((snap) => {
                const arr = [];
                snap.forEach(doc => {
                    const data = doc.data();
                    // 삭제된 항목은 제외
                    if (!deletedRfpRows.has(data.id)) {
                        arr.push(data);
                    }
                });
                if (JSON.stringify(arr) !== JSON.stringify(rfpData)) {
                    rfpData = arr;
                    renderIfActive('rfp-dashboard', renderRfpTable);
                }
            });
            // institutions
            db.collection('institutions').onSnapshot((snap) => {
                const byCat = {};
                snap.forEach(doc => {
                    const data = doc.data();
                    const cat = data.category || '기타';
                    const item = { ...data, id: doc.id };
                    // 삭제된 항목은 제외
                    if (!deletedInstitutions.has(item.id)) {
                        (byCat[cat] = byCat[cat] || []).push(item);
                    }
                });
                if (JSON.stringify(byCat) !== JSON.stringify(institutionsData)) {
                    institutionsData = byCat;
                    renderIfActive('institutions-dashboard', renderInstitutionsDashboard);
                }
            });
            // gps
            db.collection('gps').onSnapshot((snap) => {
                const byLetter = {};
                snap.forEach(doc => {
                    const data = doc.data();
                    const L = (data.name || 'A').charAt(0).toUpperCase();
                    const item = { ...data, id: doc.id };
                    // 삭제된 항목은 제외
                    if (!deletedGps.has(item.id)) {
                        (byLetter[L] = byLetter[L] || []).push(item);
                    }
                });
                // 정규화 후 비교
                const prev = JSON.stringify(gpsData);
                gpsData = byLetter;
                normalizeGpStrategies();
                if (JSON.stringify(gpsData) !== prev) {
                    renderIfActive('gps-dashboard', renderGpsDashboard);
                }
            });
            // tableData
            db.collection('tableData').onSnapshot((snap) => {
                const byTab = { 'pe-pd': [], 'real-estate': [], 'infra': [] };
                snap.forEach(doc => {
                    const data = doc.data();
                    const tab = data.tab || 'pe-pd';
                    // 삭제된 항목은 제외
                    if (!deletedTableRows.has(data.id)) {
                        byTab[tab].push(data);
                    }
                });
                if (JSON.stringify(byTab) !== JSON.stringify(tableData)) {
                    tableData = byTab;
                    renderIfActive('contacts-dashboard', renderTable);
                }
            });
            // contacts
            db.collection('contacts').onSnapshot((snap) => {
                const map = {};
                snap.forEach(doc => {
                    const data = doc.data();
                    const owner = (data.ownerId || '').trim();
                    if (!owner) return;
                    // 삭제된 항목은 제외
                    if (!deletedContacts.has(doc.id)) {
                        (map[owner] = map[owner] || []).push({ ...data, id: doc.id });
                    }
                });
                // 공용 맵에 모두 저장 (UI는 institutionsContacts를 참조)
                // 별칭 키(gp_접두사)도 함께 구성하여 UI 불일치 방지
                const merged = { ...map };
                Object.entries(map).forEach(([owner, list]) => {
                    let isGpId = false;
                    Object.values(gpsData || {}).forEach(lst => {
                        (lst || []).forEach(item => { if (item.id === owner) isGpId = true; });
                    });
                    if (isGpId && !merged['gp_' + owner]) merged['gp_' + owner] = list;
                });
                // 빈 맵으로 덮어쓰지 않도록 가드
                const incoming = Object.values(merged).reduce((a, l) => a + (Array.isArray(l)?l.length:0), 0);
                const current = Object.values(institutionsContacts||{}).reduce((a, l) => a + (Array.isArray(l)?l.length:0), 0);
                if (incoming === 0 && current > 0) {
                    // ignore
                } else if (incoming > 0 && current > 0) {
                    // 삭제가 복원되는 것을 방지: 병합 대신 수신 스냅샷으로 전면 대체
                    institutionsContacts = merged;
                } else {
                    institutionsContacts = merged;
                }
                // 보조 맵(gpContacts) 재생성
                const gp = {};
                Object.entries(merged).forEach(([owner, list]) => {
                    // 원래 id가 gp인지 판별 (gp_ 접두사 제거 후 매칭)
                    const raw = owner.startsWith('gp_') ? owner.slice(3) : owner;
                    let isInst = false;
                    Object.values(institutionsData || {}).forEach(lst => {
                        (lst || []).forEach(item => { if (item.id === raw) isInst = true; });
                    });
                    if (!isInst) gp[owner] = list;
                });
                const gpIncoming = Object.values(gp).reduce((a, l) => a + (Array.isArray(l)?l.length:0), 0);
                const gpCurrent = Object.values(gpContacts||{}).reduce((a, l) => a + (Array.isArray(l)?l.length:0), 0);
                if (gpIncoming === 0 && gpCurrent > 0) {
                    // ignore
                } else if (gpIncoming > 0 && gpCurrent > 0) {
                    // 삭제 복원 방지: 병합 대신 전면 대체
                    gpContacts = gp;
                } else {
                    gpContacts = gp;
                }
                // Firestore 수신 시 RTDB로 즉시 반영해 다른 탭도 맞춰줌
                try { safeSyncToRtdb(); } catch (_) {}
                if (openContactsInstitutionId) renderInstitutionContacts(openContactsInstitutionId);
            });
        });
    } catch (e) {
        console.warn('Firestore 리스너 초기화 오류:', e);
    }
}

// Firebase로 데이터 동기화
function syncDataToServer() {
    // 디바운스/스로틀: 짧은 지연 후 1회만 실제 동기화 수행
    if (!syncDataToServer.__debounce) {
        syncDataToServer.__debounce = { timer: null, runNow: false, interval: 700 };
    }
    const info = syncDataToServer.__debounce;
    if (!info.runNow) {
        clearTimeout(info.timer);
        info.timer = setTimeout(() => {
            info.runNow = true;
            try { syncDataToServer(); } finally { info.runNow = false; }
        }, info.interval);
        return;
    }
    
    if (navigator.onLine && database) {
        try {
            // 부분 업데이트 + 가드 적용
            const allData = {
                tableData, rfpData, institutionsData, gpsData,
                institutionsContacts, gpContacts, roadshowData,
                lastUpdated: new Date().toISOString(), updatedBy: generateUserId()
            };
            // 비정상적으로 비어있으면 skip
            const total = (Object.values(tableData||{}).flat()||[]).length + (rfpData||[]).length +
                          Object.values(institutionsData||{}).reduce((a, l)=>a+(l||[]).length,0) +
                          Object.values(gpsData||{}).reduce((a, l)=>a+(l||[]).length,0) +
                          Object.values(institutionsContacts||{}).reduce((a, l)=>a+(Array.isArray(l)?l.length:0),0) +
                          Object.values(gpContacts||{}).reduce((a, l)=>a+(Array.isArray(l)?l.length:0),0);
            // 연락처 복구 시 total이 작을 수 있어 최소치 완화
            if (total < 1) {
                console.warn('Guard: 데이터가 거의 비어 있습니다. 저장을 건너뜁니다.');
                return;
            }
            database.ref('/').update(allData).then(() => {
                console.log('데이터가 Firebase에 동기화되었습니다.');
                updateConnectionStatus(true);
            }).catch((error) => {
                console.error('Firebase 동기화 실패:', error);
                updateConnectionStatus(false);
            });
        } catch (error) {
            console.error('Firebase 동기화 오류:', error);
            updateConnectionStatus(false);
        }
    }

    // Firestore에도 주요 데이터 스냅샷 저장(부분 업데이트)
    try {
        if (!db && firebase && firebase.firestore) db = firebase.firestore();
        const user = firebase.auth && firebase.auth().currentUser;
        if (db && user) {
            const now = firebase.firestore.FieldValue.serverTimestamp();
            const meta = { createdBy: user.uid, createdAt: now, lastUpdated: now };
            // 컬렉션별 업서트(merge)
            const upsert = async (col, id, payload) => {
                await db.collection(col).doc(id).set({ ...payload, ...meta }, { merge: true });
            };
            // rfpData 배열을 문서 단위로 저장
            (rfpData || []).forEach(r => {
                const id = r.id || generateId();
                upsert('rfp', id, { ...r, id });
            });
            // institutionsData 객체를 카테고리/아이템 단위로 저장
            Object.entries(institutionsData || {}).forEach(([cat, list]) => {
                (list || []).forEach(item => {
                    const id = item.id || generateId();
                    upsert('institutions', id, { ...item, category: cat, id });
                });
            });
            // GP 데이터
            Object.values(gpsData || {}).forEach(list => {
                (list || []).forEach(item => {
                    const id = item.id || generateId();
                    upsert('gps', id, { ...item, id });
                });
            });
            // 테이블(contacts 탭 데이터)
            Object.entries(tableData || {}).forEach(([tab, rows]) => {
                (rows || []).forEach(row => {
                    const id = row.id || generateId();
                    upsert('tableData', id, { ...row, tab, id });
                });
            });
            // 연락처(기관/GP 통합 저장) - ownerId 정규화 + 존재하는 문서 ID로 매핑
            // 현재 institutions/gps의 실제 문서 ID 집합
            const validOwnerIds = new Set();
            Object.values(institutionsData || {}).forEach(list => (list||[]).forEach(it => validOwnerIds.add(String(it.id))));
            Object.values(gpsData || {}).forEach(list => (list||[]).forEach(it => validOwnerIds.add(String(it.id))));
            Object.entries(institutionsContacts || {}).forEach(([ownerId, list]) => {
                let normalizedOwner = typeof ownerId === 'string' && ownerId.startsWith('gp_') ? ownerId.slice(3) : ownerId;
                // 존재하지 않는 경우는 그대로 두되, 저장은 진행 (복구 루틴에서 재매핑)
                (list || []).forEach(c => {
                    const id = c.id || generateId();
                    const payload = { ...c, id, ownerId: String(normalizedOwner) };
                    upsert('contacts', id, payload);
                });
            });
        }
    } catch (e) {
        console.warn('Firestore 동기화 스킵/오류:', e);
    }
}

// Firebase에서 데이터 동기화
function syncDataFromServer() {
    if (navigator.onLine && database) {
        try {
            database.ref('/').once('value').then((snapshot) => {
                const data = snapshot.val();
                if (data) {
                    // 로컬 데이터와 비교하여 업데이트
                    if (data.tableData && JSON.stringify(data.tableData) !== JSON.stringify(tableData)) {
                        tableData = filterDeletedItems(data.tableData, 'tableData');
                        renderIfActive('contacts-dashboard', renderTable);
                    }
                    
                    if (data.rfpData && JSON.stringify(data.rfpData) !== JSON.stringify(rfpData)) {
                        try {
                            const incoming = Array.isArray(data.rfpData) ? data.rfpData : [];
                            const currentLen = Array.isArray(rfpData) ? rfpData.length : 0;
                            const incomingLen = incoming.length;
                            if (currentLen > 0 && incomingLen === 0) {
                                // skip 빈 덮어쓰기 방지
                            } else {
                                rfpData = filterDeletedItems(incoming, 'rfpData');
                                renderIfActive('rfp-dashboard', renderRfpTable);
                            }
                        } catch (_) {}
                    }
                    
                    if (data.institutionsData && JSON.stringify(data.institutionsData) !== JSON.stringify(institutionsData)) {
                        institutionsData = filterDeletedItems(data.institutionsData, 'institutionsData');
                        renderIfActive('institutions-dashboard', renderInstitutionsDashboard);
                    }
                    
                    if (data.gpsData && JSON.stringify(data.gpsData) !== JSON.stringify(gpsData)) {
                        gpsData = filterDeletedItems(data.gpsData, 'gpsData');
                        // 동기화 데이터에도 전략 정규화 적용
                        normalizeGpStrategies();
                        renderIfActive('gps-dashboard', renderGpsDashboard);
                    }
                    const countMap = (m) => {
                        try { return Object.values(m || {}).reduce((a, l) => a + (Array.isArray(l) ? l.length : 0), 0); } catch (_) { return 0; }
                    };
                    if (data.gpContacts && JSON.stringify(data.gpContacts) !== JSON.stringify(gpContacts)) {
                        const incoming = countMap(data.gpContacts);
                        const current = countMap(gpContacts);
                        if (!(incoming === 0 && current > 0)) gpContacts = data.gpContacts;
                    }
                    
                    if (data.institutionsContacts && JSON.stringify(data.institutionsContacts) !== JSON.stringify(institutionsContacts)) {
                        const incoming = countMap(data.institutionsContacts);
                        const current = countMap(institutionsContacts);
                        if (!(incoming === 0 && current > 0)) {
                            institutionsContacts = data.institutionsContacts;
                            if (openContactsInstitutionId) renderInstitutionContacts(openContactsInstitutionId);
                        }
                    }
                    
                    if (data.roadshowData && JSON.stringify(data.roadshowData) !== JSON.stringify(roadshowData)) {
                        roadshowData = data.roadshowData;
                        renderIfActive('roadshow-dashboard', renderRoadshow);
                    }
                    
                    console.log('Firebase에서 데이터를 가져왔습니다.');
                    updateConnectionStatus(true);
                }
            }).catch((error) => {
                console.error('Firebase 데이터 가져오기 실패:', error);
                updateConnectionStatus(false);
            });
        } catch (error) {
            console.error('Firebase 데이터 가져오기 오류:', error);
            updateConnectionStatus(false);
        }
    }
}

// 연결 상태 업데이트
function updateConnectionStatus(isConnected = null) {
    const statusElement = document.querySelector('.connection-status');
    
    if (isConnected === null) {
        // 기본 온라인/오프라인 상태 확인
        isConnected = navigator.onLine && database;
    }
    
    if (isConnected) {
        statusElement.className = 'connection-status connected';
        statusElement.innerHTML = '<i class="fas fa-circle" title="실시간 공유 연결됨"></i>';
    } else {
        statusElement.className = 'connection-status disconnected';
        statusElement.innerHTML = '<i class="fas fa-circle" title="오프라인 모드"></i>';
    }
}

// 샘플 데이터 추가 (개발용)
function addSampleData() {
    if (tableData['pe-pd'].length === 0) {
        tableData['pe-pd'] = [
            {
                id: generateId(),
                institution: '한국투자증권',
                customer: '김철수',
                email: 'kim.cs@kis.co.kr'
            },
            {
                id: generateId(),
                institution: '한국투자증권',
                customer: '이영희',
                email: 'lee.yh@kis.co.kr'
            },
            {
                id: generateId(),
                institution: '미래에셋증권',
                customer: '박민수',
                email: 'park.ms@miraeasset.com'
            },
            {
                id: generateId(),
                institution: '신한은행',
                customer: '정수진',
                email: 'jung.sj@shinhan.com'
            },
            {
                id: generateId(),
                institution: 'KB국민은행',
                customer: '최동욱',
                email: 'choi.dw@kbstar.com'
            }
        ];
    }
    
    if (tableData['real-estate'].length === 0) {
        tableData['real-estate'] = [
            {
                id: generateId(),
                institution: '롯데건설',
                customer: '강지훈',
                email: 'kang.jh@lotte.co.kr'
            },
            {
                id: generateId(),
                institution: '삼성물산',
                customer: '윤서연',
                email: 'yoon.sy@samsung.com'
            }
        ];
    }
    
    if (tableData.infra.length === 0) {
        tableData.infra = [
            {
                id: generateId(),
                institution: '현대건설',
                customer: '임태호',
                email: 'lim.th@hyundai.com'
            },
            {
                id: generateId(),
                institution: 'GS건설',
                customer: '한미영',
                email: 'han.my@gsconst.co.kr'
            }
        ];
    }
    
    saveDataToLocalStorage();
    renderTable();
}

// 개발용: 샘플 데이터 추가 (필요시 주석 해제)
// addSampleData();

// 기관명 드롭다운 업데이트
function updateInstitutionDropdown(rfpId, category) {
    const dropdown = document.getElementById(`institution-dropdown-${rfpId}`);
    if (!dropdown) return;
    
    // 드롭다운 초기화
    dropdown.innerHTML = '<option value="">기관명 선택</option>';
    
    if (category && institutionsData[category]) {
        // 해당 카테고리의 기관들을 드롭다운에 추가
        institutionsData[category].forEach(institution => {
            const option = document.createElement('option');
            option.value = institution.name;
            option.textContent = institution.name;
            dropdown.appendChild(option);
        });
        dropdown.disabled = false;
    } else {
        dropdown.disabled = true;
    }
}

// 드롭다운 변경 처리 (기타 옵션용)
function handleDropdownChange(element, field, rfpId) {
    const value = element.value;
    const customInputId = `${field}-custom-${rfpId}`;
    const customInput = document.getElementById(customInputId);
    
    if (value === '기타') {
        // 기타 선택 시 입력 필드 표시
        if (customInput) {
            customInput.style.display = 'block';
            customInput.focus();
        } else {
            // 입력 필드가 없으면 생성
            const newInput = document.createElement('input');
            newInput.id = customInputId;
            newInput.type = 'text';
            newInput.placeholder = '직접 입력';
            newInput.style.cssText = 'width: 100%; margin-top: 5px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;';
            newInput.onchange = function() {
                updateRfpData(rfpId, field, this.value);
            };
            element.parentNode.appendChild(newInput);
            newInput.focus();
        }
    } else {
        // 다른 옵션 선택 시 입력 필드 숨김
        if (customInput) {
            customInput.style.display = 'none';
            customInput.value = '';
        }
        updateRfpData(rfpId, field, value);
    }
}

// 전략 변경 처리
function handleStrategyChange(rfpId, strategy) {
    const customInput = document.getElementById(`strategy-custom-${rfpId}`);
    if (customInput) {
        if (strategy === '기타') {
            customInput.style.display = 'block';
            customInput.focus();
        } else {
            customInput.style.display = 'none';
            customInput.value = '';
        }
    }
}

// RFP 테이블 열 너비 조정 함수
function resizeColumn(columnClass, width) {
    const style = document.createElement('style');
    style.id = 'dynamic-column-widths';
    
    // 기존 동적 스타일 제거
    const existingStyle = document.getElementById('dynamic-column-widths');
    if (existingStyle) {
        existingStyle.remove();
    }
    
    // 새로운 스타일 추가
    style.textContent = `
        #rfp-table .${columnClass} {
            width: ${width}% !important;
        }
    `;
    
    document.head.appendChild(style);
    
    // 값 표시 업데이트
    const valueElement = document.getElementById(`${columnClass.replace('-', '-')}-width-value`);
    if (valueElement) {
        valueElement.textContent = `${width}%`;
    }
}

// 테이블 열 리사이즈 기능 초기화
function initializeColumnResize() {
	const tables = document.querySelectorAll('.data-table');
	
	tables.forEach(table => {
		const headers = table.querySelectorAll('th');
		
		headers.forEach((header, index) => {
			let isResizing = false;
			let startX = 0;
			let startWidth = 0;
			
			const handleMouseDown = (e) => {
				// 리사이즈 핸들 영역에서만 시작
				const rect = header.getBoundingClientRect();
				const handleX = rect.right - 12; // 감지 영역 확대(12px)
				
				if (e.clientX >= handleX) {
					isResizing = true;
					startX = e.clientX;
					startWidth = header.offsetWidth;
					
					header.classList.add('resizing');
					table.classList.add('resizing');
					
					document.addEventListener('mousemove', handleMouseMove);
					document.addEventListener('mouseup', handleMouseUp);
					
					e.preventDefault();
				}
			};
			
			const handleMouseMove = (e) => {
				if (!isResizing) return;
				
				const deltaX = e.clientX - startX;
				const newWidth = Math.max(50, startWidth + deltaX); // 최소 50px
				
				// 현재 열과 다음 열의 너비 조정
				const currentCol = header;
				const nextCol = headers[index + 1];
				
				if (nextCol) {
					const totalWidth = currentCol.offsetWidth + nextCol.offsetWidth;
					const nextColNewWidth = Math.max(50, totalWidth - newWidth);
					
					currentCol.style.width = `${newWidth}px`;
					nextCol.style.width = `${nextColNewWidth}px`;
					// 모든 셀에도 폭 적용
					applyColumnWidthToAllCells(table, index, newWidth);
					applyColumnWidthToAllCells(table, index + 1, nextColNewWidth);
				} else {
					currentCol.style.width = `${newWidth}px`;
					applyColumnWidthToAllCells(table, index, newWidth);
				}
			};
			
			const handleMouseUp = () => {
				if (isResizing) {
					isResizing = false;
					header.classList.remove('resizing');
					table.classList.remove('resizing');
					
					document.removeEventListener('mousemove', handleMouseMove);
					document.removeEventListener('mouseup', handleMouseUp);
					
					// 변경사항 저장
					saveColumnWidths(table);
					// 리사이즈 후 대시보드 자동 맞춤
					scheduleAutoFitDashboard();
				}
			};
			
			// 더블클릭: 내용에 맞게 자동 맞춤
			const handleDblClick = () => {
				let maxWidth = 50; // 최소 폭
				// 헤더 자체 콘텐츠 고려
				maxWidth = Math.max(maxWidth, header.scrollWidth + 24);
				// 모든 행의 동일 컬럼 셀 검사
				const rows = table.querySelectorAll('tr');
				rows.forEach(row => {
					const cell = row.children && row.children[index];
					if (!cell) return;
					const input = cell.querySelector('input, select, button, span, div');
					if (input) {
						maxWidth = Math.max(maxWidth, input.scrollWidth + 28);
					} else {
						maxWidth = Math.max(maxWidth, cell.scrollWidth + 24);
					}
				});
				const newWidth = Math.min(Math.max(50, maxWidth), 800); // 상한 800px
				header.style.width = `${newWidth}px`;
				applyColumnWidthToAllCells(table, index, newWidth);
				saveColumnWidths(table);
			};
			
			header.addEventListener('mousedown', handleMouseDown);
			header.addEventListener('dblclick', handleDblClick);
		});
	});
}

// 열 너비 저장
function saveColumnWidths(table) {
    const tableId = table.id;
    const headers = table.querySelectorAll('th');
    const widths = {};
    
    headers.forEach((header, index) => {
        widths[index] = header.style.width || header.offsetWidth + 'px';
    });
    
    localStorage.setItem(`columnWidths_${tableId}`, JSON.stringify(widths));
}

// 열 너비 복원
function restoreColumnWidths(table) {
    const tableId = table.id;
    const savedWidths = localStorage.getItem(`columnWidths_${tableId}`);
    
    if (savedWidths) {
        const widths = JSON.parse(savedWidths);
        const headers = table.querySelectorAll('th');
        
        headers.forEach((header, index) => {
            if (widths[index]) {
                header.style.width = widths[index];
                // td에도 동일 적용
                applyColumnWidthToAllCells(table, index, widths[index]);
            }
        });
    }
} 

// LP 카테고리 존재 보장
function ensureInstitutionCategory(category) {
    if (!category || !category.trim()) return;
    if (!institutionsData[category]) institutionsData[category] = [];
}

// LP에 기관 추가 (중복 방지)
function addInstitutionIfMissing(category, name) {
    if (!category || !name || name === '기타') return false;
    ensureInstitutionCategory(category);
    const norm = normalizeInstitutionName(name);
    // 전 카테고리 중복 방지
    const exists = Object.values(institutionsData || {}).some(lst => (lst||[]).some(inst => normalizeInstitutionName(inst.name) === norm));
    if (!exists) {
        institutionsData[category].push({ id: generateId(), name });
        return true;
    }
    return false;
}

// RFP 데이터로부터 LP 리스트 동기화
function syncInstitutionsFromRfp() {
    let changed = false;
    (rfpData || []).forEach(rfp => {
        const category = rfp.institutionCategory;
        const name = rfp.institution;
        if (category && name && name !== '기타') {
            if (addInstitutionIfMissing(category, name)) changed = true;
        }
    });
    if (changed) {
        saveDataToLocalStorage();
        renderInstitutionsDashboard();
    }
} 

// 새로운 대시보드를 여는 함수
function openInstitutionContactsDashboard(institutionId, institutionName = '') {
    openContactsInstitutionId = institutionId;
    // 페이지 초기화
    contactsPageMap[institutionId] = 1;
    // 제목 설정
    const titleEl = document.getElementById('institution-contacts-title');
    if (titleEl) {
        titleEl.textContent = institutionName ? `${institutionName} - Contacts` : '기관 연락처';
    }
    // 모달 열기
    const modal = document.getElementById('institution-contacts-modal');
    if (modal) modal.style.display = 'block';
    // 내용 렌더
    renderInstitutionContacts(institutionId, institutionName);
    // 항상 서버에서 자동 복구 시도(성공 시 즉시 재렌더)
    try {
        recoverContactsForOwner(institutionId, institutionName).then((ok) => {
            if (ok) renderInstitutionContacts(institutionId, institutionName);
        }).catch(() => {});
    } catch (_) {}
}

function closeInstitutionContactsModal() {
    const modal = document.getElementById('institution-contacts-modal');
    if (modal) modal.style.display = 'none';
}

// GP 연락처: LP와 동일한 UI 재사용 (기관 연락처 모달을 공용으로 사용)
function openGpContactsDashboard(letter, gpId, gpName = '') {
    openContactsInstitutionId = `gp_${gpId}`; // 키 충돌 방지
    contactsPageMap[openContactsInstitutionId] = 1;
    // 제목 설정
    const titleEl = document.getElementById('institution-contacts-title');
    if (titleEl) {
        titleEl.textContent = gpName ? `${gpName} - Contacts` : '기관 연락처';
    }
    const modal = document.getElementById('institution-contacts-modal');
    if (modal) modal.style.display = 'block';
    renderInstitutionContacts(openContactsInstitutionId, gpName);
    // 항상 서버에서 자동 복구 시도 (GP)
    try {
        const ownerId = openContactsInstitutionId;
        recoverContactsForOwner(ownerId, gpName).then((ok) => {
            if (ok) renderInstitutionContacts(ownerId, gpName);
        }).catch(() => {});
    } catch (_) {}
}

// 팝업 대시보드: 연락처 렌더링
// 연락처 모달 페이지네이션 상태
let contactsPageMap = {};
const CONTACTS_PAGE_SIZE = 10;

function renderInstitutionContacts(institutionId, displayName = '') {
	const tbody = document.getElementById('institution-contacts-tbody');
	if (!tbody) return;
	// 정확히 동일 키 우선
	let list = institutionsContacts[institutionId] || [];
	if ((!list || list.length === 0)) {
		// gp_ 접두사/무접두사 양쪽 모두 검사
		const raw = institutionId.startsWith('gp_') ? institutionId.slice(3) : institutionId;
		const alias = institutionId.startsWith('gp_') ? raw : ('gp_' + raw);
		// 동일 이름의 다른 id 후보들도 함께 모아 합집합
		let sameNameIds = [];
		let localName = displayName || '';
		if (!localName) {
			Object.values(institutionsData || {}).forEach(arr => (arr||[]).forEach(item => { if (item.id === raw) localName = localName || (item.name || ''); }));
			Object.values(gpsData || {}).forEach(arr => (arr||[]).forEach(item => { if (item.id === raw) localName = localName || (item.name || ''); }));
		}
		if (localName) {
			Object.values(institutionsData || {}).forEach(arr => (arr||[]).forEach(item => { if ((item.name || '') === localName) sameNameIds.push(item.id); }));
			Object.values(gpsData || {}).forEach(arr => (arr||[]).forEach(item => { if ((item.name || '') === localName) sameNameIds.push(item.id); }));
		}
		const candidateKeys = new Set([institutionId, raw, alias, ...sameNameIds.map(id => id), ...sameNameIds.map(id => 'gp_' + id)]);
		let merged = [];
		candidateKeys.forEach(k => {
			if (Array.isArray(institutionsContacts[k])) merged = merged.concat(institutionsContacts[k]);
			if (Array.isArray(gpContacts[k])) merged = merged.concat(gpContacts[k]);
		});
		list = merged;
	}
	// tombstone 필터링
	list = (list || []).filter(c => !isContactTombstoned(institutionId, c));

	// 페이지 계산
	const total = Array.isArray(list) ? list.length : 0;
	const totalPages = Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE));
	const current = Math.min(Math.max(1, contactsPageMap[institutionId] || 1), totalPages);
	contactsPageMap[institutionId] = current;
	const start = (current - 1) * CONTACTS_PAGE_SIZE;
	const end = start + CONTACTS_PAGE_SIZE;
	const pageItems = (list || []).slice(start, end);

	if (total === 0) {
		tbody.innerHTML = `
			<tr>
				<td colspan="6" class="empty-table">
					<i class="fas fa-address-book"></i>
					<h3>등록된 Contact가 없습니다</h3>
					<p>오른쪽 상단의 연락처 추가 버튼을 눌러 등록하세요.</p>
				</td>
			</tr>
		`;
		// 페이지네이션 비움
		renderInstitutionContactsPagination(institutionId, 1, 1);
		return;
	}

	// 부서별 넘버링
	const deptCounters = {};
	tbody.innerHTML = pageItems.map(contact => {
		const dept = (contact.department || '').trim();
		const no = dept ? ((deptCounters[dept] = (deptCounters[dept] || 0) + 1)) : '';
		return `
		<tr data-contact-id="${contact.id}">
			<td class="number-col">${no}</td>
			<td><input type="text" value="${contact.department || ''}" placeholder="부서명" onchange="updateInstitutionContact('${institutionId}','${contact.id}','department', this.value)"></td>
			<td><input type="text" value="${contact.position || ''}" placeholder="직급" onchange="updateInstitutionContact('${institutionId}','${contact.id}','position', this.value)"></td>
			<td><input type="text" value="${contact.name || ''}" placeholder="성함" onchange="updateInstitutionContact('${institutionId}','${contact.id}','name', this.value)"></td>
			<td>
				<div style="display:flex; align-items:center; gap:6px;">
					<input type="email" value="${contact.email || ''}" placeholder="E-mail" onchange="updateInstitutionContact('${institutionId}','${contact.id}','email', this.value)">
					<button class="table-action-btn" title="이메일 복사" onclick="copyContactEmail('${institutionId}','${contact.id}')"><i class="fas fa-copy"></i></button>
				</div>
			</td>
			<td class="action-col">
				<div class="table-actions">
					<button class="table-action-btn delete" onclick="deleteInstitutionContact('${institutionId}','${contact.id}')" title="삭제">
						<i class="fas fa-trash"></i>
					</button>
				</div>
			</td>
		</tr>`;
	}).join('');

	// 페이지네이션 렌더
	renderInstitutionContactsPagination(institutionId, current, totalPages);
}

function renderInstitutionContactsPagination(institutionId, current, totalPages) {
	const table = document.getElementById('institution-contacts-table');
	if (!table) return;
	let pager = document.getElementById('institution-contacts-pagination');
	if (!pager) {
		pager = document.createElement('div');
		pager.id = 'institution-contacts-pagination';
		pager.style.textAlign = 'center';
		pager.style.marginTop = '8px';
		const container = table.parentElement; // .table-container
		container && container.appendChild(pager);
	}
	const btn = (label, page, active = false) => `
		<button class="pagination-btn" style="min-width:28px;margin:0 3px;padding:4px 8px;${active ? 'background:#667eea;color:#fff;border:none;border-radius:4px;' : 'border:1px solid #dbe2ef;border-radius:4px;background:#fff;'}" onclick="setInstitutionContactsPage('${institutionId}', ${page})">${label}</button>
	`;
	let html = '';
	if (totalPages > 1) {
		const prev = Math.max(1, current - 1);
		html += btn('‹', prev, false);
		for (let p = 1; p <= totalPages; p++) {
			html += btn(String(p), p, p === current);
		}
		const next = Math.min(totalPages, current + 1);
		html += btn('›', next, false);
	}
	pager.innerHTML = html;
}

function setInstitutionContactsPage(institutionId, page) {
	contactsPageMap[institutionId] = page;
	renderInstitutionContacts(institutionId);
}

function copyContactField(institutionId, contactId, field, label) {
	const list = institutionsContacts[institutionId] || [];
	const item = list.find(c => c.id === contactId);
	const value = (item && item[field] ? String(item[field]) : '').trim();
	if (!value) {
		alert(`${label || '값'}이(가) 없습니다.`);
		return;
	}
	navigator.clipboard.writeText(value).then(() => {
		alert(`${label || '값'}이 복사되었습니다.`);
	}).catch(() => {
		const ta = document.createElement('textarea');
		ta.value = value; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
		alert(`${label || '값'}이 복사되었습니다.`);
	});
}

function copyContactEmail(institutionId, contactId) {
	return copyContactField(institutionId, contactId, 'email', '이메일');
}

function copyDeptEmails(institutionId, dept) {
	const list = institutionsContacts[institutionId] || [];
	const emails = list
		.filter(c => (c.department || '').trim() === dept && (c.email || '').trim())
		.map(c => c.email.trim());
	const text = emails.join(', ');
	if (!text) return;
	navigator.clipboard.writeText(text).then(() => {
		alert(`${dept} 부서 이메일 ${emails.length}개가 복사되었습니다.`);
	}).catch(() => {
		const ta = document.createElement('textarea');
		ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
		alert(`${dept} 부서 이메일 ${emails.length}개가 복사되었습니다.`);
	});
}

// 팝업 대시보드: 연락처 추가
function addInstitutionContact() {
    if (!openContactsInstitutionId) return;
    institutionsContacts[openContactsInstitutionId] = institutionsContacts[openContactsInstitutionId] || [];
    institutionsContacts[openContactsInstitutionId].push({
        id: generateId(),
        department: '',
        position: '',
        name: '',
        office: '',
        mobile: ''
    });
    saveDataToLocalStorage();
    try { syncDataToServer(); } catch (_) {}
    renderInstitutionContacts(openContactsInstitutionId);
}

// 팝업 대시보드: 연락처 수정
function updateInstitutionContact(institutionId, contactId, field, value) {
    const list = institutionsContacts[institutionId] || [];
    const item = list.find(c => c.id === contactId);
    if (!item) return;
    item[field] = value;
    saveDataToLocalStorage();
    try { syncDataToServer(); } catch (_) {}
}

// 팝업 대시보드: 연락처 삭제
function deleteInstitutionContact(institutionId, contactId) {
    if (!confirm('이 연락처를 삭제할까요?')) return;
    
    // 즉시 UI에서 제거
    const row = document.querySelector(`[data-contact-id="${contactId}"]`);
    if (row) {
        row.remove();
        // 빈 테이블 처리
        const tbody = document.querySelector('#institution-contacts-tbody');
        if (tbody && tbody.children.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-table">
                        <i class="fas fa-address-book"></i>
                        <h3>연락처가 없습니다</h3>
                        <p>연락처 추가 버튼을 클릭하여 데이터를 추가해보세요!</p>
                    </td>
                </tr>
            `;
        }
    }
    
    // 삭제된 항목 추적에 추가
    deletedContacts.add(contactId);
    saveDeletedItems();
    updateDeletedItemsCount();
    
    // 삭제 대상의 필드 스냅샷 확보(동일 이메일/이름으로 저장된 중복 문서까지 제거하기 위함)
    const currentList = institutionsContacts[institutionId] || [];
    const snapshotItem = currentList.find(c => c.id === contactId) || {};

    // tombstone 추가(즉시 숨김 + 모든 별칭 키)
    addContactTombstone(institutionId, snapshotItem);

    // 두 저장소 모두에서 삭제 시도
    institutionsContacts[institutionId] = (institutionsContacts[institutionId] || []).filter(c => c.id !== contactId);
    const raw = institutionId.startsWith('gp_') ? institutionId.slice(3) : institutionId;
    institutionsContacts[raw] = (institutionsContacts[raw] || []).filter(c => c.id !== contactId);
    gpContacts[institutionId] = (gpContacts[institutionId] || []).filter(c => c.id !== contactId);
    gpContacts[raw] = (gpContacts[raw] || []).filter(c => c.id !== contactId);
    saveDataToLocalStorage();
    
    // 즉시 서버 동기화
    try { syncDataToServer(); } catch (_) {}

    // Firestore: owner의 모든 별칭 키에서 동일 문서/동일 이메일(+이름) 문서를 일괄 삭제
    (async () => {
        try {
            if (!db && firebase && firebase.firestore) db = firebase.firestore();
            if (!db) return;
            const owners = new Set([raw, 'gp_' + raw, institutionId]);
            for (const owner of owners) {
                const qs = await db.collection('contacts').where('ownerId','==',owner).get();
                qs.forEach(doc => {
                    const data = doc.data() || {};
                    const sameId = String(doc.id) === String(contactId);
                    const sameEmail = (data.email || '') && (snapshotItem.email || '') && String(data.email).trim().toLowerCase() === String(snapshotItem.email).trim().toLowerCase();
                    const sameName = (data.name || '') && (snapshotItem.name || '') && String(data.name).trim() === String(snapshotItem.name).trim();
                    if (sameId || (sameEmail && (!snapshotItem.name || sameName))) {
                        try { db.collection('contacts').doc(String(doc.id)).delete(); } catch (_) {}
                    }
                });
            }
        } catch (_) {}
    })();

    renderInstitutionContacts(institutionId);
}

function openDeptCopyModal() {
    if (!openContactsInstitutionId) return;
    const modal = document.getElementById('dept-email-modal');
    const listWrap = document.getElementById('dept-email-list');
    const all = institutionsContacts[openContactsInstitutionId] || [];
    const map = new Map();
    all.forEach(c => {
        const dept = (c.department || '').trim();
        const email = (c.email || '').trim();
        if (!dept || !email) return;
        if (!map.has(dept)) map.set(dept, []);
        map.get(dept).push(email);
    });
    const totalEmails = all.filter(c => (c.email || '').trim()).map(c => c.email.trim());
    const buttons = [];
    if (totalEmails.length) {
        buttons.push(`<button class="dept-copy-btn" onclick="copyEmails('${openContactsInstitutionId}')">전체 이메일 복사 (${totalEmails.length})</button>`);
    }
    buttons.push(...Array.from(map.entries()).map(([dept, emails]) => `
        <button class="dept-copy-btn" onclick="copyDeptEmails('${openContactsInstitutionId}', '${dept.replace(/'/g, "&#39;")}')">${dept} 이메일 복사 (${emails.length})</button>
    `));
    listWrap.innerHTML = buttons.join('');
    modal.style.display = 'block';
}

function copyEmails(institutionId) {
    const list = institutionsContacts[institutionId] || [];
    const emails = list.map(c => (c.email || '').trim()).filter(Boolean);
    const text = emails.join(', ');
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        alert(`이메일 ${emails.length}개가 복사되었습니다.`);
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        alert(`이메일 ${emails.length}개가 복사되었습니다.`);
    });
}

function closeDeptEmailModal() {
    const modal = document.getElementById('dept-email-modal');
    if (modal) modal.style.display = 'none';
}

// 특정 테이블의 특정 컬럼 너비를 모든 셀(th, td)에 적용
function applyColumnWidthToAllCells(table, colIndex, widthPx) {
	const rows = table.querySelectorAll('tr');
	rows.forEach(row => {
		const cell = row.children && row.children[colIndex];
		if (cell) {
			cell.style.width = typeof widthPx === 'number' ? `${widthPx}px` : widthPx;
		}
	});
}

// 셀 더블클릭 시 해당 열 자동 맞춤
function autoFitColumnForCell(el) {
	const td = el.closest('td, th');
	if (!td) return;
	const table = td.closest('table');
	if (!table) return;
	const index = td.cellIndex;
	const headers = table.querySelectorAll('th');
	const header = headers[index];
	let maxWidth = 50;
	if (header) maxWidth = Math.max(maxWidth, header.scrollWidth + 24);
	const rows = table.querySelectorAll('tr');
	rows.forEach(row => {
		const cell = row.children && row.children[index];
		if (!cell) return;
		const content = cell.querySelector('input, select, button, span, div') || cell;
		maxWidth = Math.max(maxWidth, content.scrollWidth + 28);
	});
	const newWidth = Math.min(Math.max(50, maxWidth), 800);
	if (header) header.style.width = `${newWidth}px`;
	applyColumnWidthToAllCells(table, index, newWidth);
	saveColumnWidths(table);
}

// ===== 대시보드 자동 스케일링(컨테이너 폭에 맞춤) =====
let __autoFitTimer = null;
function scheduleAutoFitDashboard() {
    // 자동 스케일링 비활성화: 남아 있을 수 있는 transform/width만 정리
    const pane = document.querySelector('.dashboard-pane.active');
    if (pane) {
        pane.style.transform = 'none';
        pane.style.width = '';
    }
}

function autoFitActiveDashboard() {
    // 비활성화 (no-op)
}

// 이전에 등록된 리사이즈 처리로 인한 부작용을 막기 위한 방어 코드
if (window && window.removeEventListener) {
    try { window.removeEventListener('resize', scheduleAutoFitDashboard); } catch (e) {}
}
// ===== 대시보드 자동 스케일링 끝 =====

// 주소 모달 상태
let openAddressCategory = null;
let openAddressInstitutionId = null;

function openAddressModal(category, institutionId) {
    openAddressCategory = category;
    openAddressInstitutionId = institutionId;
    const list = institutionsData[category] || [];
    const item = list.find(i => i.id === institutionId);
    const modal = document.getElementById('address-modal');
    if (!modal) return;
    const ko = document.getElementById('address-korean');
    const en = document.getElementById('address-english');
    // 해당 기관/GP에 한정된 주소만 표시
    ko.value = (item && item.addressKorean) ? item.addressKorean : '';
    en.value = (item && item.addressEnglish) ? item.addressEnglish : '';

    // 주소가 비어있으면 서버에서 자동 복구 시도
    try {
        const empty = (!ko.value && !en.value);
        if (empty && institutionId) {
            recoverInstitutionAddress(institutionId).then((ok) => {
                if (ok) {
                    const freshList = institutionsData[category] || [];
                    const fresh = freshList.find(i => i.id === institutionId);
                    ko.value = (fresh && fresh.addressKorean) ? fresh.addressKorean : '';
                    en.value = (fresh && fresh.addressEnglish) ? fresh.addressEnglish : '';
                }
            }).catch(() => {});
        }
    } catch (_) {}

    // 폼 하단에 복사 버튼 추가(중복 생성 방지)
    const form = document.getElementById('address-form');
    if (form && !form._copyButtonsAdded) {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.gap = '8px';
        wrap.style.marginTop = '10px';
        const copyKo = document.createElement('button');
        copyKo.type = 'button';
        copyKo.textContent = '한글 주소 복사';
        copyKo.className = 'btn';
        copyKo.onclick = () => {
            navigator.clipboard.writeText(document.getElementById('address-korean').value || '');
        };
        const copyEn = document.createElement('button');
        copyEn.type = 'button';
        copyEn.textContent = '영문 주소 복사';
        copyEn.className = 'btn';
        copyEn.onclick = () => {
            navigator.clipboard.writeText(document.getElementById('address-english').value || '');
        };
        wrap.appendChild(copyKo);
        wrap.appendChild(copyEn);
        form.appendChild(wrap);
        form._copyButtonsAdded = true;
    }

    form.onsubmit = (e) => {
        e.preventDefault();
        saveAddressFromModal();
    };

    modal.style.display = 'block';
}

function closeAddressModal() {
    const modal = document.getElementById('address-modal');
    if (modal) modal.style.display = 'none';
    openAddressCategory = null;
    openAddressInstitutionId = null;
}

function saveAddressFromModal() {
    if (!openAddressCategory || !openAddressInstitutionId) return;
    const ko = (document.getElementById('address-korean').value || '').trim();
    const en = (document.getElementById('address-english').value || '').trim();
    const list = institutionsData[openAddressCategory] || [];
    const item = list.find(i => i.id === openAddressInstitutionId);
    if (!item) return;
    item.addressKorean = ko;
    item.addressEnglish = en;
    saveDataToLocalStorage();
    try { syncDataToServer(); } catch (_) {}
    closeAddressModal();
    renderInstitutionsDashboard();
}

// 비밀번호 변경 기능
function getUserPwKey(userid) {
  return `userpw_${userid}`;
}

window.addEventListener('DOMContentLoaded', () => {
  // ... 기존 로그인 코드 ...
  // 비밀번호 변경 모달 관련
  const openChangePw = document.getElementById('openChangePw');
  const changePwModal = document.getElementById('changePwModal');
  const closeChangePw = document.getElementById('closeChangePw');
  const changePwForm = document.getElementById('changePwForm');
  const changePwUser = document.getElementById('changePwUser');
  const changePwCurrent = document.getElementById('changePwCurrent');
  const changePwNew = document.getElementById('changePwNew');
  const changePwNew2 = document.getElementById('changePwNew2');
  const changePwError = document.getElementById('changePwError');
  const changePwSuccess = document.getElementById('changePwSuccess');

  if (openChangePw && changePwModal && closeChangePw && changePwForm) {
    openChangePw.onclick = () => {
      changePwModal.style.display = 'flex';
      changePwUser.value = '';
      changePwCurrent.value = '';
      changePwNew.value = '';
      changePwNew2.value = '';
      changePwError.textContent = '';
    };
    closeChangePw.onclick = () => {
      changePwModal.style.display = 'none';
    };
    changePwModal.onclick = (e) => {
      if (e.target === changePwModal) changePwModal.style.display = 'none';
    };
    changePwForm.onsubmit = async (e) => {
      e.preventDefault();
      const userid = changePwUser.value.trim();
      const currentPw = changePwCurrent.value;
      const newPw = changePwNew.value;
      const newPw2 = changePwNew2.value;
      changePwError.textContent = '';
      if (!USERS.includes(userid)) {
        changePwError.textContent = '존재하지 않는 계정입니다.';
        return;
      }
      if (newPw.length < 4) {
        changePwError.textContent = '새 비밀번호는 4자 이상이어야 합니다.';
        return;
      }
      if (newPw !== newPw2) {
        changePwError.textContent = '새 비밀번호가 일치하지 않습니다.';
        return;
      }
      // 현재 비밀번호 확인 (localStorage에 있으면 그 해시, 없으면 아이디 해시)
      const inputHash = await sha256(currentPw);
      const savedHash = localStorage.getItem(getUserPwKey(userid));
      const correctHash = savedHash || await sha256(userid);
      if (inputHash !== correctHash) {
        changePwError.textContent = '현재 비밀번호가 올바르지 않습니다.';
        return;
      }
      // 새 비밀번호 해시로 저장
      const newHash = await sha256(newPw);
      localStorage.setItem(getUserPwKey(userid), newHash);
      changePwError.style.color = '#0984e3';
      changePwError.textContent = '비밀번호가 성공적으로 변경되었습니다!';
      setTimeout(() => {
        changePwModal.style.display = 'none';
        changePwError.style.color = '#e74c3c';
      }, 1200);
    };
  }

  // 위에서 Firebase Auth 기반 로그인 로직을 이미 등록했으므로 중복 방지
});

// 전역 검색 수행
let __globalSearchState = { query: '', results: [], index: -1 };

function performGlobalSearch(query) {
    const q = (query || '').trim();
    if (!q) return;

    // 동일 쿼리로 다음 결과로 이동
    if (__globalSearchState.query.toLowerCase() === q.toLowerCase() && Array.isArray(__globalSearchState.results) && __globalSearchState.results.length > 0) {
        __globalSearchState.index = (__globalSearchState.index + 1) % __globalSearchState.results.length;
        navigateToSearchResult(__globalSearchState.results[__globalSearchState.index]);
        return;
    }

    // 새 검색: 결과 수집
    const results = [];
    const lower = q.toLowerCase();

    // Contacts
    const contactCategories = ['pe-pd','real-estate','infra'];
    for (const cat of contactCategories) {
        (tableData[cat] || []).forEach(row => {
            const fields = [row.institution, row.customer, row.title, row.email].filter(Boolean).map(String);
            if (fields.some(v => v.toLowerCase().includes(lower))) {
                results.push({ type: 'contact', cat, id: row.id, selector: `tr[data-row-id="${row.id}"]`, navigate: () => { switchDashboard('contacts'); switchTab(cat); } });
            }
        });
    }

    // RFP
    (rfpData || []).forEach(rfp => {
        const fields = [rfp.institutionCategory, rfp.institution, rfp.type, rfp.strategy,
            ...(Array.isArray(rfp.participatingGps) ? rfp.participatingGps : []),
            ...(Array.isArray(rfp.selectedGps) ? rfp.selectedGps : []),
            ...(Array.isArray(rfp.memos) ? rfp.memos : [])
        ].filter(Boolean).map(String);
        if (fields.some(v => v.toLowerCase().includes(lower))) {
            results.push({ type: 'rfp', id: rfp.id, selector: `tr[data-rfp-id="${rfp.id}"]`, navigate: () => { switchDashboard('rfp'); } });
        }
    });

    // LP (institutions)
    Object.keys(institutionsData || {}).forEach(cat => {
        (institutionsData[cat] || []).forEach(inst => {
            const fields = [inst.name, inst.englishFullName, inst.abbreviation].filter(Boolean).map(String);
            if (fields.some(v => v.toLowerCase().includes(lower))) {
                results.push({ type: 'institution', cat, id: inst.id, selector: `tr[data-inst-id="${inst.id}"]`, navigate: () => { switchDashboard('institutions'); selectedInstitutionCategory = cat; renderInstitutionsDashboard(); } });
            }
        });
    });

    // GP
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    alphabet.forEach(L => {
        (gpsData[L] || []).forEach(gp => {
            const fields = [gp.name, gp.englishFullName, ...(Array.isArray(gp.strategy)? gp.strategy : [])].filter(Boolean).map(String);
            if (fields.some(v => v.toLowerCase().includes(lower))) {
                results.push({ type: 'gp', letter: L, id: gp.id, selector: `tr[data-gp-id="${gp.id}"]`, navigate: () => { switchDashboard('gps'); setSelectedGpLetter(L); } });
            }
        });
    });

    if (results.length === 0) {
        alert('검색 결과가 없습니다.');
        return;
    }

    __globalSearchState = { query: q, results, index: 0 };
    navigateToSearchResult(results[0]);
}

function navigateToSearchResult(item) {
    if (!item) return;
    if (typeof item.navigate === 'function') item.navigate();
    setTimeout(() => highlightRowBySelector(item.selector), 100);
}

function highlightRowBySelector(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;
    el.classList.add('search-highlight');
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    setTimeout(() => el.classList.remove('search-highlight'), 2500);
    return true;
}

function closeAllOpenPopups() {
    // 기관/GP 연락처 모달
    try { closeInstitutionContactsModal(); } catch (e) {}
    // 부서 선택 모달
    try { closeDeptEmailModal(); } catch (e) {}
    // 주소 모달
    try { closeAddressModal(); } catch (e) {}
    // 메모 모달
    try { closeMemoModal(); } catch (e) {}
    // GP 선택 다이얼로그(동적)
    document.querySelectorAll('.gp-dialog').forEach(el => { try { el.remove(); } catch (e) {} });
}

function renderRoadshow() {
    // days가 비어 있으면 기본 날짜 1개 자동 생성
    (function ensureDefaultRoadshowDay(){
        try {
            roadshowData.days = roadshowData.days || [];
            if (roadshowData.days.length === 0) {
                const now = new Date();
                const id = 'day_' + Date.now();
                roadshowData.days.push({ id, iso: toIsoDate(now), label: formatRoadshowDayLabel(now) });
                saveDataToLocalStorage();
            }
        } catch (_) {}
    })();
    // 헤더 (sticky time column + dynamic day columns)
    const timeHeader = `<th class="time-col">&nbsp;</th>`;
    const visibleCount = Math.max(1, (roadshowData.days || []).length);
    const dayHeaders = roadshowData.days.slice(0, visibleCount).map((d, i) => {
        const unified = formatRoadshowDayLabel(coerceDayDate(d));
        d.label = unified; // 저장 시 영문 축약형으로 통일
        return `
        <th class=\"day-col\" data-day-id=\"${d.id}\" data-day-index=\"${i}\">\n            <span class=\"add-day-handle left\" data-direction=\"prev\" data-base-index=\"${i}\" title=\"왼쪽에 날짜 추가 (Workday T-1)\">+</span>\n            ${escapeHtml(unified)}\n            <span class=\"add-day-handle right\" data-direction=\"next\" data-base-index=\"${i}\" title=\"오른쪽에 날짜 추가 (Workday T+1)\">+</span>\n        </th>`;
    }).join('');
    const head = document.getElementById('roadshow-grid-head');
    head.innerHTML = `<tr>${timeHeader}${dayHeaders}</tr>`;
    try {
        head.querySelectorAll('.add-day-handle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const baseIdx = parseInt(btn.getAttribute('data-base-index') || '0', 10);
                const dir = btn.getAttribute('data-direction') === 'prev' ? 'prev' : 'next';
                insertRoadshowWorkday(baseIdx, dir);
            });
        });
        head.addEventListener('mousedown', (e) => {
            const t = e.target;
            if (t && t.classList && t.classList.contains('add-day-handle')) {
                e.preventDefault();
            }
        }, true);
        // 헤더 우클릭 → 열 삭제
        head.querySelectorAll('th.day-col').forEach((th, idx) => {
            th.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const at = parseInt(th.getAttribute('data-day-index') || String(idx), 10);
                deleteRoadshowDayAt(at);
            });
        });
    } catch (_) {}

    // 타임 슬롯 생성
    const times = buildHalfHourTimes();
    const body = document.getElementById('roadshow-grid-body');
    body.innerHTML = times.map(t => {
        const tcol = `<td class=\"time-col\">${t}</td>`;
        const rowCells = roadshowData.days.slice(0, visibleCount).map(d => {
            return renderGridCell(d.id, t);
        }).join('');
        return `<tr>${tcol}${rowCells}</tr>`;
    }).join('');

    // Investor 표 렌더링 + 펀드 목록 렌더링
    const invBody = document.getElementById('roadshow-investor-tbody');
    const fundList = document.getElementById('roadshow-fund-list');
    if (!invBody || !fundList) return;

    // 펀드 기본 선택 보장
    const funds = roadshowData.funds || [];
    if (!window.selectedFundId || !funds.some(f => f.id === window.selectedFundId)) {
        window.selectedFundId = funds[0] ? funds[0].id : null;
    }

    // 펀드 목록 렌더
    fundList.innerHTML = (funds || []).map(f => `
        <li data-fund-id="${f.id}" class="${f.id === window.selectedFundId ? 'active' : ''}" draggable="true">
            <span class="fund-handle" title="순서 변경"><i class="fas fa-grip-vertical"></i></span>
            <input type="text" value="${escapeHtml(f.name || '')}" onchange="updateRoadshowFund('${f.id}', this.value)">
            <button class="fund-delete" title="삭제" onclick="event.stopPropagation(); deleteRoadshowFund('${f.id}')"><i class="fas fa-trash"></i></button>
        </li>
    `).join('');
    // 선택/더블클릭 편집
    Array.from(fundList.querySelectorAll('li')).forEach(li => {
        li.addEventListener('click', () => {
            const id = li.getAttribute('data-fund-id');
            if (!id) return;
            window.selectedFundId = id;
            saveDataToLocalStorage();
            renderRoadshow();
        });
        li.addEventListener('dblclick', () => {
            const input = li.querySelector('input');
            if (input) { input.focus(); input.select(); }
        });
        li.addEventListener('dragstart', (e) => {
            const tgt = e.target;
            const isHandle = (tgt && tgt.classList && (tgt.classList.contains('fund-handle') || tgt.closest && tgt.closest('.fund-handle')));
            if (!isHandle) { e.preventDefault(); return; }
            e.dataTransfer.setData('text/plain', li.getAttribute('data-fund-id'));
            e.dataTransfer.effectAllowed = 'move';
        });
    });
    fundList.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    fundList.addEventListener('drop', (e) => {
        e.preventDefault();
        const srcId = e.dataTransfer.getData('text/plain');
        const destLi = e.target.closest('li[data-fund-id]');
        if (!srcId || !destLi) return;
        const destId = destLi.getAttribute('data-fund-id');
        if (srcId === destId) return;
        const list = roadshowData.funds || [];
        const from = list.findIndex(x => x.id === srcId);
        const to = list.findIndex(x => x.id === destId);
        if (from < 0 || to < 0) return;
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved);
        saveDataToLocalStorage();
        renderRoadshow();
    });

    // Investor 표: 선택된 펀드 기준 + 스케줄 시간순 정렬
    const fundIdCtx = (window.selectedFundId || null);
    const investorsRaw = (roadshowData.investors || []).filter(inv => (inv.fundId || null) === fundIdCtx);
    const daysById = new Map((roadshowData.days || []).map(d => [d.id, d]));
    const toTs = (m) => {
        const day = daysById.get(m.dayId);
        const dateObj = coerceDayDate(day) || new Date();
        const [hh,mm] = String(m.start || '00:00').split(':').map(Number);
        const dt = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), hh||0, mm||0, 0, 0);
        return dt.getTime();
    };
    const meetingsOfFund = (roadshowData.meetings || []).filter(m => (m.fundId || null) === fundIdCtx);
    const earliestTsByInvestor = new Map();
    meetingsOfFund.forEach(m => {
        const key = String(m.company || '').trim().toLowerCase();
        if (!key) return;
        const t = toTs(m);
        const prev = earliestTsByInvestor.get(key);
        if (prev == null || t < prev) earliestTsByInvestor.set(key, t);
    });
    const investors = investorsRaw
        .map(inv => ({ inv, key: earliestTsByInvestor.get(String(inv.investor || '').trim().toLowerCase()) }))
        .sort((a,b) => {
            if (a.key == null && b.key == null) return 0;
            if (a.key == null) return 1;
            if (b.key == null) return -1;
            return a.key - b.key;
        })
        .map(x => x.inv);

    invBody.innerHTML = investors.map((inv, idx) => `
        <tr data-rs-investor-id="${inv.id}">
            <td class="number-col">${idx + 1}</td>
            <td><input type="text" value="${inv.investor || ''}" onchange="updateRoadshowInvestor('${inv.id}','investor', this.value)"></td>
            <td><input type="text" value="${inv.type || ''}" onchange="updateRoadshowInvestor('${inv.id}','type', this.value)"></td>
            <td><input type="text" value="${inv.address || ''}" onchange="updateRoadshowInvestor('${inv.id}','address', this.value)"></td>
            <td><input type="text" value="${inv.lpAttendees || ''}" onchange="updateRoadshowInvestor('${inv.id}','lpAttendees', this.value)"></td>
            <td><input type="text" value="${inv.kbSecurities || ''}" onchange="updateRoadshowInvestor('${inv.id}','kbSecurities', this.value)"></td>
            <td class="action-col">
                <div class="table-actions">
                    <button class="table-action-btn delete" onclick="deleteRoadshowInvestor('${inv.id}')" title="삭제"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    // 슬롯 클릭 및 드래그 선택 핸들러
    attachRoadshowSlotEvents();

    // 자동 너비 조정: 가용 폭에서 동일 분배
    autoFitRoadshowColumns();

    // datalist 업데이트
    updateRoadshowDatalists();
}

function addRoadshowFund() {
    roadshowData.funds = roadshowData.funds || [];
    const id = 'fund_' + Date.now();
    const index = roadshowData.funds.length + 1;
    const name = `Fund ${index}`;
    roadshowData.funds.push({ id, name });
    // 방금 추가한 펀드를 활성 컨텍스트로 설정
    window.selectedFundId = id;
    saveDataToLocalStorage();
    renderRoadshow();
}
function updateRoadshowFund(id, value) {
    const f = (roadshowData.funds || []).find(x => x.id === id);
    if (!f) return;
    f.name = value;
    saveDataToLocalStorage();
}
function deleteRoadshowFund(id) {
    if (!confirm('이 펀드를 삭제할까요?')) return;
    // 즉시 UI에서 제거
    const item = document.querySelector(`[data-fund-id="${id}"]`);
    if (item) {
        item.remove();
    }
    
    // 삭제된 항목 추적에 추가
    deletedTableRows.add(id);
    saveDeletedItems();
    updateDeletedItemsCount();
    
    roadshowData.funds = (roadshowData.funds || []).filter(f => f.id !== id);
    // 해당 펀드의 미팅도 함께 정리(선택)
    roadshowData.meetings = (roadshowData.meetings || []).filter(m => m.fundId !== id);
    saveDataToLocalStorage();
    
    // 즉시 서버 동기화
    syncDataToServer();
}

function openRoadshowMeetingModal(opts = {}) {
    const modal = document.getElementById('roadshow-meeting-modal');
    const form = document.getElementById('roadshow-meeting-form');
    const fundSel = document.getElementById('rs-fund-select');
    const daySel = document.getElementById('rs-day-select');
    const startSel = document.getElementById('rs-start-select');
    const endSel = document.getElementById('rs-end-select');
    const companyInput = document.getElementById('rs-company');
    const staffInput = document.getElementById('rs-staff');
    const noteInput = document.getElementById('rs-note');
    const addrInput = document.getElementById('rs-address');
    const lpInput = document.getElementById('rs-lp');
    const kbInput = document.getElementById('rs-kb');
    const deleteBtn = document.getElementById('rs-delete-btn');
    if (!modal || !form) return;
    // 드래그 직후 연달아 열릴 때 포커스/스크롤 충돌 방지
    try { modal.style.display = 'block'; modal.offsetHeight; modal.style.display = 'none'; } catch(_) {}

    // Fund/Day UI 제거 대응: 데이터만 준비
    const funds = roadshowData.funds || [];
    const days = roadshowData.days || [];

    // 시간 옵션 (30분 단위)
    const times = buildHalfHourTimes();
    const timeOptions = times.map(t => `<option value="${t}">${t}</option>`).join('');
    startSel.innerHTML = timeOptions;
    endSel.innerHTML = timeOptions + `<option value="22:00">22:00</option>`;

    // 값 세팅
    let m = null;
    if (opts.id) {
        m = (roadshowData.meetings || []).find(x => x.id === opts.id);
    }
    if (m) {
        startSel.value = m.start;
        endSel.value = m.end || m.start;
        companyInput.value = m.company || '';
        noteInput.value = m.note || '';
        addrInput.value = m.address || '';
        lpInput.value = Array.isArray(m.lpAttendees) ? m.lpAttendees.join(', ') : (m.lpAttendees || '');
        kbInput.value = Array.isArray(m.kbSecurities) ? m.kbSecurities.join(', ') : (m.kbSecurities || '');
        openRoadshowMeetingId = m.id;
        if (deleteBtn) deleteBtn.style.display = 'inline-flex';
    } else {
        // 새 미팅: 선택된 fund/day는 UI 없이 컨텍스트로 결정
        startSel.value = opts.start || times[0];
        endSel.value = opts.end || opts.start || times[0];
        companyInput.value = '';
        noteInput.value = '';
        addrInput.value = '';
        lpInput.value = '';
        kbInput.value = '';
        openRoadshowMeetingId = null;
        if (deleteBtn) deleteBtn.style.display = 'none';
    }

    modal.style.display = 'block';

    // 삭제 버튼 핸들러
    if (deleteBtn) {
        deleteBtn.onclick = () => {
            if (!openRoadshowMeetingId) return;
            if (!confirm('이 일정을 삭제할까요?')) return;
            roadshowData.meetings = (roadshowData.meetings || []).filter(x => x.id !== openRoadshowMeetingId);
            saveDataToLocalStorage();
            renderRoadshow();
            closeRoadshowMeetingModal();
        };
    }

    form.onsubmit = (e) => {
        e.preventDefault();
        // 현재 컨텍스트에서 fund/day 결정
        const resolvedFundId = (openRoadshowMeetingId ? (m && m.fundId) : (selectedFundId || (funds[0]?.id || ''))) || '';
        const resolvedDayId = (openRoadshowMeetingId ? (m && m.dayId) : ((opts.dayId && days.some(d => d.id === opts.dayId)) ? opts.dayId : (days[0]?.id || '')));
        // 주소 자동 채움: institutionsData 에서 한글/영문 주소 결합
        const companyName = companyInput.value.trim();
        const allInst = Object.values(institutionsData || {}).flat();
        const match = allInst.find(inst => [inst.name, inst.englishFullName, inst.abbreviation].filter(Boolean).some(n => String(n).toLowerCase() === companyName.toLowerCase()));
        let autoAddress = '';
        if (match) {
            const ko = match.addressKorean || '';
            const en = match.addressEnglish || '';
            autoAddress = [ko, en].filter(Boolean).join('\n');
        }
        const payload = {
            fundId: resolvedFundId,
            dayId: resolvedDayId,
            start: startSel.value,
            end: endSel.value,
            company: companyName,
            note: noteInput.value.trim(),
            address: (addrInput.value.trim() || autoAddress),
            lpAttendees: (lpInput.value || '').split(',').map(s => s.trim()).filter(Boolean),
            kbSecurities: (kbInput.value || '').split(',').map(s => s.trim()).filter(Boolean)
        };
        if (!payload.dayId || !payload.start) { alert('날짜/시작시간을 선택하세요.'); return; }
        if (openRoadshowMeetingId) {
            const idx = roadshowData.meetings.findIndex(x => x.id === openRoadshowMeetingId);
            if (idx >= 0) roadshowData.meetings[idx] = { ...roadshowData.meetings[idx], ...payload };
        } else {
            roadshowData.meetings.push({ id: 'meet_' + Date.now(), ...payload });
            // 드래그로 추가 저장 시, 회사명이 있으면 옆 테이블(Investor)에 자동 행 추가
            ensureInvestorForCompany(payload.company, payload.fundId);
        }
        saveDataToLocalStorage();
        // 저장 직후, 같은 펀드의 Investor 표를 시간순으로 재정렬하기 위해 즉시 렌더
        renderRoadshow();
        closeRoadshowMeetingModal();
    };

    // 회사/담당자 자동완성 업데이트
    updateRoadshowDatalists();
}

function updateRoadshowDatalists() {
    // 기관명: LP 리스트에서만 추출 (영문 Full name 혹은 약어)
    const companyDl = document.getElementById('rs-company-datalist');
    const staffDl = document.getElementById('rs-staff-datalist');
    if (companyDl) {
        const lpNames = (Object.values(institutionsData || {}).flat() || [])
            .map(i => [i.englishFullName || i.abbreviation || i.name, i.abbreviation || i.englishFullName || i.name])
            .flat()
            .filter(Boolean);
        const unique = [...new Set(lpNames)];
        companyDl.innerHTML = unique.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
    }
    if (staffDl) {
        const contactsA = Object.values(institutionsContacts || {}).flat().map(c => c.name).filter(Boolean);
        const contactsB = Object.values(gpContacts || {}).flat().map(c => c.name).filter(Boolean);
        const names = [...new Set([...(contactsA||[]), ...(contactsB||[])])].filter(Boolean);
        staffDl.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
    }
}

function ensureInvestorForCompany(company, fundId) {
    const name = String(company || '').trim();
    if (!name) return;
    roadshowData.investors = roadshowData.investors || [];
    const exists = roadshowData.investors.some(i => (i.fundId || null) === (fundId || null) && (i.investor || '').trim().toLowerCase() === name.toLowerCase());
    if (exists) return;
    const id = 'inv_' + Date.now();
    roadshowData.investors.push({ id, fundId: fundId || null, investor: name, type: '', address: '', lpAttendees: '', kbSecurities: '' });
}

function attachRoadshowSlotEvents() {
    const grid = document.getElementById('roadshow-grid-body');
    if (!grid) return;
    let dragging = false;
    let dragDay = null; // day at drag start
    let currentDay = null; // day under pointer (for visual + final)
    let startTime = null;
    let endTime = null;

    const clearSelecting = () => grid.querySelectorAll('.slot-selecting').forEach(el => el.classList.remove('slot-selecting'));

    const startDrag = (td, e) => {
        dragging = true;
        dragDay = td.getAttribute('data-day-id');
        currentDay = dragDay;
        startTime = td.getAttribute('data-time');
        endTime = startTime;
        clearSelecting();
        td.classList.add('slot-selecting');
        e.preventDefault();
    };
    const moveDrag = (td) => {
        if (!dragging) return;
        const day = td.getAttribute('data-day-id');
        currentDay = day || dragDay;
        endTime = td.getAttribute('data-time');
        clearSelecting();
        const [a,b] = orderTimes(startTime, endTime);
        markSelecting(currentDay, a, b);
    };
    const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        const [a,b] = orderTimes(startTime, endTime);
        clearSelecting();
        const finalDay = currentDay || dragDay;
        setTimeout(() => openRoadshowMeetingModal({ dayId: finalDay, start: a, end: nextHalfHour(b) }), 0);
        window.removeEventListener('pointermove', onPointerMove, true);
        window.removeEventListener('mousemove', onPointerMove, true);
    };

    const onPointerMove = (e) => {
        if (!dragging) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el) return;
        const td = el.closest && el.closest('.slot');
        if (td) moveDrag(td);
    };

    grid.querySelectorAll('.slot').forEach(td => {
        // pointer events
        td.addEventListener('pointerdown', (e) => { startDrag(td, e); window.addEventListener('pointermove', onPointerMove, true); });
        td.addEventListener('pointerenter', () => moveDrag(td));
        // mouse fallback
        td.addEventListener('mousedown', (e) => { startDrag(td, e); window.addEventListener('mousemove', onPointerMove, true); });
        td.addEventListener('mouseenter', () => moveDrag(td));
        td.addEventListener('click', () => {
            if (dragging) return;
            const dayId = td.getAttribute('data-day-id');
            const start = td.getAttribute('data-time');
            openRoadshowMeetingModal({ dayId, start });
        });
    });

    const handleUp = () => endDrag();
    window.addEventListener('pointerup', handleUp, true);
    window.addEventListener('mouseup', handleUp, true);
    window.addEventListener('mouseleave', handleUp, true);
    window.addEventListener('blur', handleUp, true);
}

function markSelecting(dayId, start, end) {
    const slots = Array.from(document.querySelectorAll(`.slot[data-day-id="${dayId}"]`));
    const times = slots.map(td => td.getAttribute('data-time'));
    const [a,b] = orderTimes(start, end);
    slots.forEach(td => {
        const t = td.getAttribute('data-time');
        if (timeGte(t, a) && timeLte(t, b)) td.classList.add('slot-selecting');
    });
}

function orderTimes(t1, t2) { return (timeToMinutes(t1) <= timeToMinutes(t2)) ? [t1,t2] : [t2,t1]; }
function timeToMinutes(t) { const [h,m] = t.split(':').map(Number); return h*60+m; }
function timeGte(a,b){ return timeToMinutes(a) >= timeToMinutes(b); }
function timeLte(a,b){ return timeToMinutes(a) <= timeToMinutes(b); }
function nextHalfHour(t) { const m=timeToMinutes(t)+30; const h=Math.floor(m/60); const mm=m%60; return `${String(h).padStart(2,'0')}:${mm===0?'00':'30'}`; }

function buildHalfHourTimes() {
    const res = [];
    for (let h = 8; h <= 21; h++) { // 08:00 ~ 21:30 (마지막 슬롯 21:30)
        ['00','30'].forEach(m => res.push(`${String(h).padStart(2,'0')}:${m}`));
    }
    return res;
}

function renderMeetingAt(dayId, start) {
    const m = (roadshowData.meetings || []).find(x => x.dayId === dayId && x.start === start);
    if (!m) return '';
    const label = escapeHtml(m.company || '');
    return `<div class="merged-content" onclick="event.stopPropagation(); openRoadshowMeetingModal({ id: '${m.id}' })">${label}</div>`;
}

function renderGridCell(dayId, time) {
    const fundCtx = (window.selectedFundId || null);
    const meeting = (roadshowData.meetings || []).find(m => (m.fundId || null) === fundCtx && m.dayId === dayId && timeGte(time, m.start) && timeLte(time, (m.end || m.start)));
    if (!meeting) {
        return `<td class=\"slot\" data-day-id=\"${dayId}\" data-time=\"${time}\"></td>`;
    }
    // range 계산
    const [s,e] = orderTimes(meeting.start, meeting.end || meeting.start);
    const isStart = time === s;
    const isInside = timeGte(time, s) && timeLte(time, e);
    const baseClass = isInside ? 'slot reserved merged' : 'slot';
    // 시작 셀에만 콘텐츠 표시, 나머지는 빈 셀로 유지
    if (isStart) {
        const rowSpan = Math.max(1, (timeToMinutes(e) - timeToMinutes(s)) / 30);
        return `<td class=\"${baseClass}\" data-day-id=\"${dayId}\" data-time=\"${time}\" rowspan=\"${rowSpan}\">${renderMeetingAt(dayId, s)}</td>`;
    } else {
        // 병합에 의해 실제 DOM에는 생성되지 않도록 빈 문자열 반환
        return '';
    }
}

function addRoadshowDay() {
    const label = prompt('날짜 라벨(예: 15 May Thu)을 입력하세요:');
    if (!label || !label.trim()) return;
    const id = 'day_' + Date.now();
    roadshowData.days.push({ id, label: label.trim() });
    saveDataToLocalStorage();
    renderRoadshow();
}

function insertRoadshowDayAt(index) {
    const label = prompt('추가할 날짜 라벨(예: 8월 29일 금)을 입력하세요:');
    if (!label || !label.trim()) return;
    const id = 'day_' + Date.now();
    roadshowData.days = roadshowData.days || [];
    const i = Math.max(0, Math.min(index, roadshowData.days.length));
    roadshowData.days.splice(i, 0, { id, label: label.trim() });
    saveDataToLocalStorage();
    renderRoadshow();
}

// === Workday helpers: weekend-skip and English short label ===
function toIsoDate(d) { const yy=d.getFullYear(); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${yy}-${mm}-${dd}`; }
function fromIsoDate(s) { const [y,m,d]=String(s||'').split('-').map(Number); if(!y||!m||!d) return null; return new Date(y, m-1, d); }
function isWeekend(d){ const w=d.getDay(); return w===0||w===6; }
function shiftWorkday(base, dir){
    let d = new Date(base.getTime());
    const step = dir==='prev' ? -1 : 1;
    do { d.setDate(d.getDate() + step); } while(isWeekend(d));
    return d;
}
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function formatRoadshowDayLabel(date){
    try {
        const d = new Date(date);
        return `${MONTHS_EN[d.getMonth()]} ${d.getDate()} (${WEEKDAYS_EN[d.getDay()]})`;
    } catch(_) { return ''; }
}
function coerceDayDate(day){
    if (day && day.iso) { const d = fromIsoDate(day.iso); if (d) return d; }
    // fallback: try parse label if exists
    return new Date();
}

function insertRoadshowWorkday(baseIndex, direction){
    roadshowData.days = roadshowData.days || [];
    const base = roadshowData.days[baseIndex];
    const baseDate = coerceDayDate(base) || new Date();
    const next = shiftWorkday(baseDate, direction);
    const item = { id: 'day_' + Date.now(), iso: toIsoDate(next), label: formatRoadshowDayLabel(next) };
    const insertIndex = direction==='prev' ? baseIndex : baseIndex+1;
    roadshowData.days.splice(Math.max(0, Math.min(insertIndex, roadshowData.days.length)), 0, item);
    saveDataToLocalStorage();
    renderRoadshow();
}

function deleteRoadshowDayAt(index){
    roadshowData.days = roadshowData.days || [];
    if (index < 0 || index >= roadshowData.days.length) return;
    const target = roadshowData.days[index];
    if (!confirm(`Delete day column: ${target && target.label ? target.label : 'this day'}?`)) return;
    const dayId = target.id;
    roadshowData.days.splice(index, 1);
    // 해당 날짜의 미팅도 함께 제거
    roadshowData.meetings = (roadshowData.meetings || []).filter(m => m.dayId !== dayId);
    saveDataToLocalStorage();
    renderRoadshow();
}

function addRoadshowInvestor() {
    const id = 'inv_' + Date.now();
    roadshowData.investors = roadshowData.investors || [];
    roadshowData.investors.push({ id, fundId: selectedFundId || null, investor: '', type: '', address: '', lpAttendees: '', kbSecurities: '' });
    saveDataToLocalStorage();
    // 빠르게 한 행만 다시 그리기보다는 일관성을 위해 전체 렌더
    renderRoadshow();
    // 렌더 후 방금 추가한 행의 첫 입력에 포커스
    setTimeout(() => {
        const row = document.querySelector(`[data-rs-investor-id="${id}"]`);
        if (row) {
            const firstInput = row.querySelector('input');
            if (firstInput) firstInput.focus();
        }
    }, 0);
}

function updateRoadshowInvestor(id, field, value) {
    const inv = (roadshowData.investors || []).find(i => i.id === id);
    if (!inv) return;
    inv[field] = value;
    saveDataToLocalStorage();
}

function deleteRoadshowInvestor(id) {
    if (!confirm('이 Investor를 삭제할까요?')) return;
    // 즉시 UI에서 제거 (올바른 선택자)
    const row = document.querySelector(`[data-rs-investor-id="${id}"]`);
    if (row) {
        row.remove();
    }
    
    // 삭제된 항목 추적에 추가
    deletedTableRows.add(id);
    saveDeletedItems();
    updateDeletedItemsCount();
    
    // 데이터에서 제거 후 저장
    roadshowData.investors = (roadshowData.investors || []).filter(i => i.id !== id);
    saveDataToLocalStorage();
    
    // UI 재렌더 및 즉시 서버 동기화
    renderRoadshow();
    syncDataToServer();
}

function closeRoadshowMeetingModal() {
    const modal = document.getElementById('roadshow-meeting-modal');
    if (modal) modal.style.display = 'none';
    openRoadshowMeetingId = null;
}

// 초기 렌더 진입점: 대시보드 진입 시 호출됨
(function attachRoadshowInit() {
    const isDashboardPage = !!document.querySelector('.dashboard-container');
    if (!isDashboardPage) return;
    // 탭 전환 시 roadshow도 렌더 보장
    const originalSwitchDashboard = switchDashboard;
    window.switchDashboard = function(d) {
        originalSwitchDashboard(d);
        if (d === 'roadshow') setTimeout(renderRoadshow, 0);
    };
})();

// Firestore → 로컬 → RTDB 복구
async function restoreFromFirestore() {
    const current = firebase && firebase.auth && firebase.auth().currentUser;
    const email = (current && current.email ? current.email : '').toLowerCase();
    if (!(email === 'av1@kbfg.com' || email === 'av1')) {
        throw new Error('복구 권한이 없습니다.');
    }
    if (!db && firebase && firebase.firestore) db = firebase.firestore();
    if (!db) throw new Error('Firestore 초기화 실패');

    const fetchAll = async (col) => {
        const out = [];
        const qs = await db.collection(col).get();
        qs.forEach(doc => {
            const data = { __id: doc.id, ...doc.data() };
            // 삭제된 항목은 제외
            if (col === 'rfp' && deletedRfpRows.has(data.id)) return;
            if (col === 'institutions' && deletedInstitutions.has(doc.id)) return;
            if (col === 'gps' && deletedGps.has(doc.id)) return;
            if (col === 'tableData' && deletedTableRows.has(data.id)) return;
            if (col === 'contacts' && deletedContacts.has(doc.id)) return;
            out.push(data);
        });
        return out;
    };

    const [rfpArr, instArr, gpArr, tableArr, contactArr] = await Promise.all([
        fetchAll('rfp'), fetchAll('institutions'), fetchAll('gps'), fetchAll('tableData'), fetchAll('contacts')
    ]);

    // institutions: 카테고리별로 묶고, item.id는 Firestore doc.id로 강제
    institutionsData = {};
    (instArr || []).forEach(it => {
        const cat = it.category || '기타';
        if (!institutionsData[cat]) institutionsData[cat] = [];
        const item = { ...it, id: it.__id };
        institutionsData[cat].push(item);
    });

    // gps: 레터별로 묶고, item.id는 Firestore doc.id로 강제
    gpsData = {};
    (gpArr || []).forEach(it => {
        const L = (it.name || 'A').charAt(0).toUpperCase();
        const item = { ...it, id: it.__id };
        if (!gpsData[L]) gpsData[L] = [];
        gpsData[L].push(item);
    });

    // 연락처: ownerId 그룹핑 + GP 별칭 키(gp_...)도 함께 구성해 누락 방지
    institutionsContacts = {};
    gpContacts = {};
    let unassignedContacts = [];

    // 과거 내부 id -> 새 문서 id 매핑 구성 (institutions/gps 모두)
    const ownerIdMap = new Map();
    (instArr || []).forEach(it => {
        const oldId = (it && it.id ? String(it.id) : '');
        const newId = (it && it.__id ? String(it.__id) : '');
        if (oldId && newId && oldId !== newId) ownerIdMap.set(oldId, newId);
    });
    (gpArr || []).forEach(it => {
        const oldId = (it && it.id ? String(it.id) : '');
        const newId = (it && it.__id ? String(it.__id) : '');
        if (oldId && newId && oldId !== newId) ownerIdMap.set(oldId, newId);
    });

    (contactArr || []).forEach(c => {
        const raw = (c.ownerId || '').trim();
        if (!raw) { unassignedContacts.push(c); return; }
        const stripped = raw.startsWith('gp_') ? raw.slice(3) : raw;
        const mapped = ownerIdMap.get(stripped) || stripped;
        (institutionsContacts[mapped] = institutionsContacts[mapped] || []).push({ ...c, ownerId: mapped });
        // GP id와 매핑되면 별칭 키도 추가
        let isGp = false;
        Object.values(gpsData).forEach(list => {
            (list || []).forEach(gp => { if (gp.id === mapped) isGp = true; });
        });
        if (isGp) (institutionsContacts['gp_' + mapped] = institutionsContacts['gp_' + mapped] || []).push({ ...c, ownerId: mapped });
    });

    // RTDB에 기존 백업이 있으면 병합(더 많은 데이터를 우선)
    try {
        const snap = await database.ref('/').once('value');
        const rtdb = snap.val() || {};
        const rInst = rtdb.institutionsContacts || {};
        const rGp = rtdb.gpContacts || {};
        const count = (m) => Object.values(m||{}).reduce((a,l)=>a+(Array.isArray(l)?l.length:0),0);
        if (count(rInst) > count(institutionsContacts)) {
            institutionsContacts = mergeContactsMaps(institutionsContacts, rInst);
        }
        if (count(rGp) > count(gpContacts)) {
            gpContacts = mergeContactsMaps(gpContacts, rGp);
        }
    } catch (_) {}

    // rfp/tableData는 있는 그대로
    rfpData = rfpArr || [];
    tableData = { 'pe-pd': [], 'real-estate': [], infra: [] };
    (tableArr || []).forEach(it => {
        const tab = it.tab || 'pe-pd';
        (tableData[tab] = tableData[tab] || []).push(it);
    });

    saveDataToLocalStorage();
    renderTable();
    renderRfpTable();
    renderInstitutionsDashboard();
    renderGpsDashboard();
    renderRoadshow();

    // Firestore 상의 연락처 문서 정규화/교정 (id, ownerId)
    try { await normalizeAndFixContactsInFirestore(contactArr, instArr, gpArr); } catch (_) {}

    const counts = {
        inst: Object.values(institutionsData||{}).reduce((a,l)=>a+(l||[]).length,0),
        gps: Object.values(gpsData||{}).reduce((a,l)=>a+(l||[]).length,0),
        contacts: (contactArr||[]).length,
        unassigned: (unassignedContacts||[]).length
    };
    await safeSyncToRtdb();
    alert(`복구 완료\n기관:${counts.inst}건, GP:${counts.gps}건, 연락처:${counts.contacts}건 (미배정:${counts.unassigned}건)`);
}

// 특정 ownerId(기관 또는 GP)의 연락처를 Firestore에서 읽어 로컬에 주입
async function recoverContactsForOwner(ownerId, displayName = '') {
    try {
        if (!ownerId) return false;
        if (!db && firebase && firebase.firestore) db = firebase.firestore();
        if (!db) return false;
        // 1) 기본 후보: ownerId, gp_ 변형
        const candidates = new Set([ownerId]);
        if (ownerId.startsWith('gp_')) candidates.add(ownerId.slice(3));
        else candidates.add('gp_' + ownerId);
        // 2) 동일 이름 기반 후보 확장 (로컬/원격 모두)
        const rawOwner = ownerId.startsWith('gp_') ? ownerId.slice(3) : ownerId;
        let ownerName = '';
        Object.values(institutionsData || {}).forEach(arr => (arr||[]).forEach(item => { if (item.id === rawOwner) ownerName = ownerName || (item.name || ''); }));
        Object.values(gpsData || {}).forEach(arr => (arr||[]).forEach(item => { if (item.id === rawOwner) ownerName = ownerName || (item.name || ''); }));
        if (!ownerName && displayName) ownerName = displayName;
        if (ownerName) {
            Object.values(institutionsData || {}).forEach(arr => (arr||[]).forEach(item => { if ((item.name || '') === ownerName) candidates.add(item.id); }));
            Object.values(gpsData || {}).forEach(arr => (arr||[]).forEach(item => { if ((item.name || '') === ownerName) candidates.add(item.id); }));
            // 원격 Firestore에서 이름으로 직접 탐색하여 문서 id 추가
            try {
                const qs1 = await db.collection('institutions').where('name','==',ownerName).get();
                qs1.forEach(doc => candidates.add(String(doc.id)));
            } catch (_) {}
            try {
                const qs2 = await db.collection('gps').where('name','==',ownerName).get();
                qs2.forEach(doc => candidates.add(String(doc.id)));
            } catch (_) {}
        }
        // 3) 후보 각각 조회 후 병합
        let list = [];
        for (const key of candidates) {
            const qs = await db.collection('contacts').where('ownerId', '==', key).get();
            qs.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        }
        if (list.length === 0) return false;
        // 4) 로컬 키는 현재 열린 키(ownerId)와 raw/별칭/동명이인 id 모두에 주입
        let isInst = false;
        Object.values(institutionsData || {}).forEach(arr => {
            (arr || []).forEach(item => { if (item.id === rawOwner) isInst = true; });
        });
        const allKeys = new Set([ownerId, rawOwner, 'gp_' + rawOwner]);
        if (ownerName) {
            Object.values(institutionsData || {}).forEach(arr => (arr||[]).forEach(item => { if ((item.name || '') === ownerName) { allKeys.add(item.id); allKeys.add('gp_' + item.id); } }));
            Object.values(gpsData || {}).forEach(arr => (arr||[]).forEach(item => { if ((item.name || '') === ownerName) { allKeys.add(item.id); allKeys.add('gp_' + item.id); } }));
        }
        allKeys.forEach(k => { institutionsContacts[k] = list; });
        if (!isInst) gpContacts[ownerId] = list;
        saveDataToLocalStorage();
        try { syncDataToServer(); } catch (_) {}
        return true;
    } catch (e) {
        console.warn('recoverContactsForOwner 실패:', e);
        // Firestore 실패 시 RTDB 폴백 시도
        try {
            const ok = await recoverContactsForOwnerFromRtdb(ownerId);
            return !!ok;
        } catch (_) { return false; }
    }
}

// RTDB 폴백: 특정 owner의 연락처를 RTDB에서 로드하여 주입
async function recoverContactsForOwnerFromRtdb(ownerId) {
    return new Promise((resolve) => {
        if (!database) return resolve(false);
        database.ref('/').once('value').then((snapshot) => {
            const data = snapshot.val() || {};
            const raw = ownerId.startsWith('gp_') ? ownerId.slice(3) : ownerId;
            const maps = [data.institutionsContacts || {}, data.gpContacts || {}];
            let found = null;
            for (const m of maps) {
                if (m[ownerId]) { found = m[ownerId]; break; }
                if (m[raw]) { found = m[raw]; break; }
                if (m['gp_' + raw]) { found = m['gp_' + raw]; break; }
            }
            if (!found || !Array.isArray(found) || found.length === 0) return resolve(false);
            // 로컬 키로 주입
            institutionsContacts[ownerId] = found;
            try { saveDataToLocalStorage(); } catch (_) {}
            try { syncDataToServer(); } catch (_) {}
            resolve(true);
        }).catch(() => resolve(false));
    });
}

// 특정 기관의 주소 필드를 Firestore의 institutions 문서에서 복구
async function recoverInstitutionAddress(institutionId) {
    try {
        if (!institutionId) return false;
        if (!db && firebase && firebase.firestore) db = firebase.firestore();
        if (!db) return false;
        // 1) 정확한 문서 ID로 조회
        let doc = await db.collection('institutions').doc(institutionId).get();
        let data = doc && doc.exists ? (doc.data() || {}) : null;
        // 2) 없으면 동일 이름을 가진 문서 후보 검색
        if (!data) {
            // 현재 로컬에서 이름을 얻어와서 동일 이름 검색
            let name = '';
            Object.values(institutionsData || {}).forEach(list => {
                (list || []).forEach(it => { if (it.id === institutionId) name = it.name || name; });
            });
            if (name) {
                const qs = await db.collection('institutions').where('name','==',name).get();
                qs.forEach(d => { if (!data) { data = d.data() || {}; doc = d; } });
            }
            if (!data) return false;
        }
        const cat = data.category || null;
        // 현재 로컬의 institutionsData에서 해당 id를 찾아 업데이트
        const categories = Object.keys(institutionsData || {});
        for (const c of categories) {
            const list = institutionsData[c] || [];
            const item = list.find(i => i.id === institutionId);
            if (item) {
                item.addressKorean = data.addressKorean || '';
                item.addressEnglish = data.addressEnglish || '';
                saveDataToLocalStorage();
                try { syncDataToServer(); } catch (_) {}
                return true;
            }
        }
        // 만약 카테고리 이동 등으로 로컬에 없는 경우, 카테고리에 삽입
        if (cat) {
            institutionsData[cat] = institutionsData[cat] || [];
            institutionsData[cat].push({ id: institutionId, ...data });
            saveDataToLocalStorage();
            try { syncDataToServer(); } catch (_) {}
            return true;
        }
        return false;
    } catch (e) {
        console.warn('recoverInstitutionAddress 실패:', e);
        // Firestore 실패 시 RTDB 폴백 시도
        try {
            const ok = await recoverInstitutionAddressFromRtdb(institutionId);
            return !!ok;
        } catch (_) { return false; }
    }
}

// RTDB 폴백: institutionsData에서 해당 기관의 주소를 찾아 주입
async function recoverInstitutionAddressFromRtdb(institutionId) {
    return new Promise((resolve) => {
        if (!database) return resolve(false);
        database.ref('/institutionsData').once('value').then((snapshot) => {
            const instData = snapshot.val() || {};
            // 1) id로 탐색
            let item = null; let catKey = null;
            Object.keys(instData).forEach(cat => {
                const list = instData[cat] || [];
                (list || []).forEach(it => { if (!item && it && it.id === institutionId) { item = it; catKey = cat; } });
            });
            // 2) 그래도 없으면 로컬 이름으로 탐색
            if (!item) {
                let localName = '';
                Object.values(institutionsData || {}).forEach(list => {
                    (list || []).forEach(it => { if (it.id === institutionId) localName = it.name || localName; });
                });
                if (localName) {
                    Object.keys(instData).forEach(cat => {
                        const list = instData[cat] || [];
                        (list || []).forEach(it => { if (!item && it && (it.name || '') === localName) { item = it; catKey = cat; } });
                    });
                }
            }
            if (!item) return resolve(false);
            // 로컬에 주입
            const categories = Object.keys(institutionsData || {});
            let updated = false;
            for (const c of categories) {
                const list = institutionsData[c] || [];
                const target = list.find(i => i.id === institutionId);
                if (target) {
                    target.addressKorean = item.addressKorean || '';
                    target.addressEnglish = item.addressEnglish || '';
                    updated = true; break;
                }
            }
            if (!updated) {
                const useCat = catKey || '기타';
                institutionsData[useCat] = institutionsData[useCat] || [];
                institutionsData[useCat].push({ id: institutionId, ...item });
            }
            try { saveDataToLocalStorage(); } catch (_) {}
            try { syncDataToServer(); } catch (_) {}
            resolve(true);
        }).catch(() => resolve(false));
    });
}

// 안전 저장: 부분 업데이트 + 빈 데이터 가드
async function safeSyncToRtdb() {
    if (!navigator.onLine || !database) return;
    const counts = {
        table: (Object.values(tableData||{}).flat()||[]).length,
        rfp: (rfpData||[]).length,
        inst: Object.values(institutionsData||{}).reduce((a, l) => a + (l||[]).length, 0),
        gps: Object.values(gpsData||{}).reduce((a, l) => a + (l||[]).length, 0),
    };
    // 임계치 미만이면 저장 차단 (사고 방지)
    const total = counts.table + counts.rfp + counts.inst + counts.gps;
    if (total < 3) { // 거의 빈 스냅샷은 저장하지 않음
        console.warn('Guard: 데이터가 비어 있어 RTDB 저장을 건너뜁니다.');
        return;
    }
    const payload = {
        tableData, rfpData, institutionsData, gpsData,
        institutionsContacts, gpContacts, roadshowData,
        lastUpdated: new Date().toISOString(), updatedBy: generateUserId()
    };
    await database.ref('/').update(payload);
}

async function normalizeAndFixContactsInFirestore(contactArr, instArr, gpArr) {
    try {
        if (!db && firebase && firebase.firestore) db = firebase.firestore();
        if (!db) return;
        // 1) 유효한 ownerId 목록 구성 (institutions + gps의 doc id)
        const validOwnerIds = new Set();
        (instArr || []).forEach(it => { if (it && it.__id) validOwnerIds.add(String(it.__id)); });
        (gpArr || []).forEach(it => { if (it && it.__id) validOwnerIds.add(String(it.__id)); });
        // 1-1) 레거시 id -> 현재 문서 id 매핑 테이블 구성
        const legacyToNew = new Map();
        (instArr || []).forEach(it => {
            const legacy = it && it.id ? String(it.id) : '';
            const fresh = it && it.__id ? String(it.__id) : '';
            if (legacy && fresh && legacy !== fresh) legacyToNew.set(legacy, fresh);
        });
        (gpArr || []).forEach(it => {
            const legacy = it && it.id ? String(it.id) : '';
            const fresh = it && it.__id ? String(it.__id) : '';
            if (legacy && fresh && legacy !== fresh) legacyToNew.set(legacy, fresh);
        });

        // 2) 각 contact에 대해 id, ownerId 정규화/재매핑
        const batch = db.batch();
        (contactArr || []).forEach(c => {
            const docId = c.__id || c.id;
            if (!docId) return;
            const ref = db.collection('contacts').doc(String(docId));
            let owner = (c.ownerId || '').trim();
            if (!owner && typeof c.id === 'string') owner = c.id; // 혹시 잘못 저장된 케이스 보정
            if (owner.startsWith('gp_')) owner = owner.slice(3);
            // 레거시 → 현재 문서 id로 매핑 시도
            const remapped = legacyToNew.get(owner);
            if (remapped) owner = remapped;
            const payload = { id: String(docId), ownerId: owner };
            if (!owner) { // owner 자체가 비어있으면 우선 id만 고정
                batch.set(ref, { id: String(docId) }, { merge: true });
                return;
            }
            if (!validOwnerIds.has(owner)) {
                // 유효하지 않더라도 정규화된 ownerId를 우선 기록해 추후 조회 가능하게 함
                batch.set(ref, payload, { merge: true });
            } else {
                batch.set(ref, payload, { merge: true });
            }
        });
        await batch.commit();
    } catch (e) {
        console.warn('normalizeAndFixContactsInFirestore 실패:', e);
    }
}

// 하루 1회 자동 정규화: contacts.ownerId를 최신 문서 id로 보정하고 gp_ 접두사 제거
async function autoNormalizeContactsDaily() {
  try {
    const key = 'lastAutoNormalizeAt';
    const last = Number(localStorage.getItem(key) || '0');
    const now = Date.now();
    if (now - last < 24*60*60*1000) return; // 24시간 이내면 스킵
    if (!db && firebase && firebase.firestore) db = firebase.firestore();
    if (!db) return;
    const fetchAll = async (col) => {
      const out = [];
      const qs = await db.collection(col).get();
      qs.forEach(doc => out.push({ __id: doc.id, ...doc.data() }));
      return out;
    };
    const [instArr, gpArr, contactArr] = await Promise.all([
      fetchAll('institutions'), fetchAll('gps'), fetchAll('contacts')
    ]);
    // Firestore 내 문서 보정(batch)
    try { await normalizeAndFixContactsInFirestore(contactArr, instArr, gpArr); } catch (_) {}
    // 로컬 표시 키도 동기 보정 (동명이인 포함)
    try {
      (contactArr||[]).forEach(c => {
        const raw = String((c.ownerId||'').replace(/^gp_/,'')).trim();
        if (!raw) return;
        institutionsContacts[raw] = institutionsContacts[raw] || [];
      });
      try { saveDataToLocalStorage(); } catch (_) {}
    } catch (_) {}
    try { await safeSyncToRtdb(); } catch (_) {}
    localStorage.setItem(key, String(now));
  } catch (_) {}
}

// tombstone 저장/복구: 로컬/RTDB와 함께 동기화
(function attachTombstonePersistence(){
  const isDashboardPage = !!document.querySelector('.dashboard-container');
  if (!isDashboardPage) return;
  try {
    const raw = localStorage.getItem('deletedTombstones');
    if (raw) deletedTombstones = JSON.parse(raw) || {};
  } catch(_) {}
  const _save = () => { try { localStorage.setItem('deletedTombstones', JSON.stringify(deletedTombstones||{})); } catch(_) {} };
  // 기존 saveDataToLocalStorage 확장: tombstone도 저장
  const _origSave = saveDataToLocalStorage;
  window.saveDataToLocalStorage = function(){
    _origSave();
    _save();
  };
})();

// 지역별(전체) 그룹 묶음 렌더
function renderInstitutionsRegionAll() {
    const detailTitle = document.getElementById('institutions-detail-title');
    const detailTbody = document.getElementById('institutions-detail-tbody');
    if (!detailTitle || !detailTbody) return;

    detailTitle.textContent = '지역별 (전체)';
    
    // 지역 그룹 구성
    const regionGroups = {};
    Object.values(institutionsData).forEach(list => {
        list.forEach(inst => {
            const region = extractRegionFromAddress(inst.address);
            if (!regionGroups[region]) regionGroups[region] = [];
            regionGroups[region].push(inst);
        });
    });

    const regions = Object.keys(regionGroups).sort();
    const rows = [];

    regions.forEach(region => {
        // 섹션 헤더 행
        rows.push(`
            <tr class="region-group-row"><td colspan="6"><div class="region-group-title">${region} <span class="count">${regionGroups[region].length}</span></div></td></tr>
        `);
        // 항목 행들
        regionGroups[region].forEach(inst => {
            rows.push(`
                <tr data-institution-id="${inst.id}">
                    <td>${inst.name || ''}</td>
                    <td>${inst.fullName || ''}</td>
                    <td>${inst.abbreviation || ''}</td>
                    <td>${inst.address || ''}</td>
                    <td>
                        <button class="contact-open-btn" onclick="openInstitutionContacts('${inst.id}')" title="연락처 보기">
                            <i class="fas fa-address-book"></i>
                        </button>
                    </td>
                    <td class="action-col">
                        <div class="table-actions">
                            <button class="table-action-btn edit" onclick="editInstitution('${inst.id}')" title="수정">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="table-action-btn delete" onclick="deleteInstitution('${getInstitutionCategory(inst.id)}','${inst.id}')" title="삭제">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `);
        });
    });

    // 렌더
    detailTbody.innerHTML = rows.join('');

    // 지도 뷰면 지도 갱신
    if (isMapView) {
        showInstitutionsOnMap();
    }
}

function renderMiniGrid() {
    const miniGrid = document.getElementById('roadshow-mini-grid');
    const miniDaySelect = document.getElementById('mini-day-select');
    if (!miniGrid || !miniDaySelect) return;
    const dayId = window.__miniSelectedDayId || (miniDaySelect.value || '');
    if (!dayId) { miniGrid.innerHTML = '<div style="font-size:0.9rem;color:#6b7280;">날짜를 먼저 추가하세요.</div>'; return; }
    const times = buildHalfHourTimes();
    miniGrid.innerHTML = times.map(t => `<div class="mini-slot" data-time="${t}">${t}</div>`).join('');
    attachMiniGridEvents(dayId);
}

function attachMiniGridEvents(dayId) {
    const miniGrid = document.getElementById('roadshow-mini-grid');
    if (!miniGrid) return;
    let dragging = false;
    let startTime = null;
    let endTime = null;
    const clearSelecting = () => miniGrid.querySelectorAll('.mini-slot').forEach(el => el.classList.remove('slot-selecting'));
    const markRange = (a,b) => {
        const [s,e] = orderTimes(a,b);
        miniGrid.querySelectorAll('.mini-slot').forEach(el => {
            const t = el.getAttribute('data-time');
            if (timeGte(t, s) && timeLte(t, e)) el.classList.add('slot-selecting');
        });
    };
    miniGrid.querySelectorAll('.mini-slot').forEach(div => {
        div.addEventListener('mousedown', (e) => {
            dragging = true;
            startTime = div.getAttribute('data-time');
            endTime = startTime;
            clearSelecting();
            div.classList.add('slot-selecting');
            e.preventDefault();
        });
        div.addEventListener('mouseenter', () => {
            if (!dragging) return;
            endTime = div.getAttribute('data-time');
            clearSelecting();
            markRange(startTime, endTime);
        });
        div.addEventListener('click', (e) => {
            if (dragging) return;
            const start = div.getAttribute('data-time');
            openRoadshowMeetingModal({ dayId, start });
        });
    });
    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        const [a,b] = orderTimes(startTime, endTime);
        clearSelecting();
        openRoadshowMeetingModal({ dayId, start: a, end: nextHalfHour(b) });
    }, { once: true });
}

// Roadshow grid dynamic columns (excluding sticky time column)
let rsExtraCols = 3; // deprecated in rendering path (now uses actual day count)
function addRoadshowColumn() {
    rsExtraCols += 1;
    renderRoadshow();
}
function removeRoadshowColumn() {
    rsExtraCols = Math.max(1, rsExtraCols - 1);
    renderRoadshow();
}

function autoFitRoadshowColumns() {
    try {
        const table = document.getElementById('roadshow-grid-table');
        if (!table) return;
        const container = table.parentElement; // .roadshow-grid
        const totalWidth = container.clientWidth;
        const timeWidth = 90; // sticky time col width
        // 실제 표시되는 day 열 개수로 폭 계산
        const visibleCount = Math.max(1, (roadshowData.days || []).length);
        const cols = visibleCount;
        const each = Math.max(140, Math.floor((totalWidth - timeWidth) / cols));
        const ths = table.querySelectorAll('th');
        ths.forEach((th, idx) => {
            if (idx === 0) { th.style.width = timeWidth + 'px'; }
            else { th.style.width = each + 'px'; }
        });
        const rows = table.querySelectorAll('tr');
        rows.forEach(tr => {
            tr.querySelectorAll('td').forEach((td, idx) => {
                if (idx === 0) td.style.width = timeWidth + 'px';
                else td.style.width = each + 'px';
            });
        });
    } catch (_) {}
}

window.addEventListener('resize', () => { try { autoFitRoadshowColumns(); } catch(_){} });

// ----- Institutions: global dedup helpers -----
function normalizeInstitutionName(name) {
    return String(name || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function dedupeInstitutionsData(persist=false) {
    try {
        const before = JSON.stringify(institutionsData || {});
        const seen = new Map(); // key -> {cat, idx}
        Object.keys(institutionsData || {}).forEach(cat => {
            const list = Array.isArray(institutionsData[cat]) ? institutionsData[cat] : [];
            const filtered = [];
            list.forEach(item => {
                const key = normalizeInstitutionName(item && item.name);
                if (!key) { filtered.push(item); return; }
                if (!seen.has(key)) {
                    seen.set(key, { cat, id: item.id });
                    filtered.push(item);
                } else {
                    // merge minimal fields if primary lacks them
                    const primaryRef = seen.get(key);
                    const primaryList = institutionsData[primaryRef.cat] || [];
                    const primary = primaryList.find(x => x.id === primaryRef.id);
                    if (primary) {
                        ['englishFullName','abbreviation','addressKorean','addressEnglish'].forEach(f => {
                            if (!primary[f] && item && item[f]) primary[f] = item[f];
                        });
                    }
                }
            });
            institutionsData[cat] = filtered;
        });
        const after = JSON.stringify(institutionsData || {});
        const changed = before !== after;
        if (changed && persist) {
            try { saveDataToLocalStorage(); } catch(_) {}
            try { syncDataToServer(); } catch(_) {}
        }
        return changed;
    } catch (e) { /* no-op */ }
    return false;
}