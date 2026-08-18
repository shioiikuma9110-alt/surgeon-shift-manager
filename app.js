// 外科医 夜勤シフトスマート決定システム - Core Logic (app.js)

// 4人の医師データ定義（デフォルト）
let doctors = [
  { id: 'doc_1', name: '佐々木 医師', color: '#38bdf8' }, // Aqua / Blue
  { id: 'doc_2', name: '田中 医師',   color: '#10b981' }, // Emerald Green
  { id: 'doc_3', name: '鈴木 医師',   color: '#f59e0b' }, // Amber / Yellow
  { id: 'doc_4', name: '高橋 医師',   color: '#a855f7' }  // Purple
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
  loadLocalStorage();
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

// LocalStorageの読み込み
function loadLocalStorage() {
  try {
    const savedDocs = localStorage.getItem('surg_shift_doctors');
    if (savedDocs) doctors = JSON.parse(savedDocs);

    const savedState = localStorage.getItem('surg_shift_state');
    if (savedState) {
      const parsed = JSON.parse(savedState);
      state.shiftData = parsed.shiftData || {};
      state.defaultRequirement = parsed.defaultRequirement || 2;
    }
  } catch (e) {
    console.error('Failed to load local storage:', e);
  }
}

function saveLocalStorage() {
  try {
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
  document.getElementById('btn-auto-generate')?.addEventListener('click', generateAutoShift);

  // 共有機能
  document.getElementById('btn-share-link')?.addEventListener('click', exportShareLink);
  document.getElementById('btn-share-text')?.addEventListener('click', exportTextShare);

  // エクスポート
  document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
  document.getElementById('btn-print')?.addEventListener('click', () => window.print());

  // モーダル関連
  document.getElementById('form-doctor-edit')?.addEventListener('submit', handleDoctorEditSubmit);
}

function setMode(newMode) {
  state.mode = newMode;
  document.getElementById('btn-mode-shift')?.classList.toggle('active', newMode === 'shift');
  document.getElementById('btn-mode-unavail')?.classList.toggle('active', newMode === 'unavail');

  const banner = document.getElementById('mode-banner');
  const bannerText = document.getElementById('mode-banner-text');

  if (banner && bannerText) {
    if (newMode === 'shift') {
      banner.className = 'mode-banner shift-mode';
      bannerText.innerText = '【シフト作成モード】カレンダー内の医師バッジをクリックするだけで、ワンクリックで夜勤を決定・変更できます。';
    } else {
      banner.className = 'mode-banner unavail-mode';
      const docName = getDoctorById(state.selectedDoctorForUnavail)?.name || '';
      bannerText.innerText = `【不可日（希望休）登録モード】左側で選択中の「${docName}」が入れない日をカレンダー上でクリックしてください。`;
    }
  }

  renderSidebarDoctors();
  renderCalendar();
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

function getDoctorById(id) {
  return doctors.find(d => d.id === id);
}

// ----------------------------------------------------
// メインレンダリング
// ----------------------------------------------------
function renderApp() {
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
        <span class="stat-counts">当直 <strong>${s.total}</strong>回 (平日${s.weekday} / 休日${s.weekend})</span>
      </div>
      <div class="stat-bar-container">
        <div class="stat-bar" style="width: ${percentage}%; background: ${doc.color};"></div>
      </div>
    `;
    container.appendChild(row);
  });
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
    const isToday = (today.getFullYear() === year && today.getMonth() === month && today.getDate() === d);

    const dayData = monthData.days[dateStr] || { requirement: 2, assigned: [], unavailable: {} };
    const reqCount = dayData.requirement || 2;
    const assignedCount = dayData.assigned ? dayData.assigned.length : 0;

    const cell = document.createElement('div');
    cell.className = `day-cell ${isSun ? 'is-sun' : ''} ${isSat ? 'is-sat' : ''} ${isSat || isSun ? 'is-weekend' : ''} ${isToday ? 'is-today' : ''}`;

    // 日付ヘッダー
    const header = document.createElement('div');
    header.className = 'day-header';

    const dayNum = document.createElement('span');
    dayNum.className = 'day-number';
    dayNum.innerText = d;

    header.appendChild(dayNum);
    cell.appendChild(header);

    // 医師チップコンテナ
    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'day-doctors-chips';

    doctors.forEach(doc => {
      const isAssigned = dayData.assigned && dayData.assigned.includes(doc.id);
      const isUnavail = dayData.unavailable && dayData.unavailable[doc.id];

      const chip = document.createElement('div');
      chip.className = `doctor-chip ${isAssigned ? 'assigned' : 'unassigned'} ${isUnavail ? 'unavailable-flag' : ''}`;

      if (isAssigned) {
        chip.style.backgroundColor = doc.color;
        chip.style.borderColor = doc.color;
      }

      let statusBadge = '';
      if (isUnavail) {
        statusBadge = '<span class="status-badge">休み</span>';
      }

      chip.innerHTML = `
        <span>${doc.name}</span>
        ${statusBadge || (isAssigned ? '<i data-lucide="check" style="width:12px;height:12px;"></i>' : '')}
      `;

      // チップまたはセルのクリック処理
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDoctorChipClick(dateStr, doc.id);
      });

      chipsContainer.appendChild(chip);
    });

    cell.appendChild(chipsContainer);

    // 日付セル自体のクリック（不可日モード時など）
    cell.addEventListener('click', () => {
      if (state.mode === 'unavail') {
        toggleDoctorUnavail(dateStr, state.selectedDoctorForUnavail);
      }
    });

    // シンプルな当直人数フッター
    if (assignedCount > 0) {
      const footer = document.createElement('div');
      footer.className = 'day-footer';
      footer.innerHTML = `
        <span class="count-indicator ok">
          当直 ${assignedCount}名
        </span>
      `;
      cell.appendChild(footer);
    }

    grid.appendChild(cell);
  }
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

// 医師チップワンクリックトグル
function handleDoctorChipClick(dateStr, docId) {
  if (state.mode === 'unavail') {
    toggleDoctorUnavail(dateStr, docId);
    return;
  }

  // シフト作成モード
  const monthData = ensureMonthData();
  const day = monthData.days[dateStr];
  if (!day) return;

  if (!day.assigned) day.assigned = [];

  const idx = day.assigned.indexOf(docId);
  if (idx > -1) {
    // 割り当て解除
    day.assigned.splice(idx, 1);
  } else {
    // 割り当て追加
    day.assigned.push(docId);
  }

  saveLocalStorage();
  renderApp();
}

// 不可日（希望休）トグル
function toggleDoctorUnavail(dateStr, docId) {
  const monthData = ensureMonthData();
  const day = monthData.days[dateStr];
  if (!day) return;

  if (!day.unavailable) day.unavailable = {};
  day.unavailable[docId] = !day.unavailable[docId];

  // 不可日に設定された場合、すでに当直に入っていれば自動解除
  if (day.unavailable[docId] && day.assigned) {
    const idx = day.assigned.indexOf(docId);
    if (idx > -1) day.assigned.splice(idx, 1);
  }

  saveLocalStorage();
  renderApp();
}

// ----------------------------------------------------
// スマート自動シフト生成アルゴリズム (1クリック自動生成)
// ----------------------------------------------------
function generateAutoShift() {
  const year = state.currentYear;
  const month = state.currentMonth;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthData = ensureMonthData(year, month);

  // 各医師の当直カウントを追跡
  const doctorStats = {};
  doctors.forEach(d => {
    doctorStats[d.id] = { total: 0, weekend: 0, lastAssignedDay: -99 };
  });

  // 日付順に生成
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDateKey(year, month, d);
    const dayData = monthData.days[dateStr];
    const req = dayData.requirement || state.defaultRequirement;
    const dateObj = new Date(year, month, d);
    const isWeekend = (dateObj.getDay() === 0 || dateObj.getDay() === 6);

    // 候補となる医師をフィルタリング
    // 条件1: 不可日（希望休）でない
    // 条件2: 前日（d-1）に夜勤に入っていない（連当防止）
    let candidates = doctors.filter(doc => {
      const isUnavail = dayData.unavailable && dayData.unavailable[doc.id];
      const workedYesterday = (doctorStats[doc.id].lastAssignedDay === d - 1);
      return !isUnavail && !workedYesterday;
    });

    // 候補が足りない場合のフォールバック（不可日を最優先順位として守り、連当解禁）
    if (candidates.length < req) {
      candidates = doctors.filter(doc => {
        return !(dayData.unavailable && dayData.unavailable[doc.id]);
      });
    }

    // 候補者をソート（当直数が少ない医師、週末当直数が少ない医師を優先）
    candidates.sort((a, b) => {
      const statA = doctorStats[a.id];
      const statB = doctorStats[b.id];

      if (isWeekend) {
        if (statA.weekend !== statB.weekend) return statA.weekend - statB.weekend;
      }
      if (statA.total !== statB.total) return statA.total - statB.total;
      return Math.random() - 0.5; // ランダム性で均等化
    });

    // 上位 req 名を選択
    const selected = candidates.slice(0, req).map(c => c.id);
    dayData.assigned = selected;

    // 統計更新
    selected.forEach(docId => {
      doctorStats[docId].total++;
      if (isWeekend) doctorStats[docId].weekend++;
      doctorStats[docId].lastAssignedDay = d;
    });
  }

  saveLocalStorage();
  renderApp();

  showToast('✨ シフトを自動生成しました！公平な回数配分と連当回避を計算済みです。');
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
  const name = document.getElementById('edit-doc-name').value.trim();
  const color = document.getElementById('edit-doc-color').value;

  const doc = getDoctorById(id);
  if (doc && name) {
    doc.name = name;
    doc.color = color;
    saveLocalStorage();
    closeDoctorModal();
    renderApp();
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

  let csvContent = "\uFEFF日付,曜日,必要当直人数,担当医師1,担当医師2,担当医師3,不可日設定医師\n";

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
  link.setAttribute('download', `外科当直シフト_${year}年${month + 1}月.csv`);
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

  let text = `【外科夜勤当直シフト 🏥 ${year}年${month + 1}月】\n\n`;

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
