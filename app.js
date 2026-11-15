/**
 * ============================================================================
 * SAKUTRACK - CLIENT LOGIC & GOOGLE SHEETS INTEGRATION
 * ============================================================================
 * TEMPAT MENEMPELKAN URL WEB APP GOOGLE APPS SCRIPT ANDA:
 * Setelah melakukan 'Deploy as Web App' di Apps Script, salin URL-nya ke sini:
 */
const SCRIPT_URL = "URL_WEB_APP_ANDA"; // <--- TEMPELKAN URL DI SINI (atau atur via menu Pengaturan di aplikasi)

/**
 * ============================================================================
 * DEFINISI KATEGORI (Konteks Pelajar SMA & Sesuai Permintaan)
 * ============================================================================
 */
const CATEGORIES = {
  Pengeluaran: [
    "Kebutuhan (Parkir, Kas/Urunan)",
    "Keinginan (Jajan, Hiburan)",
    "Sosial & Keagamaan",
    "Transportasi",
    "Lainnya"
  ],
  Pemasukan: [
    "Uang Saku (Harian/Mingguan)",
    "Hasil Jualan / Jasa",
    "Bonus / Hadiah",
    "Pendapatan Tak Terduga",
    "Lainnya"
  ]
};

// Data Dummy Awal untuk Pelajar SMA jika SCRIPT_URL belum dikonfigurasi
const INITIAL_DEMO_DATA = [
  {
    id: "TRX-202611-1001",
    tanggal: getFormattedDate(0), // Hari ini
    kategori: "Keinginan (Jajan, Hiburan)",
    uraian: "Beli es teh & batagor di kantin",
    nominalKeluar: 15000,
    nominalMasuk: 0,
    jenis: "Pengeluaran",
    nominal: 15000
  },
  {
    id: "TRX-202611-1002",
    tanggal: getFormattedDate(0), // Hari ini
    kategori: "Kebutuhan (Parkir, Kas/Urunan)",
    uraian: "Bayar uang kas kelas mingguan",
    nominalKeluar: 10000,
    nominalMasuk: 0,
    jenis: "Pengeluaran",
    nominal: 10000
  },
  {
    id: "TRX-202611-1003",
    tanggal: getFormattedDate(-1), // Kemarin
    kategori: "Transportasi",
    uraian: "Isi bensin motor",
    nominalKeluar: 25000,
    nominalMasuk: 0,
    jenis: "Pengeluaran",
    nominal: 25000
  },
  {
    id: "TRX-202611-1004",
    tanggal: getFormattedDate(-2), // 2 hari lalu
    kategori: "Uang Saku (Harian/Mingguan)",
    uraian: "Uang saku mingguan dari orang tua",
    nominalKeluar: 0,
    nominalMasuk: 200000,
    jenis: "Pemasukan",
    nominal: 200000
  },
  {
    id: "TRX-202611-1005",
    tanggal: getFormattedDate(-4),
    kategori: "Hasil Jualan / Jasa",
    uraian: "Jual pulsa ke teman sekelas",
    nominalKeluar: 0,
    nominalMasuk: 50000,
    jenis: "Pemasukan",
    nominal: 50000
  },
  {
    id: "TRX-202611-1006",
    tanggal: getFormattedDate(-5),
    kategori: "Sosial & Keagamaan",
    uraian: "Infaq Jumat di sekolah",
    nominalKeluar: 5000,
    nominalMasuk: 0,
    jenis: "Pengeluaran",
    nominal: 5000
  }
];

// Helper: Menghasilkan tanggal DD/MM/YYYY relatif hari ini
function getFormattedDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * ============================================================================
 * STATE MANAJEMEN APLIKASI
 * ============================================================================
 */
const AppState = {
  transactions: [],
  activePeriod: "month", // "today", "week", "month", "all", "custom"
  customRange: { start: null, end: null },
  activeTypeFilter: "all", // "all", "Pengeluaran", "Pemasukan"
  searchQuery: "",
  currentTransactionType: "Pengeluaran",
  activeView: "dashboard",
  isDemoMode: false,
  deleteTargetId: null,
  donutChartInstance: null,
  barChartInstance: null,
  deferredPwaPrompt: null
};

/**
 * ============================================================================
 * INISIALISASI APLIKASI
 * ============================================================================
 */
document.addEventListener("DOMContentLoaded", () => {
  // Inisialisasi ikon Lucide
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Cek konfigurasi Script URL di localStorage atau variabel SCRIPT_URL
  initConnectionSettings();

  // Siapkan Form Input Transaksi
  setupTransactionForm();

  // Siapkan Event Listeners Navigasi & Filter
  setupNavigationAndFilters();

  // Daftarkan Service Worker untuk PWA
  registerServiceWorker();

  // Muat Data Transaksi
  fetchTransactions();
});

/**
 * ============================================================================
 * KONFIGURASI KONEKSI GOOGLE SHEETS & MODE DEMO
 * ============================================================================
 */
function getActiveScriptUrl() {
  const storedUrl = localStorage.getItem("FINTRACK_SCRIPT_URL");
  if (storedUrl && storedUrl.trim() !== "") {
    return storedUrl.trim();
  }
  if (SCRIPT_URL && SCRIPT_URL !== "URL_WEB_APP_ANDA" && SCRIPT_URL.trim() !== "") {
    return SCRIPT_URL.trim();
  }
  return "";
}

function initConnectionSettings() {
  const activeUrl = getActiveScriptUrl();
  const statusText = document.getElementById("statusText");
  const connectionStatus = document.getElementById("connectionStatus");
  const settingScriptUrl = document.getElementById("settingScriptUrl");
  const settingDemoMode = document.getElementById("settingDemoMode");

  if (settingScriptUrl) settingScriptUrl.value = activeUrl;

  const forcedDemo = localStorage.getItem("FINTRACK_DEMO_MODE") === "true";

  if (!activeUrl || forcedDemo) {
    AppState.isDemoMode = true;
    if (settingDemoMode) settingDemoMode.checked = true;
    statusText.textContent = "Mode Uji Coba (Lokal)";
    connectionStatus.querySelector("span:first-child").className = "inline-block w-2 h-2 rounded-full bg-amber-500";
  } else {
    AppState.isDemoMode = false;
    if (settingDemoMode) settingDemoMode.checked = false;
    statusText.textContent = "Tersambung Google Sheets";
    connectionStatus.querySelector("span:first-child").className = "inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
  }
}

/**
 * ============================================================================
 * DATA FETCHING & SYNC (READ DARI GOOGLE APPS SCRIPT)
 * ============================================================================
 */
async function fetchTransactions(showToastNotification = false) {
  const refreshIcon = document.getElementById("refreshIcon");
  if (refreshIcon) refreshIcon.classList.add("animate-spin");

  const activeUrl = getActiveScriptUrl();

  if (AppState.isDemoMode || !activeUrl) {
    // Gunakan data dari LocalStorage jika ada, atau INITIAL_DEMO_DATA
    const savedLocal = localStorage.getItem("FINTRACK_LOCAL_DATA");
    if (savedLocal) {
      try {
        AppState.transactions = JSON.parse(savedLocal);
      } catch (e) {
        AppState.transactions = [...INITIAL_DEMO_DATA];
      }
    } else {
      AppState.transactions = [...INITIAL_DEMO_DATA];
      localStorage.setItem("FINTRACK_LOCAL_DATA", JSON.stringify(AppState.transactions));
    }

    setTimeout(() => {
      if (refreshIcon) refreshIcon.classList.remove("animate-spin");
      renderAllViews();
      if (showToastNotification) {
        showToast("Data demo lokal disegarkan!", "info");
      }
    }, 350);
    return;
  }

  try {
    const response = await fetch(`${activeUrl}?action=getAll`, {
      method: "GET",
      mode: "cors"
    });

    if (!response.ok) throw new Error("Gagal mengambil data dari Google Sheets");

    const result = await response.json();
    if (result.status === "success") {
      AppState.transactions = result.data || [];
      renderAllViews();
      if (showToastNotification) {
        showToast("Data transaksi Google Sheets berhasil diperbarui!", "success");
      }
    } else {
      throw new Error(result.message || "Respon gagal");
    }
  } catch (error) {
    console.warn("Gagal terhubung ke Google Sheets, menggunakan cadangan lokal:", error);
    showToast("Koneksi gagal, beralih ke data lokal.", "error");

    // Fallback ke data tersimpan lokal
    const savedLocal = localStorage.getItem("FINTRACK_LOCAL_DATA");
    AppState.transactions = savedLocal ? JSON.parse(savedLocal) : [...INITIAL_DEMO_DATA];
    renderAllViews();
  } finally {
    if (refreshIcon) refreshIcon.classList.remove("animate-spin");
  }
}

/**
 * ============================================================================
 * INPUT FORM LOGIC (TOGGLE, QUICK NOMINAL, SUBMIT)
 * ============================================================================
 */
function setupTransactionForm() {
  const toggleExpense = document.getElementById("toggleExpense");
  const toggleIncome = document.getElementById("toggleIncome");
  const selectCategory = document.getElementById("selectCategory");
  const inputNominal = document.getElementById("inputNominal");
  const inputDate = document.getElementById("inputDate");
  const formTransaction = document.getElementById("formTransaction");

  // Set default date ke hari ini (YYYY-MM-DD)
  const today = new Date().toISOString().split("T")[0];
  if (inputDate) inputDate.value = today;

  // Render kategori awal (Pengeluaran)
  updateCategoryDropdown("Pengeluaran");

  // Toggle Type Event
  toggleExpense.addEventListener("click", () => {
    AppState.currentTransactionType = "Pengeluaran";
    toggleExpense.className = "flex-1 py-2.5 rounded-xl bg-rose-500 text-white shadow-sm flex items-center justify-center gap-1.5 transition-all";
    toggleIncome.className = "flex-1 py-2.5 rounded-xl text-slate-500 hover:text-slate-700 flex items-center justify-center gap-1.5 transition-all";
    updateCategoryDropdown("Pengeluaran");
  });

  toggleIncome.addEventListener("click", () => {
    AppState.currentTransactionType = "Pemasukan";
    toggleIncome.className = "flex-1 py-2.5 rounded-xl bg-emerald-500 text-white shadow-sm flex items-center justify-center gap-1.5 transition-all";
    toggleExpense.className = "flex-1 py-2.5 rounded-xl text-slate-500 hover:text-slate-700 flex items-center justify-center gap-1.5 transition-all";
    updateCategoryDropdown("Pemasukan");
  });

  // Auto-format input nominal dengan pemisah ribuan saat mengetik
  inputNominal.addEventListener("input", (e) => {
    const rawVal = e.target.value.replace(/\D/g, "");
    if (!rawVal) {
      e.target.value = "";
      return;
    }
    e.target.value = new Intl.NumberFormat("id-ID").format(parseInt(rawVal, 10));
  });

  // Quick Nominal Helper Buttons (+5rb, +10rb, dst.)
  document.querySelectorAll("[data-add-nominal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const addAmount = parseInt(btn.getAttribute("data-add-nominal"), 10);
      const currentVal = parseInt(inputNominal.value.replace(/\D/g, "") || "0", 10);
      const newVal = currentVal + addAmount;
      inputNominal.value = new Intl.NumberFormat("id-ID").format(newVal);
      // Animasi getar halus tombol
      btn.classList.add("scale-95");
      setTimeout(() => btn.classList.remove("scale-95"), 150);
    });
  });

  // Form Submit Handler
  formTransaction.addEventListener("submit", handleFormSubmit);
}

function updateCategoryDropdown(type, selectedCategory = null) {
  const selectCategory = document.getElementById("selectCategory");
  if (!selectCategory) return;

  const categories = CATEGORIES[type] || [];
  selectCategory.innerHTML = categories.map((cat) => {
    const isSelected = selectedCategory === cat ? "selected" : "";
    return `<option value="${cat}" ${isSelected}>${cat}</option>`;
  }).join("");
}

/**
 * ============================================================================
 * FORM SUBMIT HANDLER (CREATE / UPDATE TRANSAKSI)
 * ============================================================================
 */
async function handleFormSubmit(e) {
  e.preventDefault();

  const editId = document.getElementById("editTransactionId").value;
  const inputNominal = document.getElementById("inputNominal");
  const inputDate = document.getElementById("inputDate");
  const selectCategory = document.getElementById("selectCategory");
  const inputNotes = document.getElementById("inputNotes");
  const btnSubmit = document.getElementById("btnSubmitTransaction");
  const btnSubmitText = document.getElementById("btnSubmitText");

  // Validasi Nominal
  const cleanNominal = parseInt(inputNominal.value.replace(/\D/g, "") || "0", 10);
  if (!cleanNominal || cleanNominal <= 0) {
    showToast("Nominal transaksi harus lebih dari Rp 0!", "error");
    inputNominal.focus();
    return;
  }

  // Format tanggal ke DD/MM/YYYY
  const dateVal = inputDate.value; // YYYY-MM-DD
  let formattedDMY = "";
  if (dateVal) {
    const [y, m, d] = dateVal.split("-");
    formattedDMY = `${d}/${m}/${y}`;
  } else {
    formattedDMY = getFormattedDate(0);
  }

  const payload = {
    action: editId ? "update" : "create",
    id: editId || `TRX-${Date.now().toString(36).toUpperCase()}`,
    tanggal: formattedDMY,
    kategori: selectCategory.value,
    uraian: inputNotes.value.trim() || "-",
    jenis: AppState.currentTransactionType,
    nominal: cleanNominal,
    nominalKeluar: AppState.currentTransactionType === "Pengeluaran" ? cleanNominal : 0,
    nominalMasuk: AppState.currentTransactionType === "Pemasukan" ? cleanNominal : 0
  };

  // State loading button
  btnSubmit.disabled = true;
  btnSubmitText.innerHTML = `<span class="inline-block animate-spin mr-1">⏳</span> Menyimpan...`;

  const activeUrl = getActiveScriptUrl();

  if (AppState.isDemoMode || !activeUrl) {
    // Simpan ke local mock
    setTimeout(() => {
      if (editId) {
        const index = AppState.transactions.findIndex((t) => t.id === editId);
        if (index !== -1) AppState.transactions[index] = payload;
        showToast("Transaksi berhasil diperbarui!", "success");
      } else {
        AppState.transactions.unshift(payload);
        showToast("Transaksi berhasil dicatat!", "success");
      }

      localStorage.setItem("FINTRACK_LOCAL_DATA", JSON.stringify(AppState.transactions));
      closeAddModal();
      renderAllViews();
      resetForm();
      btnSubmit.disabled = false;
      btnSubmitText.textContent = "Simpan Transaksi (< 10 Detik)";
    }, 400);
    return;
  }

  // Kirim ke Google Apps Script Web App
  try {
    const response = await fetch(activeUrl, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (result.status === "success") {
      showToast(result.message || "Transaksi berhasil disimpan!", "success");
      closeAddModal();
      resetForm();
      fetchTransactions();
    } else {
      throw new Error(result.message || "Gagal menyimpan ke Google Sheets");
    }
  } catch (err) {
    console.error("Gagal mengirim ke Apps Script:", err);
    // Simpan fallback ke lokal agar data pengguna tidak hilang
    if (!editId) AppState.transactions.unshift(payload);
    localStorage.setItem("FINTRACK_LOCAL_DATA", JSON.stringify(AppState.transactions));
    renderAllViews();
    closeAddModal();
    resetForm();
    showToast("Tersimpan secara lokal (koneksi Sheets terhambat).", "info");
  } finally {
    btnSubmit.disabled = false;
    btnSubmitText.textContent = "Simpan Transaksi (< 10 Detik)";
  }
}

function resetForm() {
  document.getElementById("editTransactionId").value = "";
  document.getElementById("inputNominal").value = "";
  document.getElementById("inputNotes").value = "";
  document.getElementById("inputDate").value = new Date().toISOString().split("T")[0];
  document.getElementById("modalTitle").textContent = "Catat Transaksi Cepat";
  document.getElementById("btnSubmitText").textContent = "Simpan Transaksi (< 10 Detik)";
}

/**
 * ============================================================================
 * EDIT & DELETE HANDLERS
 * ============================================================================
 */
function openEditTransaction(id) {
  const tx = AppState.transactions.find((t) => t.id === id);
  if (!tx) return;

  document.getElementById("editTransactionId").value = tx.id;
  document.getElementById("modalTitle").textContent = "Edit Transaksi";
  document.getElementById("btnSubmitText").textContent = "Simpan Perubahan";

  // Set jenis
  if (tx.jenis === "Pemasukan") {
    document.getElementById("toggleIncome").click();
  } else {
    document.getElementById("toggleExpense").click();
  }

  // Set nominal
  document.getElementById("inputNominal").value = new Intl.NumberFormat("id-ID").format(tx.nominal);

  // Set kategori
  updateCategoryDropdown(tx.jenis, tx.kategori);

  // Set tanggal
  if (tx.tanggal) {
    if (tx.tanggal.includes("/")) {
      const [d, m, y] = tx.tanggal.split("/");
      document.getElementById("inputDate").value = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    } else if (tx.tanggal.includes("-")) {
      document.getElementById("inputDate").value = tx.tanggal;
    }
  }

  // Set uraian
  document.getElementById("inputNotes").value = tx.uraian === "-" ? "" : tx.uraian;

  openAddModal();
}

function promptDeleteTransaction(id) {
  AppState.deleteTargetId = id;
  const modalDelete = document.getElementById("modalDeleteConfirm");
  if (modalDelete) modalDelete.classList.remove("hidden");
}

async function executeDeleteTransaction() {
  const targetId = AppState.deleteTargetId;
  if (!targetId) return;

  const btnDelete = document.getElementById("btnConfirmDelete");
  const btnDeleteText = document.getElementById("btnDeleteText");
  btnDelete.disabled = true;
  btnDeleteText.innerHTML = `<span class="inline-block animate-spin mr-1">⏳</span> Menghapus...`;

  const activeUrl = getActiveScriptUrl();

  if (AppState.isDemoMode || !activeUrl) {
    setTimeout(() => {
      AppState.transactions = AppState.transactions.filter((t) => t.id !== targetId);
      localStorage.setItem("FINTRACK_LOCAL_DATA", JSON.stringify(AppState.transactions));
      closeDeleteModal();
      renderAllViews();
      showToast("Transaksi berhasil dihapus!", "success");
      btnDelete.disabled = false;
      btnDeleteText.textContent = "Ya, Hapus";
    }, 300);
    return;
  }

  try {
    const response = await fetch(activeUrl, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "delete", id: targetId })
    });

    const result = await response.json();
    if (result.status === "success") {
      showToast("Transaksi berhasil dihapus dari Google Sheets", "success");
      closeDeleteModal();
      fetchTransactions();
    } else {
      throw new Error(result.message || "Gagal menghapus baris");
    }
  } catch (error) {
    console.error("Gagal menghapus:", error);
    showToast("Gagal menghapus dari Google Sheets", "error");
  } finally {
    btnDelete.disabled = false;
    btnDeleteText.textContent = "Ya, Hapus";
  }
}

function closeDeleteModal() {
  AppState.deleteTargetId = null;
  const modalDelete = document.getElementById("modalDeleteConfirm");
  if (modalDelete) modalDelete.classList.add("hidden");
}

/**
 * ============================================================================
 * FILTER & KALKULASI DATA
 * ============================================================================
 */
function getFilteredTransactions() {
  const { transactions, activePeriod, customRange, activeTypeFilter, searchQuery } = AppState;

  const now = new Date();
  const todayStr = getFormattedDate(0);

  return transactions.filter((tx) => {
    // 1. Filter Jenis (Semua / Pengeluaran / Pemasukan)
    if (activeTypeFilter !== "all" && tx.jenis !== activeTypeFilter) {
      return false;
    }

    // 2. Filter Search Uraian atau Kategori
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchUraian = (tx.uraian || "").toLowerCase().includes(q);
      const matchKategori = (tx.kategori || "").toLowerCase().includes(q);
      if (!matchUraian && !matchKategori) return false;
    }

    // 3. Filter Periode Tanggal
    const txDate = parseDMYDate(tx.tanggal);
    if (!txDate) return true;

    if (activePeriod === "today") {
      return tx.tanggal === todayStr;
    } else if (activePeriod === "week") {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(now.getDate() - 7);
      return txDate >= oneWeekAgo && txDate <= now;
    } else if (activePeriod === "month") {
      return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
    } else if (activePeriod === "custom") {
      if (customRange.start && customRange.end) {
        const start = new Date(customRange.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(customRange.end);
        end.setHours(23, 59, 59, 999);
        return txDate >= start && txDate <= end;
      }
    }

    return true; // "all"
  });
}

function parseDMYDate(dmyStr) {
  if (!dmyStr) return null;
  if (typeof dmyStr === "string" && dmyStr.includes("/")) {
    const [d, m, y] = dmyStr.split("/");
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  }
  return new Date(dmyStr);
}

/**
 * ============================================================================
 * RENDERING UI & VIEWS
 * ============================================================================
 */
function renderAllViews() {
  const filtered = getFilteredTransactions();

  // Hitung summary
  let totalIncome = 0;
  let totalExpense = 0;
  const expenseByCategory = {};

  filtered.forEach((tx) => {
    const nominal = Number(tx.nominal) || 0;
    if (tx.jenis === "Pemasukan") {
      totalIncome += nominal;
    } else {
      totalExpense += nominal;
      const cat = tx.kategori || "Lainnya";
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + nominal;
    }
  });

  const netBalance = totalIncome - totalExpense;

  // Render Dashboard Cards
  document.getElementById("totalNetBalance").textContent = formatRupiah(netBalance);
  document.getElementById("totalIncome").textContent = formatRupiah(totalIncome);
  document.getElementById("totalExpense").textContent = formatRupiah(totalExpense);
  document.getElementById("chartTotalLabel").textContent = formatRupiah(totalExpense);

  // Render Smart Insights
  renderSmartInsights(totalExpense, totalIncome, expenseByCategory);

  // Render Visualisasi Chart.js
  renderCharts(expenseByCategory, totalIncome, totalExpense);

  // Render Transaksi Terbaru (Dashboard)
  renderRecentTransactions(filtered.slice(0, 5));

  // Render Riwayat Transaksi Lengkap
  renderFullHistory(filtered);

  // Render Breakdown Kategori (Tab Statistik)
  renderCategoryBreakdown(expenseByCategory, totalExpense);

  // Refresh ikon Lucide
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderSmartInsights(totalExpense, totalIncome, expenseByCategory) {
  const topExpenseCategoryEl = document.getElementById("topExpenseCategory");
  const topExpensePercentEl = document.getElementById("topExpensePercent");
  const dailyAvgExpenseEl = document.getElementById("dailyAvgExpense");
  const savingHealthLabel = document.getElementById("savingHealthLabel");

  const categories = Object.keys(expenseByCategory);
  if (categories.length === 0 || totalExpense === 0) {
    topExpenseCategoryEl.textContent = "-";
    topExpensePercentEl.textContent = "Belum ada pengeluaran";
    dailyAvgExpenseEl.textContent = "Rp 0";
    savingHealthLabel.textContent = "Tidak ada pengeluaran";
    return;
  }

  // Cari kategori terbesar
  let topCat = categories[0];
  let maxAmount = expenseByCategory[topCat];
  categories.forEach((cat) => {
    if (expenseByCategory[cat] > maxAmount) {
      topCat = cat;
      maxAmount = expenseByCategory[cat];
    }
  });

  const percent = Math.round((maxAmount / totalExpense) * 100);
  topExpenseCategoryEl.textContent = topCat;
  topExpensePercentEl.textContent = `${percent}% dari total (${formatRupiah(maxAmount)})`;

  // Rata-rata harian (sesuai hari berjalan dalam bulan atau 30 hari)
  const currentDay = new Date().getDate();
  const avg = Math.round(totalExpense / Math.max(1, currentDay));
  dailyAvgExpenseEl.textContent = `${formatRupiah(avg)} / hari`;

  // Status kesehatan keuangan
  if (totalIncome === 0 && totalExpense > 0) {
    savingHealthLabel.textContent = "Hati-hati pengeluaran tanpa pemasukan";
    savingHealthLabel.className = "text-[11px] text-amber-600 font-medium mt-0.5 truncate";
  } else {
    const expenseRatio = (totalExpense / totalIncome) * 100;
    if (expenseRatio <= 60) {
      savingHealthLabel.textContent = `Sangat Sehat (Sisa ${100 - Math.round(expenseRatio)}% saldo)`;
      savingHealthLabel.className = "text-[11px] text-emerald-600 font-medium mt-0.5 truncate";
    } else if (expenseRatio <= 90) {
      savingHealthLabel.textContent = "Cukup Sehat (Mendekati limit)";
      savingHealthLabel.className = "text-[11px] text-sky-600 font-medium mt-0.5 truncate";
    } else {
      savingHealthLabel.textContent = "Boros (Pengeluaran > 90%!)";
      savingHealthLabel.className = "text-[11px] text-rose-600 font-bold mt-0.5 truncate";
    }
  }
}

/**
 * ============================================================================
 * RENDER CHART.JS VISUALISASI
 * ============================================================================
 */
function renderCharts(expenseByCategory, totalIncome, totalExpense) {
  // 1. DONUT CHART (Pengeluaran per Kategori)
  const donutCanvas = document.getElementById("categoryDonutChart");
  const chartEmptyState = document.getElementById("chartEmptyState");
  if (!donutCanvas) return;

  const categories = Object.keys(expenseByCategory);
  const amounts = Object.values(expenseByCategory);

  if (categories.length === 0 || totalExpense === 0) {
    donutCanvas.classList.add("hidden");
    if (chartEmptyState) chartEmptyState.classList.remove("hidden");
    if (AppState.donutChartInstance) {
      AppState.donutChartInstance.destroy();
      AppState.donutChartInstance = null;
    }
  } else {
    donutCanvas.classList.remove("hidden");
    if (chartEmptyState) chartEmptyState.classList.add("hidden");

    const palette = [
      "#F43F5E", // Rose
      "#0EA5E9", // Sky
      "#10B981", // Emerald
      "#F59E0B", // Amber
      "#8B5CF6", // Violet
      "#EC4899", // Pink
      "#64748B"  // Slate
    ];

    if (AppState.donutChartInstance) {
      AppState.donutChartInstance.destroy();
    }

    AppState.donutChartInstance = new Chart(donutCanvas, {
      type: "doughnut",
      data: {
        labels: categories,
        datasets: [{
          data: amounts,
          backgroundColor: palette.slice(0, categories.length),
          borderWidth: 2,
          borderColor: "#FFFFFF",
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              font: { size: 10, family: "'Plus Jakarta Sans', sans-serif", weight: "600" },
              padding: 12,
              color: "#475569"
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const val = context.raw || 0;
                const pct = Math.round((val / totalExpense) * 100);
                return ` ${context.label}: ${formatRupiah(val)} (${pct}%)`;
              }
            }
          }
        },
        cutout: "68%"
      }
    });
  }

  // 2. BAR CHART (Pemasukan vs Pengeluaran di Tab Statistik)
  const barCanvas = document.getElementById("incomeExpenseBarChart");
  if (!barCanvas) return;

  if (AppState.barChartInstance) {
    AppState.barChartInstance.destroy();
  }

  AppState.barChartInstance = new Chart(barCanvas, {
    type: "bar",
    data: {
      labels: ["Pemasukan", "Pengeluaran"],
      datasets: [{
        data: [totalIncome, totalExpense],
        backgroundColor: ["rgba(16, 185, 129, 0.85)", "rgba(244, 63, 94, 0.85)"],
        borderRadius: 12,
        borderWidth: 0,
        barThickness: 40
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Nominal: ${formatRupiah(ctx.raw)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 10 },
            callback: (val) => "Rp " + (val >= 1000 ? (val / 1000) + "k" : val)
          },
          grid: { color: "rgba(241, 245, 249, 1)" }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 11, weight: "bold" } }
        }
      }
    }
  });
}

/**
 * ============================================================================
 * RENDER TRANSAKSI LIST (RECENT & FULL HISTORY)
 * ============================================================================
 */
function renderRecentTransactions(transactions) {
  const container = document.getElementById("recentTransactionsList");
  if (!container) return;

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="py-6 text-center text-slate-400 text-xs">
        <i data-lucide="receipt" class="w-8 h-8 mx-auto mb-1 stroke-1"></i>
        <p>Belum ada transaksi di periode ini</p>
      </div>`;
    return;
  }

  container.innerHTML = transactions.map((tx) => createTransactionItemHTML(tx, false)).join("");
}

function renderFullHistory(transactions) {
  const container = document.getElementById("fullHistoryList");
  const countLabel = document.getElementById("historyCountLabel");
  if (!container) return;

  if (countLabel) countLabel.textContent = `Menampilkan ${transactions.length} transaksi`;

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400 glass-card rounded-2xl">
        <i data-lucide="search-x" class="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1"></i>
        <p class="font-semibold text-slate-600 text-xs sm:text-sm">Tidak ada transaksi ditemukan</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Coba ubah kata kunci atau periode filter</p>
      </div>`;
    return;
  }

  container.innerHTML = transactions.map((tx) => createTransactionItemHTML(tx, true)).join("");
}

function createTransactionItemHTML(tx, showActions = true) {
  const isIncome = tx.jenis === "Pemasukan";
  const badgeClass = isIncome ? "badge-income" : "badge-expense";
  const iconName = isIncome ? "arrow-down-left" : "arrow-up-right";
  const prefix = isIncome ? "+ " : "- ";
  const amountColor = isIncome ? "text-emerald-600" : "text-rose-600";
  const iconColor = isIncome ? "text-emerald-500 bg-emerald-50" : "text-rose-500 bg-rose-50";

  return `
    <div class="glass-card p-3 sm:p-3.5 rounded-2xl flex items-center justify-between gap-3 hover:border-slate-300 transition-all">
      <div class="flex items-center gap-3 min-w-0">
        <!-- Icon Badge -->
        <div class="w-10 h-10 rounded-xl ${iconColor} flex items-center justify-center flex-shrink-0 border border-slate-100">
          <i data-lucide="${iconName}" class="w-5 h-5"></i>
        </div>
        <!-- Detail Info -->
        <div class="min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-xs sm:text-sm font-bold text-slate-900 truncate">${escapeHTML(tx.kategori)}</span>
            <span class="text-[10px] px-2 py-0.5 rounded-md font-semibold ${badgeClass}">${tx.jenis}</span>
          </div>
          <p class="text-[11px] text-slate-500 truncate mt-0.5">${escapeHTML(tx.uraian || "-")}</p>
          <span class="text-[10px] text-slate-400 font-medium">${tx.tanggal}</span>
        </div>
      </div>

      <!-- Amount & Actions -->
      <div class="flex items-center gap-2 flex-shrink-0 text-right">
        <div>
          <span class="text-xs sm:text-sm font-black ${amountColor} block whitespace-nowrap">${prefix}${formatRupiah(tx.nominal)}</span>
          <span class="text-[9px] text-slate-400 block font-mono">ID: ${tx.id.slice(-6)}</span>
        </div>

        ${showActions ? `
          <div class="flex items-center gap-1 pl-1">
            <button onclick="openEditTransaction('${tx.id}')" title="Edit" class="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors">
              <i data-lucide="edit-3" class="w-4 h-4"></i>
            </button>
            <button onclick="promptDeleteTransaction('${tx.id}')" title="Hapus" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

function renderCategoryBreakdown(expenseByCategory, totalExpense) {
  const container = document.getElementById("categoryBreakdownList");
  if (!container) return;

  const categories = Object.keys(expenseByCategory);
  if (categories.length === 0 || totalExpense === 0) {
    container.innerHTML = `<p class="text-slate-400 text-center py-4 text-xs">Belum ada rincian kategori pengeluaran</p>`;
    return;
  }

  // Urutkan dari nominal pengeluaran terbesar
  categories.sort((a, b) => expenseByCategory[b] - expenseByCategory[a]);

  container.innerHTML = categories.map((cat) => {
    const amount = expenseByCategory[cat];
    const pct = Math.round((amount / totalExpense) * 100);
    return `
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="font-semibold text-slate-800">${escapeHTML(cat)}</span>
          <span class="font-bold text-slate-900">${formatRupiah(amount)} (${pct}%)</span>
        </div>
        <div class="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
          <div class="h-full bg-gradient-to-r from-sky-500 to-teal-400 rounded-full" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * ============================================================================
 * NAVIGATION, PERIOD FILTER & MODAL CONTROLLERS
 * ============================================================================
 */
function setupNavigationAndFilters() {
  // 1. Period Filter Chips
  document.querySelectorAll(".period-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".period-chip").forEach((c) => {
        c.className = "period-chip px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all whitespace-nowrap";
      });
      chip.className = "period-chip active px-3.5 py-1.5 rounded-xl bg-slate-900 text-white font-semibold shadow-sm transition-all whitespace-nowrap";

      const period = chip.getAttribute("data-period");
      AppState.activePeriod = period;

      const customPicker = document.getElementById("customRangePicker");
      if (period === "custom") {
        customPicker.classList.remove("hidden");
      } else {
        customPicker.classList.add("hidden");
        document.getElementById("activePeriodLabel").textContent = chip.textContent;
        renderAllViews();
      }
    });
  });

  // Apply Custom Date Range
  const btnApplyCustom = document.getElementById("btnApplyCustomRange");
  if (btnApplyCustom) {
    btnApplyCustom.addEventListener("click", () => {
      const start = document.getElementById("customStartDate").value;
      const end = document.getElementById("customEndDate").value;
      if (!start || !end) {
        showToast("Tentukan kedua tanggal terlebih dahulu!", "error");
        return;
      }
      AppState.customRange = { start, end };
      document.getElementById("activePeriodLabel").textContent = "Rentang Kustom";
      renderAllViews();
      showToast("Rentang tanggal diterapkan", "info");
    });
  }

  // 2. Search Input & Clear
  const searchInput = document.getElementById("searchInput");
  const btnClearSearch = document.getElementById("btnClearSearch");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      AppState.searchQuery = e.target.value;
      btnClearSearch.classList.toggle("hidden", e.target.value === "");
      renderAllViews();
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener("click", () => {
      searchInput.value = "";
      AppState.searchQuery = "";
      btnClearSearch.classList.add("hidden");
      renderAllViews();
    });
  }

  // 3. Type Filter Chips in Riwayat Tab (Semua / Pengeluaran / Pemasukan)
  document.querySelectorAll(".type-filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".type-filter-chip").forEach((c) => {
        c.className = "type-filter-chip flex-1 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all";
      });
      chip.className = "type-filter-chip flex-1 py-1.5 rounded-xl border border-slate-200 bg-slate-900 text-white font-semibold transition-all";

      AppState.activeTypeFilter = chip.getAttribute("data-type-filter");
      renderAllViews();
    });
  });

  // 4. Bottom Navigation Switching Views
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetNav = btn.getAttribute("data-nav");
      switchView(targetNav);
    });
  });

  // Quick link dari Dashboard "Lihat Semua" ke Tab Riwayat
  const btnSeeAllRecent = document.getElementById("btnSeeAllRecent");
  if (btnSeeAllRecent) {
    btnSeeAllRecent.addEventListener("click", () => switchView("history"));
  }

  // 5. Open / Close Modal Tambah Transaksi
  document.getElementById("btnOpenAddModal").addEventListener("click", () => {
    resetForm();
    openAddModal();
  });
  document.getElementById("btnCloseAddModal").addEventListener("click", closeAddModal);
  document.getElementById("modalAddBackdrop").addEventListener("click", closeAddModal);

  // 6. Modal Konfirmasi Hapus
  document.getElementById("btnCancelDelete").addEventListener("click", closeDeleteModal);
  document.getElementById("modalDeleteBackdrop").addEventListener("click", closeDeleteModal);
  document.getElementById("btnConfirmDelete").addEventListener("click", executeDeleteTransaction);

  // 7. Modal Settings & Sheet Connection
  document.getElementById("btnSettings").addEventListener("click", openSettingsModal);
  document.getElementById("btnCloseSettings").addEventListener("click", closeSettingsModal);
  document.getElementById("modalSettingsBackdrop").addEventListener("click", closeSettingsModal);
  document.getElementById("btnSaveSettings").addEventListener("click", saveSettingsConfig);

  // 8. Refresh Sync Button
  document.getElementById("btnRefresh").addEventListener("click", () => {
    fetchTransactions(true);
  });

  // 9. Ekspor CSV
  const btnExportCSV = document.getElementById("btnExportCSV");
  if (btnExportCSV) {
    btnExportCSV.addEventListener("click", exportTransactionsToCSV);
  }
}

function switchView(viewName) {
  if (viewName === "settings") {
    openSettingsModal();
    return;
  }

  AppState.activeView = viewName;

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const isTarget = btn.getAttribute("data-nav") === viewName;
    btn.className = `nav-btn flex flex-col items-center gap-1 ${isTarget ? "text-sky-600 font-semibold" : "text-slate-400 hover:text-slate-600"} transition-colors py-1`;
  });

  document.getElementById("viewDashboard").classList.toggle("hidden", viewName !== "dashboard");
  document.getElementById("viewHistory").classList.toggle("hidden", viewName !== "history");
  document.getElementById("viewStats").classList.toggle("hidden", viewName !== "stats");

  window.scrollTo({ top: 0, behavior: "smooth" });
  renderAllViews();
}

function openAddModal() {
  document.getElementById("modalAddTransaction").classList.remove("hidden");
  setTimeout(() => {
    document.getElementById("inputNominal").focus();
  }, 100);
}

function closeAddModal() {
  document.getElementById("modalAddTransaction").classList.add("hidden");
}

function openSettingsModal() {
  document.getElementById("modalSettings").classList.remove("hidden");
}

function closeSettingsModal() {
  document.getElementById("modalSettings").classList.add("hidden");
}

function saveSettingsConfig() {
  const urlVal = document.getElementById("settingScriptUrl").value.trim();
  const demoChecked = document.getElementById("settingDemoMode").checked;

  localStorage.setItem("FINTRACK_SCRIPT_URL", urlVal);
  localStorage.setItem("FINTRACK_DEMO_MODE", demoChecked ? "true" : "false");

  initConnectionSettings();
  closeSettingsModal();
  showToast("Pengaturan berhasil disimpan!", "success");
  fetchTransactions(true);
}

/**
 * ============================================================================
 * EXPORT TO CSV (Pencadangan Data)
 * ============================================================================
 */
function exportTransactionsToCSV() {
  if (AppState.transactions.length === 0) {
    showToast("Tidak ada data untuk diekspor!", "info");
    return;
  }

  // Header CSV sesuai struktur Google Sheets
  const headers = ["ID", "TANGGAL", "KATEGORI PENGELUARAN", "URAIAN PENGELUARAN", "JUMLAH UANG KELUAR", "INCOME/UANG MASUK"];
  const rows = AppState.transactions.map((tx) => [
    tx.id,
    tx.tanggal,
    `"${(tx.kategori || "").replace(/"/g, '""')}"`,
    `"${(tx.uraian || "").replace(/"/g, '""')}"`,
    tx.jenis === "Pengeluaran" ? tx.nominal : "",
    tx.jenis === "Pemasukan" ? tx.nominal : ""
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `SakuTrack_Keuangan_${new Date().toISOString().split("T")[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("File CSV berhasil diunduh!", "success");
}

/**
 * ============================================================================
 * PWA SERVICE WORKER & ADD TO HOME SCREEN PROMPT
 * ============================================================================
 */
function registerServiceWorker() {
  // Service Worker hanya aktif di http://localhost, 127.0.0.1, atau https://
  if (location.protocol === 'file:') {
    console.log("Aplikasi dibuka via file:// (mode langsung). Service Worker dinonaktifkan.");
    return;
  }
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").then(
        (reg) => console.log("Service Worker terdaftar:", reg.scope),
        (err) => console.warn("Pendaftaran Service Worker gagal:", err)
      );
    });
  }

  // Tangkap event instalasi PWA
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    AppState.deferredPwaPrompt = e;
    const banner = document.getElementById("pwaInstallBanner");
    if (banner) banner.classList.remove("hidden");

    const btnInstall = document.getElementById("btnInstallPwa");
    if (btnInstall) {
      btnInstall.addEventListener("click", async () => {
        banner.classList.add("hidden");
        AppState.deferredPwaPrompt.prompt();
        const { outcome } = await AppState.deferredPwaPrompt.userChoice;
        if (outcome === "accepted") {
          showToast("Terima kasih telah memasang SakuTrack!", "success");
        }
        AppState.deferredPwaPrompt = null;
      });
    }
  });
}

/**
 * ============================================================================
 * UTILITY HELPERS: FORMAT RUPIAH, TOAST NOTIFICATION, ESCAPE HTML
 * ============================================================================
 */
function formatRupiah(num) {
  const number = Number(num) || 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(number);
}

function showToast(message, type = "info") {
  const toastNotification = document.getElementById("toastNotification");
  const toastBox = document.getElementById("toastBox");
  const toastMessage = document.getElementById("toastMessage");
  const toastIcon = document.getElementById("toastIcon");

  if (!toastNotification || !toastBox) return;

  toastMessage.textContent = message;

  if (type === "success") {
    toastBox.className = "flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs sm:text-sm font-semibold max-w-sm border bg-emerald-500 text-white border-emerald-400";
    toastIcon.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4"></i>`;
  } else if (type === "error") {
    toastBox.className = "flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs sm:text-sm font-semibold max-w-sm border bg-rose-500 text-white border-rose-400";
    toastIcon.innerHTML = `<i data-lucide="alert-circle" class="w-4 h-4"></i>`;
  } else {
    toastBox.className = "flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs sm:text-sm font-semibold max-w-sm border bg-slate-900 text-white border-slate-800";
    toastIcon.innerHTML = `<i data-lucide="info" class="w-4 h-4"></i>`;
  }

  if (window.lucide) window.lucide.createIcons();

  toastNotification.classList.remove("hidden");

  // Hilang otomatis setelah 3 detik
  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    toastNotification.classList.add("hidden");
  }, 3000);
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
