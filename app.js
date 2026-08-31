// 外科医 夜勤シフトスマート決定システム - Core Logic (app.js)

// 4人の医師データ定義（デフォルト）
let doctors = [
  { id: 'doc_1', name: '佐々木', color: '#38bdf8' }, // Aqua / Blue
  { id: 'doc_2', name: '田中',   color: '#10b981' }, // Emerald Green
  { id: 'doc_3', name: '鈴木',   color: '#f59e0b' }, // Amber / Yellow
  { id: 'doc_4', name: '高橋',   color: '#a855f7' }  // Purple
];

// アプリ全体の状態
let state = {
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth(), // 0-indexed (8 = 9月)
  mode: 'shift', // 'shift' | 'unavail'
  selectedDoctorForUnavail: 'doc_1',
  defaultRequirement: 2, // 2名 or 3名
  // キー: "YYYY-MM" -> オブジェクト { days: { "YYYY-MM-DD": { requirement: 2, assigned: ['doc_1', 'doc_2'], unavailable: { doc_3: true } } } }
  shiftData: {}
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  doctors.forEach(d => { if (d.name) d.name = cleanDoctorName(d.name); });
  loadLocalStorage();
  doctors.forEach(d => { if (d.name) d.name = cleanDoctorName(d.name); });
  saveLocalStorage();
  loadFromURL();
  initLucideIcons();
  setupEventListeners();
  renderApp();
});

function initLucideIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// URLパラメータからのシフト自動復元
function loadFromURL() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const encodedData = urlParams.get('shift');
    if (encodedData) {
      const decodedStr = decodeURIComponent(atob(encodedData));
      const payload = JSON.parse(decodedStr);
      if (payload && payload.monthKey && payload.days) {
        state.shiftData[payload.monthKey] = { days: payload.days };
        if (payload.year && payload.month !== undefined) {
          state.currentYear = payload.year;
          state.currentMonth = payload.month;
        }
        saveLocalStorage();
        setTimeout(() => {
          showToast('🔗 共有されたシフトデータを読み込みました！');
        }, 500);
      }
    }
  } catch (e) {
    console.error('Failed to parse share URL data:', e);
  }
}

function cleanDoctorName(name) {
  if (!name) return '';
  return name.replace(/\s*医師/g, '').trim();
}

// LocalStorageの読み込み
function loadLocalStorage() {
  try {
    const savedDocs = localStorage.getItem('surg_shift_doctors');
    if (savedDocs) {
      doctors = JSON.parse(savedDocs);
    }
    // 名前に「医師」が含まれている場合は除去クリーンアップ
    doctors.forEach(d => {
      if (d.name) {
        d.name = cleanDoctorName(d.name);
      }
    });

    const savedState = localStorage.getItem('surg_shift_state');
    if (savedState) {
      const parsed = JSON.parse(savedState);
      state.shiftData = parsed.shiftData || {};
      state.defaultRequirement = parsed.defaultRequirement || 2;
    }
    saveLocalStorage();
  } catch (e) {
    console.error('Failed to load local storage:', e);
  }
}

function saveLocalStorage() {
  try {
    doctors.forEach(d => {
      if (d.name) d.name = cleanDoctorName(d.name);
    });
    localStorage.setItem('surg_shift_doctors', JSON.stringify(doctors));
    localStorage.setItem('surg_shift_state', JSON.stringify({
      shiftData: state.shiftData,
      defaultRequirement: state.defaultRequirement
    }));
  } catch (e) {
    console.error('Failed to save local storage:', e);
  }
}

// 現在の月のデータを取得（なければ初期化）
function getMonthKey(year = state.currentYear, month = state.currentMonth) {
  const m = String(month + 1).padStart(2, '0');
  return `${year}-${m}`;
}

function ensureMonthData(year = state.currentYear, month = state.currentMonth) {
  const monthKey = getMonthKey(year, month);
  if (!state.shiftData[monthKey]) {
    state.shiftData[monthKey] = { days: {} };
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDateKey(year, month, d);
    if (!state.shiftData[monthKey].days[dateStr]) {
      state.shiftData[monthKey].days[dateStr] = {
        requirement: state.defaultRequirement,
        assigned: [],
        unavailable: {}
      };
    }
  }
  return state.shiftData[monthKey];
}

function formatDateKey(year, month, day) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

// UIイベントのバインド
function setupEventListeners() {
  // モード切替
  document.getElementById('btn-mode-shift')?.addEventListener('click', () => setMode('shift'));
  document.getElementById('btn-mode-unavail')?.addEventListener('click', () => setMode('unavail'));

  // カレンダー操作
  document.getElementById('btn-prev-month')?.addEventListener('click', () => changeMonth(-1));
  document.getElementById('btn-next-month')?.addEventListener('click', () => changeMonth(1));
  document.getElementById('btn-today')?.addEventListener('click', () => {
    state.currentYear = new Date().getFullYear();
    state.currentMonth = new Date().getMonth();
    renderApp();
  });

  // 自動生成
  document.getElementById('btn-auto-generate')?.addEventListener('click', openAutoGenerateModal);

  // 共有機能
  document.getElementById('btn-share-link')?.addEventListener('click', exportShareLink);
  document.getElementById('btn-share-text')?.addEventListener('click', exportTextShare);

  // 閲覧＆エクスポート
  document.getElementById('btn-gcal-export')?.addEventListener('click', openGcalModal);
  document.getElementById('btn-view-compact')?.addEventListener('click', openCompactViewModal);
  document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
  document.getElementById('btn-print')?.addEventListener('click', () => window.print());

  // スマホ専用クイックボタンバインド
  document.getElementById('btn-mobile-auto-gen')?.addEventListener('click', openAutoGenerateModal);
  document.getElementById('btn-mobile-view-compact')?.addEventListener('click', openCompactViewModal);
  document.getElementById('btn-mobile-share')?.addEventListener('click', exportShareLink);
  document.getElementById('btn-exec-auto-gen')?.addEventListener('click', (e) => {
    e.preventDefault();
    executeAutoGenerateWithSettings();
  });

  // モーダル関連
  document.getElementById('form-doctor-edit')?.addEventListener('submit', handleDoctorEditSubmit);
}

function setMode(newMode) {
  state.mode = newMode;
  document.getElementById('btn-mode-shift')?.classList.toggle('active', newMode === 'shift');
  document.getElementById('btn-mode-unavail')?.classList.toggle('active', newMode === 'unavail');
  
  document.getElementById('btn-mobile-mode-shift')?.classList.toggle('active', newMode === 'shift');
  document.getElementById('btn-mobile-mode-unavail')?.classList.toggle('active', newMode === 'unavail');

  const banner = document.getElementById('mode-banner');
  const bannerText = document.getElementById('mode-banner-text');

  if (banner && bannerText) {
    if (newMode === 'shift') {
      banner.className = 'mode-banner shift-mode';
      bannerText.innerText = '【勤務シフト作成モード】カレンダー内の名前をタップするだけで、勤務のON/OFFを切り替えられます。';
    } else {
      banner.className = 'mode-banner unavail-mode';
      bannerText.innerText = '【不可日（希望休）登録モード】カレンダー内の名前をタップするだけで、その医師の不可日（希望休）を登録・解除できます。';
    }
  }

  renderSidebarDoctors();
  renderCalendar();
}

// モバイルアコーディオン（パネル折りたたみ）制御
function toggleAccordion(panelId) {
  const panel = document.getElementById(panelId);
  if (panel && panel.classList.contains('collapsible')) {
    panel.classList.toggle('collapsed');
  }
}

// モバイルボトムナビ用：集計・名簿パネルへスクロール
function scrollToStats() {
  const docPanel = document.getElementById('panel-doctors');
  const statsPanel = document.getElementById('panel-stats');
  
  if (docPanel) docPanel.classList.remove('collapsed');
  if (statsPanel) statsPanel.classList.remove('collapsed');

  setTimeout(() => {
    statsPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 120);
}

// モバイルメニューダイアログ制御
function openMobileMenu() {
  document.getElementById('modal-mobile-menu')?.classList.add('active');
}

function closeMobileMenu() {
  document.getElementById('modal-mobile-menu')?.classList.remove('active');
}

function setDefaultRequirement(req) {
  state.defaultRequirement = req;
  saveLocalStorage();
}

function applyDefaultReqToCurrentMonth() {
  const monthData = ensureMonthData();
  Object.keys(monthData.days).forEach(dateStr => {
    monthData.days[dateStr].requirement = state.defaultRequirement;
  });
  saveLocalStorage();
  renderApp();
}

function changeMonth(delta) {
  state.currentMonth += delta;
  if (state.currentMonth < 0) {
    state.currentMonth = 11;
    state.currentYear--;
  } else if (state.currentMonth > 11) {
    state.currentMonth = 0;
    state.currentYear++;
  }
  renderApp();
}

function cleanDoctorName(name) {
  if (!name) return '';
  return name.trim();
}

function getDoctorById(id) {
  return doctors.find(d => d.id === id);
}

// ----------------------------------------------------
// メインレンダリング
// ----------------------------------------------------
function renderApp() {
  // 名前データの強制クリーンアップ
  doctors.forEach(d => {
    if (d.name) d.name = cleanDoctorName(d.name);
  });
  saveLocalStorage();

  ensureMonthData();
  renderHeaderMonth();
  renderSidebarDoctors();
  renderStats();
  renderCalendar();
  initLucideIcons();
}

function renderHeaderMonth() {
  const title = `${state.currentYear}年 ${state.currentMonth + 1}月`;
  document.getElementById('calendar-title').innerText = title;
  document.getElementById('current-month-label').innerText = `${state.currentYear}年${state.currentMonth + 1}月`;
}

// サイドバー：医師リストレンダリング
function renderSidebarDoctors() {
  const container = document.getElementById('doctor-list');
  container.innerHTML = '';

  doctors.forEach(doc => {
    const item = document.createElement('div');
    const isSelectedUnavail = (state.mode === 'unavail' && state.selectedDoctorForUnavail === doc.id);
    item.className = `doctor-item ${isSelectedUnavail ? 'selected-unavail-mode' : ''}`;

    item.innerHTML = `
      <div class="doctor-info">
        <span class="doctor-color-dot" style="background-color: ${doc.color}; color: ${doc.color};"></span>
        <span class="doctor-name">${doc.name}</span>
      </div>
      <button class="icon-btn edit-icon-btn" title="名前/色を編集" onclick="openDoctorModal('${doc.id}', event)">
        <i data-lucide="edit-3"></i>
      </button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.edit-icon-btn')) return;
      if (state.mode === 'unavail') {
        state.selectedDoctorForUnavail = doc.id;
        setMode('unavail');
      }
    });

    container.appendChild(item);
  });
}

// サイドバー：集計＆公平性ダッシュボード
function renderStats() {
  const container = document.getElementById('stats-summary');
  container.innerHTML = '';

  const monthData = ensureMonthData();
  const daysInMonth = new Date(state.currentYear, state.currentMonth + 1, 0).getDate();

  // カウント初期化
  const stats = {};
  doctors.forEach(d => {
    stats[d.id] = { total: 0, weekday: 0, weekend: 0, unavailCount: 0 };
  });

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDateKey(state.currentYear, state.currentMonth, d);
    const dayData = monthData.days[dateStr];
    const dateObj = new Date(state.currentYear, state.currentMonth, d);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

    // 当直カウント
    if (dayData && dayData.assigned) {
      dayData.assigned.forEach(docId => {
        if (stats[docId]) {
          stats[docId].total++;
          if (isWeekend) stats[docId].weekend++;
          else stats[docId].weekday++;
        }
      });
    }

    // 不可日カウント
    if (dayData && dayData.unavailable) {
      Object.keys(dayData.unavailable).forEach(docId => {
        if (dayData.unavailable[docId] && stats[docId]) {
          stats[docId].unavailCount++;
        }
      });
    }
  }

  // 最大当直数（プログレスバー計算用）
  const maxTotal = Math.max(...Object.values(stats).map(s => s.total), 1);

  doctors.forEach(doc => {
    const s = stats[doc.id];
    const percentage = Math.min(100, Math.round((s.total / Math.max(maxTotal, 10)) * 100));

    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <div class="stat-row-top">
        <span class="stat-doctor-name">
          <span class="doctor-color-dot" style="background-color: ${doc.color}; color: ${doc.color}; width: 10px; height: 10px;"></span>
          ${doc.name}
        </span>
        <span class="stat-counts">勤務 <strong>${s.total}</strong>回 (平日${s.weekday} / 休日${s.weekend})</span>
      </div>
      <div class="stat-bar-container">
        <div class="stat-bar" style="width: ${percentage}%; background: ${doc.color};"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

// ----------------------------------------------------
// 日本の祝日計算ロジック (固定祝日・ハッピーマンデー・春分秋分・振替休日)
// ----------------------------------------------------
function getJapaneseHoliday(year, month, day) {
  const m = month + 1;
  const d = day;
  const dateObj = new Date(year, month, day);
  const dayOfWeek = dateObj.getDay();

  // 第N月曜日判定ヘルパー
  const getNthMonday = (n) => {
    let count = 0;
    for (let i = 1; i <= 31; i++) {
      if (new Date(year, month, i).getDay() === 1) {
        count++;
        if (count === n) return i;
      }
    }
    return -1;
  };

  // 春分・秋分の計算
  const getShunbun = (y) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  const getShuubun = (y) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

  let name = '';

  if (m === 1) {
    if (d === 1) name = '元日';
    else if (d === getNthMonday(2)) name = '成人の日';
  } else if (m === 2) {
    if (d === 11) name = '建国記念の日';
    else if (d === 23) name = '天皇誕生日';
  } else if (m === 3) {
    if (d === getShunbun(year)) name = '春分の日';
  } else if (m === 4) {
    if (d === 29) name = '昭和の日';
  } else if (m === 5) {
    if (d === 3) name = '憲法記念日';
    else if (d === 4) name = 'みどりの日';
    else if (d === 5) name = 'こどもの日';
  } else if (m === 7) {
    if (d === getNthMonday(3)) name = '海の日';
  } else if (m === 8) {
    if (d === 11) name = '山の日';
  } else if (m === 9) {
    if (d === getNthMonday(3)) name = '敬老の日';
    else if (d === getShuubun(year)) name = '秋分の日';
  } else if (m === 10) {
    if (d === getNthMonday(2)) name = 'スポーツの日';
  } else if (m === 11) {
    if (d === 3) name = '文化の日';
    else if (d === 23) name = '勤労感謝の日';
  }

  if (name) return name;

  // 振替休日判定
  if (d > 1) {
    const prevDate = new Date(year, month, d - 1);
    if (prevDate.getDay() === 0 && getJapaneseHoliday(year, month, d - 1)) {
      return '振替休日';
    }
  }

  return null;
}

// ----------------------------------------------------
// カレンダー レンダリング
// ----------------------------------------------------
function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const year = state.currentYear;
  const month = state.currentMonth;
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthData = ensureMonthData(year, month);
  const today = new Date();

  // 前月埋め
  for (let i = 0; i < firstDayOfWeek; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'day-cell other-month';
    grid.appendChild(emptyCell);
  }

  // 月の日付描画
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDateKey(year, month, d);
    const dateObj = new Date(year, month, d);
    const dayOfWeek = dateObj.getDay();
    const isSun = dayOfWeek === 0;
    const isSat = dayOfWeek === 6;
    const holidayName = getJapaneseHoliday(year, month, d);
    const isHoliday = !!holidayName;
    const isToday = (today.getFullYear() === year && today.getMonth() === month && today.getDate() === d);

    const dayData = monthData.days[dateStr] || { requirement: 2, assigned: [], unavailable: {} };

    const cell = document.createElement('div');
    cell.className = `day-cell ${isSun || isHoliday ? 'is-sun' : ''} ${isSat ? 'is-sat' : ''} ${isSat || isSun || isHoliday ? 'is-weekend' : ''} ${isHoliday ? 'is-holiday' : ''} ${isToday ? 'is-today' : ''}`;

    // 日付ヘッダー (日付数値 & 祝日名)
    const header = document.createElement('div');
    header.className = 'day-header';

    const dayNum = document.createElement('span');
    dayNum.className = `day-number ${isSun || isHoliday ? 'sun' : ''}`;
    dayNum.innerText = d;

    header.appendChild(dayNum);

    if (holidayName) {
      const holLabel = document.createElement('span');
      holLabel.className = 'holiday-name';
      holLabel.innerText = holidayName;
      header.appendChild(holLabel);
    }

    cell.appendChild(header);

    // 医師チップコンテナ (4人の名前をあらかじめ常時表示して直感タッチ可能に)
    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'day-doctors-chips';

    doctors.forEach(doc => {
      const isAssigned = dayData.assigned && dayData.assigned.includes(doc.id);
      const isUnavail = dayData.unavailable && dayData.unavailable[doc.id];

      const chip = document.createElement('div');
      chip.className = `doctor-chip ${isAssigned ? 'assigned' : ''} ${isUnavail ? 'unavailable-flag' : ''}`;

      if (isAssigned) {
        const textColor = getTextColorForBackground(doc.color);
        chip.style.backgroundColor = doc.color;
        chip.style.borderColor = doc.color;
        chip.style.color = textColor;
      }

      chip.innerHTML = `<span class="doc-name-text">${doc.name}</span>`;

      // チップを直接タッチして登録/解除 (モードに応じたワンタップ切り替え)
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDoctorChipClick(dateStr, doc.id);
      });

      chipsContainer.appendChild(chip);
    });

    cell.appendChild(chipsContainer);

    // 日付セル空白部のタップで詳細モーダルを開く
    cell.addEventListener('click', () => {
      openDayModal(dateStr);
    });

    grid.appendChild(cell);
  }
}

// ----------------------------------------------------
// 1日クイック詳細 モーダル制御 (ボトムシート)
// ----------------------------------------------------
let activeModalDateStr = null;

function openDayModal(dateStr) {
  activeModalDateStr = dateStr;
  const monthData = ensureMonthData();
  const dayData = monthData.days[dateStr] || { requirement: 2, assigned: [], unavailable: {} };
  
  const [y, m, d] = dateStr.split('-');
  const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const weekNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dayOfWeek = weekNames[dateObj.getDay()];

  document.getElementById('day-detail-title').innerText = `${parseInt(m)}月${parseInt(d)}日 (${dayOfWeek}) の勤務設定`;

  // 人数ボタン
  const req = dayData.requirement || 2;
  document.getElementById('modal-req-2')?.classList.toggle('active', req === 2);
  document.getElementById('modal-req-3')?.classList.toggle('active', req === 3);

  // 医師トグルボタン一覧レンダリング
  renderDayModalToggles(dateStr);

  const modal = document.getElementById('modal-day-detail');
  if (modal) {
    modal.classList.add('active');
    modal.classList.add('bottom-sheet-modal');
    modal.querySelector('.modal-content')?.classList.add('bottom-sheet-content');
  }
}

function closeDayModal() {
  document.getElementById('modal-day-detail')?.classList.remove('active');
  activeModalDateStr = null;
}

function setDayRequirementFromModal(req) {
  if (!activeModalDateStr) return;
  const monthData = ensureMonthData();
  const day = monthData.days[activeModalDateStr];
  if (day) {
    day.requirement = req;
    saveLocalStorage();
    renderApp();
    openDayModal(activeModalDateStr); // 再レンダリング後モーダル状態を維持
  }
}

function renderDayModalToggles(dateStr) {
  const container = document.getElementById('modal-doctor-toggles');
  if (!container) return;
  container.innerHTML = '';

  const monthData = ensureMonthData();
  const dayData = monthData.days[dateStr] || { assigned: [], unavailable: {} };

  doctors.forEach(doc => {
    const isAssigned = dayData.assigned && dayData.assigned.includes(doc.id);
    const isUnavail = dayData.unavailable && dayData.unavailable[doc.id];

    const card = document.createElement('div');
    card.className = 'modal-doc-card';

    const textColor = getTextColorForBackground(doc.color);
    card.innerHTML = `
      <div class="doc-card-left">
        <span class="doctor-color-dot" style="background-color: ${doc.color}; color: ${doc.color};"></span>
        <span class="doc-card-name">${doc.name}</span>
      </div>
      <div class="doc-card-right">
        <button class="doc-action-btn assigned-btn ${isAssigned ? 'active' : ''}" style="${isAssigned ? `background:${doc.color}; border-color:${doc.color}; color:${textColor}; font-weight:700;` : ''}">
          勤務
        </button>
        <button class="doc-action-btn unavail-btn ${isUnavail ? 'active' : ''}">
          <i data-lucide="calendar-off" style="width:14px;height:14px;"></i> 希望休
        </button>
      </div>
    `;

    // 当直ボタンクリック
    const assignedBtn = card.querySelector('.assigned-btn');
    assignedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDoctorChipClick(dateStr, doc.id);
      openDayModal(dateStr);
    });

    // 希望休ボタンクリック
    const unavailBtn = card.querySelector('.unavail-btn');
    unavailBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDoctorUnavail(dateStr, doc.id);
      openDayModal(dateStr);
    });

    container.appendChild(card);
  });

  initLucideIcons();
}

// ----------------------------------------------------
// 今月のシフト一括クリア（全削除）
// ----------------------------------------------------
function clearCurrentMonthShifts() {
  if (!confirm(`${state.currentYear}年${state.currentMonth + 1}月の勤務シフトをすべて削除しますか？`)) {
    return;
  }
  const monthData = ensureMonthData();
  Object.keys(monthData.days).forEach(dateStr => {
    monthData.days[dateStr].assigned = [];
  });
  saveLocalStorage();
  renderApp();
  showToast('🗑️ 今月のシフトをすべて削除しました');
}

// ----------------------------------------------------
// インタラクティブ操作ロジック
// ----------------------------------------------------

// 1日ごとの必要人数（2名 ↔ 3名）切り替え
function toggleDayRequirement(dateStr) {
  const monthData = ensureMonthData();
  const day = monthData.days[dateStr];
  if (day) {
    day.requirement = (day.requirement === 2) ? 3 : 2;
    saveLocalStorage();
    renderApp();
  }
}

// モード別タップトグル
// シフト作成モード: 1タップ目で勤務 ➔ 2タップ目で不可日(赤枠) ➔ 3タップ目で解除
// 不可日登録モード: 1タップ目で不可日(赤枠) ➔ 2タップ目で解除
function handleDoctorChipClick(dateStr, docId) {
  const monthData = ensureMonthData();
  const day = monthData.days[dateStr];
  if (!day) return;

  if (!day.assigned) day.assigned = [];
  if (!day.unavailable) day.unavailable = {};

  if (state.mode === 'unavail') {
    // 【不可日登録モード】ワンタップで不可日(希望休[赤枠])設定 ↔ 解除
    const isUnavail = !!day.unavailable[docId];
    if (!isUnavail) {
      day.unavailable[docId] = true;
      const idx = day.assigned.indexOf(docId);
      if (idx > -1) day.assigned.splice(idx, 1);
    } else {
      delete day.unavailable[docId];
    }
  } else {
    // 【シフト作成モード】3状態サイクル: 未設定 ➔ 勤務 ➔ 不可日(赤枠) ➔ 未設定
    const isAssigned = day.assigned.includes(docId);
    const isUnavail = !!day.unavailable[docId];

    if (!isAssigned && !isUnavail) {
      // 未設定 ➔ 勤務 (カラー背景)
      if (!day.assigned.includes(docId)) day.assigned.push(docId);
      delete day.unavailable[docId];
    } else if (isAssigned) {
      // 勤務 ➔ 不可日 (赤枠)
      const idx = day.assigned.indexOf(docId);
      if (idx > -1) day.assigned.splice(idx, 1);
      day.unavailable[docId] = true;
    } else {
      // 不可日 ➔ 解除 (未設定)
      const idx = day.assigned.indexOf(docId);
      if (idx > -1) day.assigned.splice(idx, 1);
      delete day.unavailable[docId];
    }
  }

  saveLocalStorage();
  renderApp();
}

// 不可日（希望休）明示的トグル
function toggleDoctorUnavail(dateStr, docId) {
  const monthData = ensureMonthData();
  const day = monthData.days[dateStr];
  if (!day) return;

  if (!day.assigned) day.assigned = [];
  if (!day.unavailable) day.unavailable = {};

  const isUnavail = !!day.unavailable[docId];
  if (!isUnavail) {
    day.unavailable[docId] = true;
    const idx = day.assigned.indexOf(docId);
    if (idx > -1) day.assigned.splice(idx, 1);
  } else {
    day.unavailable[docId] = false;
  }

  saveLocalStorage();
  renderApp();
}

// 曜日別設定 (デフォルトは各曜日 2名)
let dowRequirements = { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 };

function setDowReq(dow, req) {
  dowRequirements[dow] = req;
  for (let r = 1; r <= 3; r++) {
    const btn = document.getElementById(`seg-dow-${dow}-${r}`);
    if (btn) btn.classList.toggle('active', r === req);
  }
}

// ----------------------------------------------------
// 自動生成設定モーダル制御
// ----------------------------------------------------
function openAutoGenerateModal() {
  const modal = document.getElementById('modal-auto-generate');
  if (modal) {
    modal.classList.add('active');
    initLucideIcons();
  }
}

function closeAutoGenerateModal() {
  document.getElementById('modal-auto-generate')?.classList.remove('active');
}

function selectAllAutoDays(select) {
  for (let i = 0; i <= 6; i++) {
    const chk = document.getElementById(`chk-auto-dow-${i}`);
    if (chk) chk.checked = select;
  }
}

function executeAutoGenerateWithSettings() {
  try {
    const selectedDays = [];
    for (let i = 0; i <= 6; i++) {
      const chk = document.getElementById(`chk-auto-dow-${i}`);
      if (chk && chk.checked) {
        selectedDays.push(parseInt(chk.value, 10));
      }
    }

    if (selectedDays.length === 0) {
      showToast('⚠️ 自動生成する曜日を1つ以上選択してください');
      return;
    }

    closeAutoGenerateModal();
    generateAutoShift(selectedDays, dowRequirements);
  } catch (err) {
    console.error('Auto generate error:', err);
    showToast('⚠️ 自動生成処理に失敗しました');
  }
}

// ----------------------------------------------------
// スマート自動シフト生成アルゴリズム (指定曜日のみ限定生成 & 曜日別人数対応)
// ----------------------------------------------------
function generateAutoShift(targetDays = [0, 1, 2, 3, 4, 5, 6], reqMap = dowRequirements) {
  const year = state.currentYear;
  const month = state.currentMonth;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthData = ensureMonthData(year, month);

  const weekNames = ['日', '月', '火', '水', '木', '金', '土'];
  const targetDayNames = targetDays.map(d => weekNames[d]).join('・');

  // 各医師の当直カウントを追跡 (合計、指定曜日グループ合計、週末、曜日別内訳、最終当直日)
  const doctorStats = {};
  doctors.forEach(d => {
    doctorStats[d.id] = {
      total: 0,
      targetGroupTotal: 0,
      weekend: 0,
      dayOfWeekCounts: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      lastAssignedDay: -99
    };
  });

  // 1 pass: 既存の非対象曜日のシフト状況を集計
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDateKey(year, month, d);
    const dayData = monthData.days[dateStr];
    const dateObj = new Date(year, month, d);
    const dayOfWeek = dateObj.getDay();
    const isTargetDay = targetDays.includes(dayOfWeek);

    // 対象外の曜日の既存アサインをカウント
    if (!isTargetDay && dayData && dayData.assigned) {
      dayData.assigned.forEach(docId => {
        if (doctorStats[docId]) {
          doctorStats[docId].total++;
          doctorStats[docId].dayOfWeekCounts[dayOfWeek]++;
          if (dayOfWeek === 0 || dayOfWeek === 6) doctorStats[docId].weekend++;
          doctorStats[docId].lastAssignedDay = d;
        }
      });
    }
  }

  // 2 pass: 対象曜日のみ自動アサインを割り当て
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDateKey(year, month, d);
    const dayData = monthData.days[dateStr];
    const dateObj = new Date(year, month, d);
    const dayOfWeek = dateObj.getDay();
    const isTargetDay = targetDays.includes(dayOfWeek);

    // ユーザーが選択した対象曜日「だけ」を書き換え生成
    if (isTargetDay) {
      const req = reqMap[dayOfWeek] || 2;
      dayData.requirement = req; // 曜日ごとの指定人数を反映
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6 || !!getJapaneseHoliday(year, month, d));

      // 候補となる医師をフィルタリング
      // 条件1: 不可日（希望休）でない
      // 条件2: 前日（d-1）に夜勤に入っていない（連当防止）
      let candidates = doctors.filter(doc => {
        const isUnavail = dayData.unavailable && dayData.unavailable[doc.id];
        const workedYesterday = (doctorStats[doc.id].lastAssignedDay === d - 1);
        return !isUnavail && !workedYesterday;
      });

      // 候補不足時のフォールバック
      if (candidates.length < req) {
        candidates = doctors.filter(doc => {
          return !(dayData.unavailable && dayData.unavailable[doc.id]);
        });
      }

      // 候補者をソート (曜日ごとの担当均等化 ＆ 月間合計の平準化)
      candidates.sort((a, b) => {
        const statA = doctorStats[a.id];
        const statB = doctorStats[b.id];

        // 優先度1: 該当する曜日 (例: 金曜なら金曜) でのアサイン回数が少ない医師を最優先
        const dowA = statA.dayOfWeekCounts[dayOfWeek] || 0;
        const dowB = statB.dayOfWeekCounts[dayOfWeek] || 0;
        if (dowA !== dowB) return dowA - dowB;

        // 優先度2: 月間の全体当直数が少ない医師を優先
        if (statA.total !== statB.total) return statA.total - statB.total;

        // 優先度3: 週末・祝日の当直数が少ない医師を優先
        if (isWeekend && statA.weekend !== statB.weekend) {
          return statA.weekend - statB.weekend;
        }

        return Math.random() - 0.5;
      });

      const selected = candidates.slice(0, req).map(c => c.id);
      dayData.assigned = selected;

      // 統計更新
      selected.forEach(docId => {
        doctorStats[docId].total++;
        doctorStats[docId].targetGroupTotal++;
        if (isWeekend) doctorStats[docId].weekend++;
        doctorStats[docId].dayOfWeekCounts[dayOfWeek]++;
        doctorStats[docId].lastAssignedDay = d;
      });
    }
  }

  saveLocalStorage();
  renderApp();

  const msg = targetDays.length === 7 
    ? '✨ 全曜日のシフトを自動生成しました！'
    : `✨ 【${targetDayNames}曜】のみシフトを自動生成しました！`;

  showToast(msg);
}

// トースト通知
function showToast(msg) {
  let toast = document.getElementById('toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-msg';
    toast.style.cssText = `
      position: fixed; bottom: 20px; right: 20px;
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #fff; padding: 12px 24px; border-radius: 10px;
      font-weight: 600; box-shadow: 0 10px 25px rgba(0,0,0,0.4);
      z-index: 2000; transition: all 0.3s ease; opacity: 0;
    `;
    document.body.appendChild(toast);
  }
  toast.innerText = msg;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, 3500);
}

// ----------------------------------------------------
// 医師編集モーダル
// ----------------------------------------------------
function openDoctorModal(docId, event) {
  event.stopPropagation();
  const doc = getDoctorById(docId);
  if (!doc) return;

  document.getElementById('edit-doc-id').value = doc.id;
  document.getElementById('edit-doc-name').value = doc.name;
  document.getElementById('edit-doc-color').value = doc.color;

  document.getElementById('modal-doctor-edit').classList.add('active');
}

function closeDoctorModal() {
  document.getElementById('modal-doctor-edit').classList.remove('active');
}

function handleDoctorEditSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('edit-doc-id').value;
  const rawName = document.getElementById('edit-doc-name').value;
  const name = cleanDoctorName(rawName);
  const color = document.getElementById('edit-doc-color').value;

  const doc = getDoctorById(id);
  if (doc && name) {
    doc.name = name;
    doc.color = color;
    saveLocalStorage();
    closeDoctorModal();
    renderApp();
    showToast(`✏️ 担当医を「${name}」に変更しました`);
  }
}

// ----------------------------------------------------
// CSVダウンロード機能
// ----------------------------------------------------
function exportCSV() {
  const year = state.currentYear;
  const month = state.currentMonth;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthData = ensureMonthData(year, month);

    let csvContent = "\uFEFF日付,曜日,必要勤務人数,担当医師1,担当医師2,担当医師3,不可日設定医師\n";

  const weekNames = ['日', '月', '火', '水', '木', '金', '土'];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDateKey(year, month, d);
    const dateObj = new Date(year, month, d);
    const dayOfWeekStr = weekNames[dateObj.getDay()];

    const dayData = monthData.days[dateStr] || { requirement: 2, assigned: [], unavailable: {} };
    const assignedNames = (dayData.assigned || []).map(id => getDoctorById(id)?.name || '');

    const unavailNames = Object.keys(dayData.unavailable || {})
      .filter(id => dayData.unavailable[id])
      .map(id => getDoctorById(id)?.name || '');

    const doc1 = assignedNames[0] || '';
    const doc2 = assignedNames[1] || '';
    const doc3 = assignedNames[2] || '';
    const unavailStr = unavailNames.join('; ');

    csvContent += `"${dateStr}","${dayOfWeekStr}",${dayData.requirement},"${doc1}","${doc2}","${doc3}","${unavailStr}"\n`;
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `外科勤務シフト_${year}年${month + 1}月.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ----------------------------------------------------
// 共有リンク発行（Base64 URL生成）
// ----------------------------------------------------
function exportShareLink() {
  const monthKey = getMonthKey();
  const monthData = ensureMonthData();
  
  const payload = {
    year: state.currentYear,
    month: state.currentMonth,
    monthKey: monthKey,
    days: monthData.days
  };

  try {
    const jsonStr = JSON.stringify(payload);
    const encoded = btoa(encodeURIComponent(jsonStr));
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?shift=${encoded}`;

    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('🔗 共有用URLをクリップボードにコピーしました！');
    }).catch(err => {
      prompt('以下の共有用URLをコピーしてください:', shareUrl);
    });
  } catch (e) {
    console.error('Failed to generate share URL:', e);
    showToast('⚠️ 共有リンクの生成に失敗しました');
  }
}

// ----------------------------------------------------
// LINE・テキスト共有
// ----------------------------------------------------
function exportTextShare() {
  const year = state.currentYear;
  const month = state.currentMonth;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthData = ensureMonthData(year, month);
  const weekNames = ['日', '月', '火', '水', '木', '金', '土'];

  let text = `【外科夜勤勤務シフト 🏥 ${year}年${month + 1}月】\n\n`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDateKey(year, month, d);
    const dateObj = new Date(year, month, d);
    const dayOfWeek = weekNames[dateObj.getDay()];
    const dayData = monthData.days[dateStr] || { assigned: [] };

    const names = (dayData.assigned || []).map(id => getDoctorById(id)?.name || '');
    const namesStr = names.length > 0 ? names.join('・') : '未定';

    text += `${month + 1}/${d}(${dayOfWeek}): ${namesStr}\n`;
  }

  text += `\n作成日: ${new Date().toLocaleDateString('ja-JP')}`;

  navigator.clipboard.writeText(text).then(() => {
    showToast('💬 LINE/メッセージ用のシフトテキストをコピーしました！');
  }).catch(() => {
    prompt('以下のテキストをコピーして共有してください:', text);
  });
}

// ----------------------------------------------------
// 背景色に応じた視認性の高いテキストカラー判定
// ----------------------------------------------------
function getTextColorForBackground(hexColor) {
  if (!hexColor || hexColor.charAt(0) !== '#') return '#0f172a';
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return '#0f172a';
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 130 ? '#0f172a' : '#ffffff';
}

// ----------------------------------------------------
// 勤務者のみ一画面閲覧ビュー (コンパクトモーダル)
// ----------------------------------------------------
function openCompactViewModal() {
  renderCompactCalendar();
  const modal = document.getElementById('modal-compact-view');
  if (modal) {
    modal.classList.add('active');
  }
}

function closeCompactViewModal() {
  const modal = document.getElementById('modal-compact-view');
  if (modal) {
    modal.classList.remove('active');
  }
}

function renderCompactCalendar() {
  const container = document.getElementById('compact-calendar-container');
  if (!container) return;
  container.innerHTML = '';

  const year = state.currentYear;
  const month = state.currentMonth;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const monthData = ensureMonthData(year, month);

  // モーダルタイトル更新
  const titleElem = document.getElementById('compact-view-title');
  if (titleElem) {
    titleElem.innerHTML = `<i data-lucide="eye"></i> ${year}年${month + 1}月 確定勤務表 (勤務者のみ)`;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'compact-calendar-container';

  // 曜日ヘッダー
  const weekHeader = document.createElement('div');
  weekHeader.className = 'compact-weekdays';
  const weekNames = ['日', '月', '火', '水', '木', '金', '土'];
  weekNames.forEach((w, idx) => {
    const span = document.createElement('span');
    span.innerText = w;
    if (idx === 0) span.className = 'sun';
    if (idx === 6) span.className = 'sat';
    weekHeader.appendChild(span);
  });
  wrapper.appendChild(weekHeader);

  // カレンダーグリッド
  const grid = document.createElement('div');
  grid.className = 'compact-grid';

  // 前月のパディングセル
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const pCell = document.createElement('div');
    pCell.className = 'compact-day-cell other-month';
    const dayNum = prevMonthDays - i;
    pCell.innerHTML = `<div class="compact-day-header">${dayNum}</div>`;
    grid.appendChild(pCell);
  }

  // 当月セル
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDateKey(year, month, d);
    const dayData = monthData.days[dateStr] || { assigned: [] };
    const dateObj = new Date(year, month, d);
    const dow = dateObj.getDay();

    const cell = document.createElement('div');
    cell.className = 'compact-day-cell';

    const header = document.createElement('div');
    header.className = `compact-day-header ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}`;
    header.innerText = d;
    cell.appendChild(header);

    const docList = document.createElement('div');
    docList.className = 'compact-doc-list';

    // 勤務割り当てのある医師のみタグ表示
    const assignedIds = dayData.assigned || [];
    assignedIds.forEach(docId => {
      const doc = doctors.find(item => item.id === docId);
      if (doc) {
        const tag = document.createElement('div');
        tag.className = 'compact-doc-tag';
        const textColor = getTextColorForBackground(doc.color);
        tag.style.backgroundColor = doc.color;
        tag.style.color = textColor;
        tag.innerText = doc.name;
        docList.appendChild(tag);
      }
    });

    cell.appendChild(docList);
    grid.appendChild(cell);
  }

  // 翌月のパディングセル
  const totalCellsSoFar = firstDayOfWeek + daysInMonth;
  const totalGridCells = totalCellsSoFar > 35 ? 42 : 35;
  const nextPadding = totalGridCells - totalCellsSoFar;
  for (let n = 1; n <= nextPadding; n++) {
    const nCell = document.createElement('div');
    nCell.className = 'compact-day-cell other-month';
    nCell.innerHTML = `<div class="compact-day-header">${n}</div>`;
    grid.appendChild(nCell);
  }

  wrapper.appendChild(grid);
  container.appendChild(wrapper);

  initLucideIcons();
}

// ----------------------------------------------------
// Googleカレンダー連携 モーダル＆エクスポート機能
// ----------------------------------------------------
function openGcalModal() {
  const modal = document.getElementById('modal-gcal');
  if (!modal) return;

  const select = document.getElementById('gcal-doctor-select');
  if (select) {
    select.innerHTML = '<option value="all">全員の勤務</option>';
    doctors.forEach(doc => {
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.textContent = doc.name;
      select.appendChild(opt);
    });
  }

  renderGcalModalContent();
  modal.classList.add('active');
  initLucideIcons();
}

function closeGcalModal() {
  const modal = document.getElementById('modal-gcal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function getShiftDatesForDoctor(selectedDocId) {
  const year = state.currentYear;
  const month = state.currentMonth;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthData = ensureMonthData(year, month);
  const weekNames = ['日', '月', '火', '水', '木', '金', '土'];
  const result = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDateKey(year, month, d);
    const dateObj = new Date(year, month, d);
    const dayOfWeek = weekNames[dateObj.getDay()];
    const dayData = monthData.days[dateStr] || { assigned: [] };
    const assignedIds = dayData.assigned || [];

    if (assignedIds.length === 0) continue;

    if (selectedDocId === 'all') {
      const docNames = assignedIds.map(id => getDoctorById(id)?.name || '').filter(Boolean);
      result.push({ dateStr, day: d, dayOfWeek, assignedIds, docNamesStr: docNames.join('・') });
    } else if (assignedIds.includes(selectedDocId)) {
      const targetDoc = getDoctorById(selectedDocId);
      result.push({ dateStr, day: d, dayOfWeek, assignedIds: [selectedDocId], docNamesStr: targetDoc ? targetDoc.name : '' });
    }
  }

  return result;
}

function renderGcalModalContent() {
  const selectDoc = document.getElementById('gcal-doctor-select')?.value || 'all';
  const container = document.getElementById('gcal-direct-links-container');
  if (!container) return;

  container.innerHTML = '';
  const shiftList = getShiftDatesForDoctor(selectDoc);

  if (shiftList.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.82rem; padding: 1rem;">該当する勤務シフトがありません</div>';
    return;
  }

  shiftList.forEach(item => {
    const card = document.createElement('div');
    card.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.04); padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); font-size: 0.85rem;';
    
    const titleText = `外科勤務 (${item.docNamesStr})`;
    const gcalUrl = buildGoogleCalendarUrl(item.dateStr, titleText);

    card.innerHTML = `
      <div>
        <span style="font-weight: 700; color: #fff; margin-right: 0.4rem;">${state.currentMonth + 1}/${item.day} (${item.dayOfWeek})</span>
        <span style="color: #38bdf8; font-weight: 600;">${item.docNamesStr}</span>
        <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 0.4rem;">17:00〜翌09:00</span>
      </div>
      <a href="${gcalUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; color: #38bdf8; border-color: rgba(56,189,248,0.4); text-decoration: none; display: inline-flex; align-items: center; gap: 0.2rem;">
        Googleカレンダーに追加 🔗
      </a>
    `;
    container.appendChild(card);
  });

  initLucideIcons();
}

function buildGoogleCalendarUrl(dateStr, title) {
  // dateStr: "YYYY-MM-DD"
  const [y, m, d] = dateStr.split('-').map(Number);
  
  // 当日 17:00 〜 翌日 09:00
  const startStr = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}T170000`;
  const nextDate = new Date(y, m - 1, d + 1);
  const ny = nextDate.getFullYear();
  const nm = nextDate.getMonth() + 1;
  const nd = nextDate.getDate();
  const endStr = `${ny}${String(nm).padStart(2, '0')}${String(nd).padStart(2, '0')}T090000`;
  const datesParam = `${startStr}/${endStr}`;

  const details = `外科シフトマネージャーにより登録された勤務予定です。`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${datesParam}&details=${encodeURIComponent(details)}`;
}

function downloadICSFile() {
  const selectDoc = document.getElementById('gcal-doctor-select')?.value || 'all';
  const shiftList = getShiftDatesForDoctor(selectDoc);

  if (shiftList.length === 0) {
    showToast('⚠️ エクスポート対象の勤務シフトがありません');
    return;
  }

  let icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Surgeon Shift Manager//NONSGML Shift Calendar v1.0//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:外科勤務シフト'
  ];

  shiftList.forEach((item, index) => {
    const [y, m, d] = item.dateStr.split('-').map(Number);
    const summary = `【外科勤務】${item.docNamesStr}`;
    const uid = `shift-${item.dateStr}-${index}-${Date.now()}@surgeon-shift-manager`;

    const dtStart = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}T170000`;
    const nextDate = new Date(y, m - 1, d + 1);
    const ny = nextDate.getFullYear();
    const nm = nextDate.getMonth() + 1;
    const nd = nextDate.getDate();
    const dtEnd = `${ny}${String(nm).padStart(2, '0')}${String(nd).padStart(2, '0')}T090000`;

    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:${uid}`);
    icsLines.push(`SUMMARY:${summary}`);
    icsLines.push(`DESCRIPTION:外科勤務 (${item.docNamesStr})`);
    icsLines.push(`DTSTART:${dtStart}`);
    icsLines.push(`DTEND:${dtEnd}`);
    icsLines.push('END:VEVENT');
  });

  icsLines.push('END:VCALENDAR');

  const icsContent = icsLines.join('\r\n');
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const docNameLabel = selectDoc === 'all' ? '全員' : (getDoctorById(selectDoc)?.name || '勤務医');
  const filename = `外科勤務シフト_${state.currentYear}年${state.currentMonth + 1}月_${docNameLabel}.ics`;

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast('📅 .ics ファイルをダウンロードしました！');
}

function copyGcalText() {
  const selectDoc = document.getElementById('gcal-doctor-select')?.value || 'all';
  const shiftList = getShiftDatesForDoctor(selectDoc);

  if (shiftList.length === 0) {
    showToast('⚠️ 対象の勤務シフトがありません');
    return;
  }

  const docNameLabel = selectDoc === 'all' ? '全体' : (getDoctorById(selectDoc)?.name || '');
  
  let text = `【外科勤務予定 (${docNameLabel}) - ${state.currentYear}年${state.currentMonth + 1}月】\n\n`;

  shiftList.forEach(item => {
    const [, m, d] = item.dateStr.split('-').map(Number);
    text += `・${m}/${d}(${item.dayOfWeek}) 17:00〜翌09:00 : ${item.docNamesStr}\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast('📋 勤務予定テキストをクリップボードにコピーしました！');
  }).catch(() => {
    prompt('以下のテキストをコピーしてください:', text);
  });
}
