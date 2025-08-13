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

// 기관 연락처(팝업 대시보드) 상태
let institutionsContacts = {}; // key: institutionId, value: Contact[]
let openContactsInstitutionId = null; // 현재 모달이 가리키는 기관 ID

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    // 제목 클릭 시 새로고침
    const title = document.getElementById('app-title');
    if (title) {
        title.style.cursor = 'pointer';
        title.addEventListener('click', () => window.location.reload());
    }

    initializeTabs();
    initializeDashboardTabs();
    loadDataFromLocalStorage();
    
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
    
    // 열 리사이즈 기능 초기화
    setTimeout(() => {
        initializeColumnResize();
        // 저장된 열 너비 복원
        document.querySelectorAll('.data-table').forEach(table => {
            restoreColumnWidths(table);
        });
    }, 100);

    scheduleAutoFitDashboard();
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

    // 정렬 없이 원래 입력 순서를 유지하여, 새 행은 항상 마지막에 추가되도록 함
    data.forEach(row => {
        html += `
            <tr data-row-id="${row.id}">
                <td class="number-col">${rowNumber++}</td>
                <td>
                    <input type="text" 
                           value="${row.institution || ''}" 
                           placeholder="기관명 입력"
                           onchange="updateTableData('${currentTab}', '${row.id}', 'institution', this.value)"
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
    
    // 자동완성 기능 적용
    setTimeout(() => {
        const institutionInputs = tbody.querySelectorAll('input[placeholder="기관명 입력"]');
        const suggestions = getGpSuggestions();
        
        institutionInputs.forEach(input => {
            createAutocompleteInput(input, suggestions, (selectedValue) => {
                const rowId = input.getAttribute('data-row-id');
                updateTableData(currentTab, rowId, 'institution', selectedValue);
            });
        });
        
        // 리사이즈 기능 재초기화
        const table = document.getElementById(`${currentTab}-table`);
        if (table) {
            initializeColumnResize();
            restoreColumnWidths(table);
        }
        scheduleAutoFitDashboard();
    }, 100);
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
        selectedGps: []
    };
    
    rfpData.push(newRfp);
    saveDataToLocalStorage();
    renderRfpTable();
    syncDataToServer();
}

// RFP 행 삭제
function deleteRfpRow(rfpId) {
    if (confirm('정말로 이 공고를 삭제하시겠습니까?')) {
        rfpData = rfpData.filter(rfp => rfp.id !== rfpId);
        saveDataToLocalStorage();
        renderRfpTable();
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
                <td colspan="9" class="empty-table">
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
        institutionsData[category] = institutionsData[category].filter(inst => inst.id !== institutionId);
        saveDataToLocalStorage();
        renderInstitutionsDashboard();
        syncDataToServer();
    }
}

function renderInstitutionsDashboard() {
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
                <button class="address-edit-btn" onclick="openAddressModal('${selectedInstitutionCategory}','${inst.id}')">주소 편집</button>
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
    syncDataToServer();

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
    gpsData[letter] = (gpsData[letter] || []).filter(g => g.id !== gpId);
    saveDataToLocalStorage();
    renderGpsDashboard();
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
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
    
    // Firebase에 실시간 동기화
    syncDataToServer();
}

// 로컬 스토리지에서 데이터 로드
function loadDataFromLocalStorage() {
    const savedData = localStorage.getItem('tableData');
    if (savedData) {
        tableData = JSON.parse(savedData);
    }
    // 안전하게 키 초기화
    if (!tableData || typeof tableData !== 'object') tableData = {};
    if (!Array.isArray(tableData['pe-pd'])) tableData['pe-pd'] = [];
    if (!Array.isArray(tableData['real-estate'])) tableData['real-estate'] = [];
    if (!Array.isArray(tableData['infra'])) tableData['infra'] = [];

    const savedRfpData = localStorage.getItem('rfpData');
    if (savedRfpData) {
        rfpData = JSON.parse(savedRfpData);
    }
    
    const savedInstitutionsData = localStorage.getItem('institutionsData');
    if (savedInstitutionsData) {
        institutionsData = JSON.parse(savedInstitutionsData);
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
    }
    const savedContacts = localStorage.getItem('institutionsContacts');
    if (savedContacts) {
        institutionsContacts = JSON.parse(savedContacts);
    }

    // 전략 정규화 적용
    normalizeGpStrategies();

    // 사용자가 입력한 RFP의 기관/분류를 LP 리스트에 반영
    syncInstitutionsFromRfp();
}

// 실시간 동기화 초기화
function initializeRealTimeSync() {
	// Firebase 실시간 리스너 설정
	if (database) {
		database.ref('/').on('value', (snapshot) => {
			const data = snapshot.val();
			if (data && data.lastUpdated) {
				// 자신의 변경은 무시하고, 다른 사용자의 변경은 항상 반영
				if (data.updatedBy !== getCurrentUserId()) {
					console.log('다른 사용자의 변경사항을 감지했습니다.');
					
					if (data.tableData) {
						tableData = data.tableData;
						renderTable();
					}
					
					if (data.rfpData) {
						rfpData = data.rfpData;
						renderRfpTable();
					}
					
					if (data.institutionsData) {
						institutionsData = data.institutionsData;
						renderInstitutionsDashboard();
					}
					
					if (data.gpsData) {
						gpsData = data.gpsData;
						// 동기화 데이터에도 전략 정규화 적용
						normalizeGpStrategies();
						renderGpsDashboard();
					}
					
					updateConnectionStatus(true);
				}
			}
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

// Firebase로 데이터 동기화
function syncDataToServer() {
    if (navigator.onLine && database) {
        try {
            // 모든 데이터를 Firebase에 업로드
            const allData = {
                tableData: tableData,
                rfpData: rfpData,
                institutionsData: institutionsData,
                gpsData: gpsData,
                institutionsContacts: institutionsContacts,
                lastUpdated: new Date().toISOString(),
                updatedBy: generateUserId()
            };
            
            database.ref('/').set(allData).then(() => {
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
                        tableData = data.tableData;
                        renderTable();
                    }
                    
                    if (data.rfpData && JSON.stringify(data.rfpData) !== JSON.stringify(rfpData)) {
                        rfpData = data.rfpData;
                        renderRfpTable();
                    }
                    
                    if (data.institutionsData && JSON.stringify(data.institutionsData) !== JSON.stringify(institutionsData)) {
                        institutionsData = data.institutionsData;
                        renderInstitutionsDashboard();
                    }
                    
                    if (data.gpsData && JSON.stringify(data.gpsData) !== JSON.stringify(gpsData)) {
                        gpsData = data.gpsData;
                        // 동기화 데이터에도 전략 정규화 적용
                        normalizeGpStrategies();
                        renderGpsDashboard();
                    }
                    
                    if (data.institutionsContacts && JSON.stringify(data.institutionsContacts) !== JSON.stringify(institutionsContacts)) {
                        institutionsContacts = data.institutionsContacts;
                        if (openContactsInstitutionId) renderInstitutionContacts(openContactsInstitutionId);
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
    const exists = institutionsData[category].some(inst => inst.name === name);
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
    // 제목 설정
    const titleEl = document.getElementById('institution-contacts-title');
    if (titleEl) {
        titleEl.textContent = institutionName ? `${institutionName} - Contacts` : '기관 연락처';
    }
    // 모달 열기
    const modal = document.getElementById('institution-contacts-modal');
    if (modal) modal.style.display = 'block';
    // 내용 렌더
    renderInstitutionContacts(institutionId);
}

function closeInstitutionContactsModal() {
    const modal = document.getElementById('institution-contacts-modal');
    if (modal) modal.style.display = 'none';
}

// 팝업 대시보드: 연락처 렌더링
function renderInstitutionContacts(institutionId) {
    const tbody = document.getElementById('institution-contacts-tbody');
    if (!tbody) return;
    const list = institutionsContacts[institutionId] || [];

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-table">
                    <i class="fas fa-address-book"></i>
                    <h3>등록된 Contact가 없습니다</h3>
                    <p>오른쪽 상단의 연락처 추가 버튼을 눌러 등록하세요.</p>
                </td>
            </tr>
        `;
        return;
    }

    // 부서별 넘버링
    const deptCounters = {};
    tbody.innerHTML = list.map(contact => {
        const dept = (contact.department || '').trim();
        const no = dept ? ((deptCounters[dept] = (deptCounters[dept] || 0) + 1)) : '';
        return `
        <tr data-contact-id="${contact.id}">
            <td class="number-col">${no}</td>
            <td><input type="text" value="${contact.department || ''}" placeholder="부서명" onchange="updateInstitutionContact('${institutionId}','${contact.id}','department', this.value)"></td>
            <td><input type="text" value="${contact.position || ''}" placeholder="직급" onchange="updateInstitutionContact('${institutionId}','${contact.id}','position', this.value)"></td>
            <td><input type="text" value="${contact.name || ''}" placeholder="성함" onchange="updateInstitutionContact('${institutionId}','${contact.id}','name', this.value)"></td>
            <td><input type="email" value="${contact.email || ''}" placeholder="E-mail" onchange="updateInstitutionContact('${institutionId}','${contact.id}','email', this.value)"></td>
            <td><input type="text" value="${contact.office || ''}" placeholder="내선번호" onchange="updateInstitutionContact('${institutionId}','${contact.id}','office', this.value)"></td>
            <td><input type="text" value="${contact.mobile || ''}" placeholder="핸드폰" onchange="updateInstitutionContact('${institutionId}','${contact.id}','mobile', this.value)"></td>
            <td class="action-col">
                <div class="table-actions">
                    <button class="table-action-btn delete" onclick="deleteInstitutionContact('${institutionId}','${contact.id}')" title="삭제">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
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
    renderInstitutionContacts(openContactsInstitutionId);
}

// 팝업 대시보드: 연락처 수정
function updateInstitutionContact(institutionId, contactId, field, value) {
    const list = institutionsContacts[institutionId] || [];
    const item = list.find(c => c.id === contactId);
    if (!item) return;
    item[field] = value;
    saveDataToLocalStorage();
}

// 팝업 대시보드: 연락처 삭제
function deleteInstitutionContact(institutionId, contactId) {
    if (!confirm('이 연락처를 삭제할까요?')) return;
    institutionsContacts[institutionId] = (institutionsContacts[institutionId] || []).filter(c => c.id !== contactId);
    saveDataToLocalStorage();
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
    ko.value = (item && item.addressKorean) ? item.addressKorean : '';
    en.value = (item && item.addressEnglish) ? item.addressEnglish : '';

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
    closeAddressModal();
    renderInstitutionsDashboard();
}