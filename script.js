// 전역 변수
let currentTab = 'pe';
let tableData = {
    pe: [],
    pd: [],
    'real-estate': [],
    infra: []
};

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    initializeTabs();
    loadDataFromLocalStorage();
    renderTable();
    initializeRealTimeSync();
    updateConnectionStatus();
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

// 전체화면 토글
function toggleFullscreen() {
    const fullscreenIcon = document.getElementById('fullscreen-icon');
    
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            fullscreenIcon.className = 'fas fa-compress';
        }).catch(err => {
            console.log('전체화면 전환 실패:', err);
        });
    } else {
        document.exitFullscreen().then(() => {
            fullscreenIcon.className = 'fas fa-expand';
        }).catch(err => {
            console.log('전체화면 해제 실패:', err);
        });
    }
}

// 전체화면 상태 변경 감지
document.addEventListener('fullscreenchange', function() {
    const fullscreenIcon = document.getElementById('fullscreen-icon');
    if (document.fullscreenElement) {
        fullscreenIcon.className = 'fas fa-compress';
    } else {
        fullscreenIcon.className = 'fas fa-expand';
    }
});

// 테이블 행 추가
function addTableRow(category) {
    const newRow = {
        id: generateId(),
        institution: '',
        customer: '',
        email: ''
    };
    
    tableData[category].push(newRow);
    saveDataToLocalStorage();
    renderTable();
    syncDataToServer();
}

// 테이블 행 삭제
function deleteTableRow(category, rowId) {
    if (confirm('정말로 이 행을 삭제하시겠습니까?')) {
        tableData[category] = tableData[category].filter(row => row.id !== rowId);
        saveDataToLocalStorage();
        renderTable();
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
    
    data.forEach(row => {
        const institution = row.institution.trim() || '미분류';
        if (!groups[institution]) {
            groups[institution] = [];
        }
        groups[institution].push(row);
    });
    
    return groups;
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
        return;
    }
    
    // 데이터를 기관별로 그룹핑
    const groups = groupDataByInstitution(data);
    let rowNumber = 1;
    let html = '';
    
    Object.keys(groups).forEach(institution => {
        const groupData = groups[institution];
        
        // 그룹 헤더 (기관명)
        html += `
            <tr class="group-header">
                <td class="number-col">${rowNumber++}</td>
                <td colspan="3">
                    <span class="group-indicator"></span>
                    ${institution}
                </td>
                <td class="action-col">
                    <div class="table-actions">
                        <button class="table-action-btn" 
                                onclick="addRowToInstitution('${currentTab}', '${institution}')" 
                                title="같은 기관에 행 추가">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        
        // 그룹 아이템들 (고객 정보)
        groupData.forEach(row => {
            html += `
                <tr class="group-item" data-row-id="${row.id}">
                    <td class="number-col">${rowNumber++}</td>
                    <td>
                        <input type="text" 
                               value="${row.institution || ''}" 
                               placeholder="기관명 입력"
                               onchange="updateTableData('${currentTab}', '${row.id}', 'institution', this.value)">
                    </td>
                    <td>
                        <input type="text" 
                               value="${row.customer || ''}" 
                               placeholder="고객명 입력"
                               onchange="updateTableData('${currentTab}', '${row.id}', 'customer', this.value)">
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
    });
    
    tbody.innerHTML = html;
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

// ID 생성
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 로컬 스토리지에 데이터 저장
function saveDataToLocalStorage() {
    localStorage.setItem('tableData', JSON.stringify(tableData));
}

// 로컬 스토리지에서 데이터 로드
function loadDataFromLocalStorage() {
    const savedData = localStorage.getItem('tableData');
    if (savedData) {
        tableData = JSON.parse(savedData);
    }
}

// 실시간 동기화 초기화
function initializeRealTimeSync() {
    // 5초마다 서버에서 데이터 동기화
    setInterval(syncDataFromServer, 5000);
    
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

// 서버로 데이터 동기화 (시뮬레이션)
function syncDataToServer() {
    if (navigator.onLine) {
        // 실제 서버 동기화 로직이 여기에 들어갑니다
        // 현재는 로컬 스토리지만 사용
        console.log('데이터가 서버에 동기화되었습니다.');
    }
}

// 서버에서 데이터 동기화 (시뮬레이션)
function syncDataFromServer() {
    if (navigator.onLine) {
        // 실제 서버에서 데이터를 가져오는 로직이 여기에 들어갑니다
        // 현재는 로컬 스토리지만 사용
        console.log('서버에서 데이터를 확인했습니다.');
    }
}

// 연결 상태 업데이트
function updateConnectionStatus() {
    const statusIcon = document.getElementById('status-icon');
    const statusText = document.getElementById('status-text');
    const statusContainer = statusIcon.parentElement;
    
    if (navigator.onLine) {
        statusIcon.style.color = '#28a745';
        statusText.textContent = '실시간 공유 연결됨';
        statusContainer.classList.add('connected');
        statusContainer.classList.remove('disconnected');
    } else {
        statusIcon.style.color = '#dc3545';
        statusText.textContent = '오프라인 모드';
        statusContainer.classList.add('disconnected');
        statusContainer.classList.remove('connected');
    }
}

// 샘플 데이터 추가 (개발용)
function addSampleData() {
    if (tableData.pe.length === 0) {
        tableData.pe = [
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
            }
        ];
    }
    
    if (tableData.pd.length === 0) {
        tableData.pd = [
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