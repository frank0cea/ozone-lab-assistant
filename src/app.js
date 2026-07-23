(function () {
  "use strict";

  const calc = window.TitrationCalc;
  const KEYS = {
    records: "titration.standardization.records.v1",
    draft: "titration.standardization.draft.v1",
    darkTimer: "titration.standardization.darkTimer.v1",
    endpointTimers: "titration.standardization.endpointTimers.v1",
  };

  const form = document.getElementById("standardizationForm");
  let records = readJson(KEYS.records, []);
  let darkTimer = readJson(KEYS.darkTimer, null);
  let endpointTimers = readJson(KEYS.endpointTimers, [null, null]);
  let sampleResults = [null, null];
  let parallelResult = null;
  let clockInterval = null;

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }

  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function byId(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[char]);
  }

  function number(value) { return value === "" || value === null || value === undefined ? null : Number(value); }
  function format(value, digits = 5) {
    if (!Number.isFinite(Number(value))) return "—";
    return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(Number(value));
  }

  function localDateTimeValue(date = new Date()) {
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0, 16);
  }

  function toast(message, type = "") {
    const element = document.createElement("div");
    element.className = `toast ${type}`;
    element.textContent = message;
    byId("toastContainer").appendChild(element);
    setTimeout(() => element.remove(), 3600);
  }

  function beep() {
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      [0, .2, .4].forEach((delay) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(.08, context.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + delay + .15);
        oscillator.start(context.currentTime + delay);
        oscillator.stop(context.currentTime + delay + .16);
      });
    } catch { /* Sound is optional. */ }
  }

  function navigate(pageId) {
    document.querySelectorAll(".page").forEach((page) => page.classList.toggle("active", page.id === pageId));
    document.querySelectorAll("[data-page]").forEach((button) => button.classList.toggle("active", button.dataset.page === pageId));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function draftFields() {
    return ["experimentAt", "thioBatch", "dichromateBatch", "dichromateConcentration", "dichromateVolume", "nominalConcentration", "darkMinutes", "sample1Initial", "sample1Final", "sample2Initial", "sample2Final", "notes"];
  }

  function saveDraft() {
    const draft = {};
    draftFields().forEach((name) => {
      const field = form.elements[name];
      if (field) draft[name] = field.value;
    });
    saveJson(KEYS.draft, draft);
  }

  function restoreDraft() {
    const draft = readJson(KEYS.draft, {});
    draftFields().forEach((name) => {
      const field = form.elements[name];
      if (field && draft[name] !== undefined) field.value = draft[name];
    });
    if (!form.elements.experimentAt.value) form.elements.experimentAt.value = localDateTimeValue();
    if (!form.elements.thioBatch.value) {
      const date = new Date();
      form.elements.thioBatch.value = `Na2S2O3-${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    }
  }

  function updateExpectedVolume() {
    const strip = byId("expectedStrip");
    try {
      const result = calc.expectedTitrantVolume({
        dichromateConcentrationMolL: form.elements.dichromateConcentration.value,
        dichromateVolumeMl: form.elements.dichromateVolume.value,
        nominalTitrantConcentrationMolL: form.elements.nominalConcentration.value,
      });
      byId("expectedVolume").textContent = `${format(result.expectedVolumeMl, 3)} mL`;
      strip.classList.toggle("warning", result.expectedVolumeMl > 50 || result.expectedVolumeMl < 1);
      byId("expectedHint").textContent = result.expectedVolumeMl > 50
        ? "预计超过50 mL，一次滴定管量程可能不足"
        : result.expectedVolumeMl < 1
          ? "预计体积小于1 mL，滴定误差可能较大"
          : "适合使用50 mL滴定管";
    } catch {
      byId("expectedVolume").textContent = "—";
      byId("expectedHint").textContent = "请检查输入参数";
      strip.classList.add("warning");
    }
  }

  function sampleFieldNames(index) {
    const number = index + 1;
    return { initial: `sample${number}Initial`, final: `sample${number}Final` };
  }

  function calculateSample(index, showError = false) {
    const names = sampleFieldNames(index);
    const initial = form.elements[names.initial].value;
    const final = form.elements[names.final].value;
    const card = document.querySelector(`[data-sample="${index}"]`);
    card.classList.remove("valid", "invalid");

    if (initial === "" && final === "") {
      sampleResults[index] = null;
      byId(`consumed${index}`).textContent = "—";
      byId(`concentration${index}`).textContent = "—";
      byId(`sampleStatus${index}`).textContent = "待录入";
      renderEndpoint(index);
      return null;
    }
    if (initial === "" || final === "") {
      sampleResults[index] = null;
      card.classList.add("invalid");
      byId(`sampleStatus${index}`).textContent = "数据不完整";
      byId(`consumed${index}`).textContent = "—";
      byId(`concentration${index}`).textContent = "—";
      renderEndpoint(index);
      return null;
    }

    try {
      const result = calc.calculateStandardization({
        dichromateConcentrationMolL: form.elements.dichromateConcentration.value,
        dichromateVolumeMl: form.elements.dichromateVolume.value,
        initialReadingMl: initial,
        finalReadingMl: final,
      });
      sampleResults[index] = result;
      card.classList.add("valid");
      byId(`consumed${index}`).textContent = `${format(result.consumedVolumeMl, 3)} mL`;
      byId(`concentration${index}`).textContent = `${format(result.titrantConcentrationMolL, 6)} mol/L`;
      byId(`sampleStatus${index}`).textContent = "已计算";
      renderEndpoint(index);
      return result;
    } catch (error) {
      sampleResults[index] = null;
      card.classList.add("invalid");
      byId(`sampleStatus${index}`).textContent = "读数有误";
      byId(`consumed${index}`).textContent = "—";
      byId(`concentration${index}`).textContent = "—";
      renderEndpoint(index);
      if (showError) toast(`平行样${index + 1}：${error.message}`, "error");
      return null;
    }
  }

  function calculateAll(showError = false) {
    calculateSample(0, showError);
    calculateSample(1, showError);
    const card = byId("summaryCard");
    card.classList.remove("passed", "failed");
    parallelResult = null;

    if (!sampleResults[0] || !sampleResults[1]) {
      byId("summaryTitle").textContent = "等待两组滴定数据";
      byId("summaryText").textContent = "录入两组初始和终点读数后自动计算。";
      byId("meanConcentration").textContent = "—";
      byId("relativeDifference").textContent = "—";
      return false;
    }

    parallelResult = calc.evaluateParallels(sampleResults.map((item) => item.titrantConcentrationMolL));
    card.classList.add(parallelResult.passed ? "passed" : "failed");
    byId("summaryTitle").textContent = parallelResult.passed ? "平行结果合格" : "平行差超过2%";
    byId("summaryText").textContent = parallelResult.passed
      ? "两组结果满足要求，平均浓度可作为推荐记录值。"
      : "请保留原始数据并检查滴定终点、读数或重新进行标定。";
    byId("meanConcentration").textContent = `${format(parallelResult.meanConcentrationMolL, 6)} mol/L`;
    byId("relativeDifference").textContent = `${format(parallelResult.relativeDifferencePercent, 3)}%`;
    return true;
  }

  function timerRemaining(timer) {
    if (!timer) return 0;
    return timer.running ? Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000)) : Math.max(0, timer.remainingSec || 0);
  }

  function formatClock(seconds) {
    const safe = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  }

  function renderDarkTimer() {
    const ring = byId("darkTimerRing");
    ring.classList.remove("running", "completed");
    const defaultSeconds = Math.round((number(byId("darkMinutes").value) || 6) * 60);
    const remaining = darkTimer ? timerRemaining(darkTimer) : defaultSeconds;
    byId("darkTimerDisplay").textContent = formatClock(remaining);
    byId("pauseDarkTimer").disabled = !darkTimer?.running;

    if (!darkTimer) {
      byId("darkTimerStatus").textContent = "尚未开始";
      byId("startDarkTimer").textContent = "开始计时";
    } else if (darkTimer.completed) {
      ring.classList.add("completed");
      byId("darkTimerStatus").textContent = "避光稳定已完成";
      byId("startDarkTimer").textContent = "重新计时";
    } else if (darkTimer.running) {
      ring.classList.add("running");
      byId("darkTimerStatus").textContent = "避光计时中";
      byId("startDarkTimer").textContent = "计时中";
    } else {
      byId("darkTimerStatus").textContent = "已暂停";
      byId("startDarkTimer").textContent = "继续计时";
    }
  }

  function startDarkTimer() {
    if (darkTimer?.running) return;
    if (darkTimer && !darkTimer.completed && darkTimer.remainingSec > 0) {
      darkTimer.running = true;
      darkTimer.endAt = Date.now() + darkTimer.remainingSec * 1000;
    } else {
      const durationSec = Math.round(Number(byId("darkMinutes").value) * 60);
      if (!Number.isFinite(durationSec) || durationSec <= 0) return toast("避光时长必须大于0", "error");
      darkTimer = {
        running: true,
        completed: false,
        durationSec,
        remainingSec: durationSec,
        startedAt: new Date().toISOString(),
        endAt: Date.now() + durationSec * 1000,
      };
    }
    saveJson(KEYS.darkTimer, darkTimer);
    renderDarkTimer();
  }

  function pauseDarkTimer() {
    if (!darkTimer?.running) return;
    darkTimer.remainingSec = timerRemaining(darkTimer);
    darkTimer.running = false;
    saveJson(KEYS.darkTimer, darkTimer);
    renderDarkTimer();
  }

  function resetDarkTimer(requireConfirmation = true) {
    if (requireConfirmation && darkTimer && !confirm("确定重置本次避光计时吗？")) return;
    darkTimer = null;
    localStorage.removeItem(KEYS.darkTimer);
    renderDarkTimer();
  }

  function completeDarkTimer() {
    if (!darkTimer || darkTimer.completed) return;
    darkTimer.running = false;
    darkTimer.completed = true;
    darkTimer.remainingSec = 0;
    darkTimer.completedAt = new Date().toISOString();
    saveJson(KEYS.darkTimer, darkTimer);
    renderDarkTimer();
    beep();
    toast("6分钟避光稳定完成，可以加入淀粉并开始滴定", "success");
  }

  function startEndpointTimer(index) {
    if (!sampleResults[index]) return toast(`请先完整录入平行样${index + 1}的滴定读数`, "error");
    endpointTimers[index] = {
      running: true,
      remainingSec: 30,
      endAt: Date.now() + 30000,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    saveJson(KEYS.endpointTimers, endpointTimers);
    renderEndpoint(index);
  }

  function completeEndpointTimer(index) {
    const timer = endpointTimers[index];
    if (!timer || timer.status !== "running") return;
    timer.running = false;
    timer.remainingSec = 0;
    timer.status = "awaiting";
    timer.timerCompletedAt = new Date().toISOString();
    saveJson(KEYS.endpointTimers, endpointTimers);
    renderEndpoint(index);
    beep();
    toast(`平行样${index + 1}：30秒已到，请确认是否返蓝`, "success");
  }

  function confirmEndpoint(index, passed) {
    const timer = endpointTimers[index] || {};
    timer.running = false;
    timer.remainingSec = 0;
    timer.status = passed ? "confirmed" : "returned";
    timer.confirmedAt = new Date().toISOString();
    endpointTimers[index] = timer;
    saveJson(KEYS.endpointTimers, endpointTimers);
    renderEndpoint(index);
    toast(passed ? `平行样${index + 1}终点已确认` : `平行样${index + 1}返蓝，请继续滴定并更新终点读数`, passed ? "success" : "error");
  }

  function clearEndpoint(index) {
    endpointTimers[index] = null;
    saveJson(KEYS.endpointTimers, endpointTimers);
    renderEndpoint(index);
  }

  function renderEndpoint(index) {
    const timer = endpointTimers[index];
    const box = byId(`endpointBox${index}`);
    const display = byId(`endpointDisplay${index}`);
    const start = document.querySelector(`[data-start-endpoint="${index}"]`);
    const confirmBox = byId(`endpointConfirm${index}`);
    box.classList.remove("confirmed", "returned");
    confirmBox.classList.remove("visible");
    start.disabled = !sampleResults[index];

    if (!timer) {
      display.textContent = "未开始";
      start.textContent = "蓝色消失，开始30 s";
    } else if (timer.status === "running") {
      display.textContent = formatClock(timerRemaining(timer));
      start.textContent = "计时中";
      start.disabled = true;
    } else if (timer.status === "awaiting") {
      display.textContent = "请确认是否返蓝";
      start.textContent = "重新计时";
      confirmBox.classList.add("visible");
    } else if (timer.status === "confirmed") {
      box.classList.add("confirmed");
      display.textContent = "30 s未返蓝，已确认";
      start.textContent = "重新计时";
    } else if (timer.status === "returned") {
      box.classList.add("returned");
      display.textContent = "出现返蓝，请继续滴定";
      start.textContent = "更新读数后重新计时";
    }
  }

  function tickClocks() {
    if (darkTimer?.running && timerRemaining(darkTimer) <= 0) completeDarkTimer();
    endpointTimers.forEach((timer, index) => {
      if (timer?.status === "running" && timerRemaining(timer) <= 0) completeEndpointTimer(index);
    });
    renderDarkTimer();
    renderEndpoint(0);
    renderEndpoint(1);
  }

  function recordStatus() {
    if (!parallelResult?.passed) return "平行差超限";
    if (!darkTimer?.completed || endpointTimers.some((timer) => timer?.status !== "confirmed")) return "步骤待确认";
    return "合格";
  }

  function saveRecord(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!calculateAll(true)) return toast("请先完整录入两组平行滴定数据", "error");
    const status = recordStatus();
    const record = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      createdAt: new Date().toISOString(),
      experimentAt: form.elements.experimentAt.value,
      thioBatch: form.elements.thioBatch.value.trim(),
      dichromateBatch: form.elements.dichromateBatch.value.trim(),
      dichromateConcentrationMolL: Number(form.elements.dichromateConcentration.value),
      dichromateVolumeMl: Number(form.elements.dichromateVolume.value),
      nominalConcentrationMolL: number(form.elements.nominalConcentration.value),
      darkTimer: darkTimer ? JSON.parse(JSON.stringify(darkTimer)) : null,
      samples: sampleResults.map((result, index) => ({
        initialReadingMl: Number(form.elements[sampleFieldNames(index).initial].value),
        finalReadingMl: Number(form.elements[sampleFieldNames(index).final].value),
        ...result,
        endpoint: endpointTimers[index] ? JSON.parse(JSON.stringify(endpointTimers[index])) : null,
      })),
      parallel: { ...parallelResult },
      status,
      notes: form.elements.notes.value.trim(),
    };
    records.unshift(record);
    saveJson(KEYS.records, records);
    renderHistory();
    resetAfterSave();
    toast(`标定记录已保存在本机：${status}`, status === "合格" ? "success" : "");
  }

  function resetAfterSave() {
    ["sample1Initial", "sample1Final", "sample2Initial", "sample2Final", "notes"].forEach((name) => { form.elements[name].value = ""; });
    form.elements.experimentAt.value = localDateTimeValue();
    resetDarkTimer(false);
    endpointTimers = [null, null];
    localStorage.removeItem(KEYS.endpointTimers);
    sampleResults = [null, null];
    parallelResult = null;
    calculateAll(false);
    saveDraft();
  }

  function statusClass(status) { return status === "合格" ? "" : "review"; }
  function displayDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function endpointLabel(endpoint) {
    if (endpoint?.status === "confirmed") return "30 s未返蓝";
    if (endpoint?.status === "returned") return "曾返蓝，待复核";
    return "未确认";
  }

  function renderHistory() {
    byId("historyCount").textContent = records.length;
    byId("recordTotal").textContent = records.length;
    byId("passedTotal").textContent = records.filter((record) => record.status === "合格").length;
    byId("latestConcentration").textContent = records.length ? `${format(records[0].parallel?.meanConcentrationMolL, 6)} mol/L` : "—";
    byId("historyEmpty").style.display = records.length ? "none" : "grid";
    const list = byId("historyList");
    list.innerHTML = records.map((record) => `<details class="history-item">
      <summary>
        <div><span>标定时间</span><strong>${escapeHtml(displayDate(record.experimentAt))}</strong></div>
        <div><span>Na₂S₂O₃批次</span><strong>${escapeHtml(record.thioBatch)}</strong></div>
        <div><span>平均浓度</span><strong>${escapeHtml(format(record.parallel?.meanConcentrationMolL, 6))} mol/L</strong></div>
        <span class="result-badge ${statusClass(record.status)}">${escapeHtml(record.status)}</span>
      </summary>
      <div class="history-detail">
        <div class="detail-grid">
          <div><span>重铬酸钾</span><strong>${escapeHtml(format(record.dichromateConcentrationMolL, 5))} mol/L × ${escapeHtml(format(record.dichromateVolumeMl, 2))} mL</strong></div>
          <div><span>平行相对差</span><strong>${escapeHtml(format(record.parallel?.relativeDifferencePercent, 3))}%</strong></div>
          <div><span>避光计时</span><strong>${record.darkTimer?.completed ? "已完成" : "未确认"}</strong></div>
          <div><span>重铬酸钾批次</span><strong>${escapeHtml(record.dichromateBatch || "未填写")}</strong></div>
          ${record.samples.map((sample, index) => `<div><span>平行样${index + 1}读数</span><strong>${escapeHtml(format(sample.initialReadingMl, 2))} → ${escapeHtml(format(sample.finalReadingMl, 2))} mL</strong></div><div><span>平行样${index + 1}结果</span><strong>${escapeHtml(format(sample.titrantConcentrationMolL, 6))} mol/L · ${escapeHtml(endpointLabel(sample.endpoint))}</strong></div>`).join("")}
        </div>
        ${record.notes ? `<p class="history-note"><strong>备注：</strong>${escapeHtml(record.notes)}</p>` : ""}
        <button class="delete-record" data-delete="${escapeHtml(record.id)}">删除这条记录</button>
      </div>
    </details>`).join("");
    list.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      const record = records.find((item) => item.id === button.dataset.delete);
      if (!record || !confirm(`确定删除 ${record.thioBatch} 的这条标定记录吗？`)) return;
      records = records.filter((item) => item.id !== record.id);
      saveJson(KEYS.records, records);
      renderHistory();
      toast("记录已删除");
    }));
  }

  function download(filename, content, type) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function localDateString() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
  function exportCsv() {
    if (!records.length) return toast("还没有可导出的历史记录", "error");
    const header = ["标定时间", "Na2S2O3批次", "K2Cr2O7批次", "K2Cr2O7浓度_mol_L", "K2Cr2O7体积_mL", "平行1初始_mL", "平行1终点_mL", "平行1消耗_mL", "平行1浓度_mol_L", "平行2初始_mL", "平行2终点_mL", "平行2消耗_mL", "平行2浓度_mol_L", "平均浓度_mol_L", "相对差_%", "判定", "备注"];
    const rows = records.map((record) => [record.experimentAt, record.thioBatch, record.dichromateBatch, record.dichromateConcentrationMolL, record.dichromateVolumeMl, record.samples[0].initialReadingMl, record.samples[0].finalReadingMl, record.samples[0].consumedVolumeMl, record.samples[0].titrantConcentrationMolL, record.samples[1].initialReadingMl, record.samples[1].finalReadingMl, record.samples[1].consumedVolumeMl, record.samples[1].titrantConcentrationMolL, record.parallel.meanConcentrationMolL, record.parallel.relativeDifferencePercent, record.status, record.notes]);
    const csv = `\ufeff${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}`;
    download(`Na2S2O3-标定记录-${localDateString()}.csv`, csv, "text/csv;charset=utf-8");
  }

  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!Array.isArray(imported)) throw new Error("备份文件格式不正确");
        const ids = new Set(records.map((record) => record.id));
        const valid = imported.filter((record) => record && record.id && Array.isArray(record.samples) && record.parallel && !ids.has(record.id));
        records = [...valid, ...records].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        saveJson(KEYS.records, records);
        renderHistory();
        toast(`已导入${valid.length}条记录`, "success");
      } catch (error) { toast(error.message, "error"); }
    };
    reader.readAsText(file);
  }

  function bindEvents() {
    document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.page)));
    form.addEventListener("input", (event) => {
      saveDraft();
      if (["dichromateConcentration", "dichromateVolume", "nominalConcentration"].includes(event.target.name)) {
        updateExpectedVolume();
        calculateAll(false);
      }
    });
    [0, 1].forEach((index) => {
      const names = sampleFieldNames(index);
      [names.initial, names.final].forEach((name) => form.elements[name].addEventListener("input", () => {
        if (endpointTimers[index]) clearEndpoint(index);
        calculateAll(false);
      }));
    });
    form.addEventListener("submit", saveRecord);
    byId("calculateButton").addEventListener("click", () => calculateAll(true));
    byId("startDarkTimer").addEventListener("click", startDarkTimer);
    byId("pauseDarkTimer").addEventListener("click", pauseDarkTimer);
    byId("resetDarkTimer").addEventListener("click", () => resetDarkTimer(true));
    document.querySelectorAll("[data-start-endpoint]").forEach((button) => button.addEventListener("click", () => startEndpointTimer(Number(button.dataset.startEndpoint))));
    document.querySelectorAll("[data-confirm-endpoint]").forEach((button) => button.addEventListener("click", () => confirmEndpoint(Number(button.dataset.confirmEndpoint), button.dataset.passed === "true")));
    byId("exportCsv").addEventListener("click", exportCsv);
    byId("exportJson").addEventListener("click", () => {
      if (!records.length) return toast("还没有可备份的历史记录", "error");
      download(`Na2S2O3-标定备份-${localDateString()}.json`, JSON.stringify(records, null, 2), "application/json");
    });
    byId("importJson").addEventListener("change", (event) => importJson(event.target.files[0]));
  }

  function initializeOfflineMode() {
    const status = byId("offlineStatus");
    if (!("serviceWorker" in navigator)) {
      status.textContent = "数据仅本机保存";
      return;
    }

    window.addEventListener("load", async () => {
      try {
        await navigator.serviceWorker.register("./sw.js");
        await navigator.serviceWorker.ready;
        status.textContent = "本机保存 · 已可离线使用";
      } catch {
        status.textContent = "数据仅本机保存";
      }
    });
  }

  function initialize() {
    if (!Array.isArray(endpointTimers) || endpointTimers.length !== 2) endpointTimers = [null, null];
    restoreDraft();
    bindEvents();
    updateExpectedVolume();
    calculateAll(false);
    renderDarkTimer();
    renderEndpoint(0);
    renderEndpoint(1);
    renderHistory();
    initializeOfflineMode();
    clockInterval = setInterval(tickClocks, 500);
    tickClocks();
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
