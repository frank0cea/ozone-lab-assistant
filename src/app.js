(function () {
  "use strict";

  const calc = window.LabCalc;
  const KEYS = {
    results: "ozonelab.latestResults.v1",
    records: "ozonelab.records.v1",
    workflow: "ozonelab.workflow.v1",
    route: "ozonelab.route.v1",
    timer: "ozonelab.timer.v1",
  };
  const pageTitles = { overview: "实验台", calculators: "计算中心", workflow: "实验流程", records: "实验记录" };

  let latestResults = readJson(KEYS.results, {});
  let records = readJson(KEYS.records, []);
  let route = localStorage.getItem(KEYS.route) || "direct";
  let workflowState = readJson(KEYS.workflow, { direct: {}, water: {} });
  let activeTimer = readJson(KEYS.timer, null);
  let timerInterval = null;

  const workflows = {
    direct: [
      ["完成安全与通风检查", "确认尾气破坏、防倒吸及个体防护", 0],
      ["准备并编号全部容器", "水样、取样瓶、KI 1/2、空白及膜片", 0],
      ["确认发生器实测产量", "使用当天或近期、同流量条件下的标定值", 0],
      ["配制 SA 工作液", "按最终 DOC 和总体积配制", 0],
      ["加入 Ca²⁺/Mg²⁺ 并混合", "记录储备液体积、离子浓度和混合时间", 5],
      ["连接两级 KI 尾气吸收瓶", "检查气密性与气路方向", 0],
      ["直接曝气臭氧", "使用计算中心给出的时间；开始即计时", 0],
      ["测定处理后残余臭氧", "按固定取样时刻立即测定", 0],
      ["N₂ 吹脱残余臭氧", "吹脱条件对所有组保持一致", 30],
      ["确认残余臭氧接近 0", "未确认前不进行膜过滤", 0],
      ["记录并统一 pH、温度和剩余体积", "pH 目标按最终实验方案执行", 0],
      ["0.15 MPa 预压新膜", "达到稳定标准后进入下一步", 30],
      ["0.10 MPa 测定 J₀", "记录稳定纯水通量", 0],
      ["0.10 MPa 过滤污染液", "各组统一过滤时间或产水终点", 120],
      ["统一水洗膜片", "相同水量、温度和振荡条件", 2],
      ["0.10 MPa 测定 Jr", "计算 FRR 并保存膜片", 0],
      ["完成滴定、记录与样品归档", "保存原始数据和偏差说明", 0],
    ],
    water: [
      ["完成安全与通风检查", "确认尾气破坏、防倒吸及个体防护", 0],
      ["准备并编号全部容器", "水样、取样瓶、靛蓝试剂及膜片", 0],
      ["配制基础 SA 溶液", "使用计算中心给出的投加前 DOC 修正值", 0],
      ["加入 Ca²⁺/Mg²⁺ 并混合", "记录储备液体积、离子浓度和混合时间", 5],
      ["现制臭氧水", "记录制备起止时刻、温度及气体条件", 0],
      ["靛蓝法测臭氧水浓度", "取样后立即显色并测定", 0],
      ["计算并量取臭氧水", "按最终总体积与 DOC 剂量修正", 0],
      ["加入臭氧水、密闭避光反应", "加完立即盖好并开始计时", 30],
      ["测定处理后残余臭氧", "按固定取样时刻立即测定", 0],
      ["N₂ 吹脱残余臭氧", "吹脱条件对所有组保持一致", 30],
      ["确认残余臭氧接近 0", "未确认前不进行膜过滤", 0],
      ["记录并统一 pH、温度和剩余体积", "各组取样体积保持一致", 0],
      ["0.15 MPa 预压新膜", "达到稳定标准后进入下一步", 30],
      ["0.10 MPa 测定 J₀", "记录稳定纯水通量", 0],
      ["0.10 MPa 过滤污染液", "各组统一过滤时间或产水终点", 120],
      ["统一水洗膜片", "相同水量、温度和振荡条件", 2],
      ["0.10 MPa 测定 Jr", "计算 FRR 并保存膜片", 0],
      ["完成记录与样品归档", "保存原始数据和偏差说明", 0],
    ],
  };

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }

  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function byId(id) { return document.getElementById(id); }
  function formValues(form) { return Object.fromEntries(new FormData(form).entries()); }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[char]);
  }

  function format(value, digits = 3) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    if (n === 0) return "0";
    const precision = Math.abs(n) >= 100 ? 2 : Math.abs(n) < 1 ? Math.max(digits, 4) : digits;
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: precision }).format(n);
  }

  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function completionTime(value) {
    if (typeof value !== "string") return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : ` · 完成于 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }

  function toast(message, type = "") {
    const element = document.createElement("div");
    element.className = `toast ${type}`;
    element.textContent = message;
    byId("toastContainer").appendChild(element);
    setTimeout(() => element.remove(), 3600);
  }

  function navigate(sectionId) {
    document.querySelectorAll(".page-section").forEach((section) => section.classList.toggle("active", section.id === sectionId));
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.sectionTarget === sectionId));
    byId("pageTitle").textContent = pageTitles[sectionId];
    document.querySelector(".sidebar").classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resultHtml(items, warning) {
    const cells = items.map(([label, value]) => `<div class="result-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
    return `<div class="result-grid">${cells}${warning ? `<p class="result-warning">${escapeHtml(warning)}</p>` : ""}</div>`;
  }

  function storeResult(type, label, inputs, result) {
    latestResults[type] = { type, label, inputs, result, at: new Date().toISOString() };
    saveJson(KEYS.results, latestResults);
    refreshDashboard();
  }

  function showCalculation(form, type, label, runner, presenter) {
    const resultElement = document.querySelector(`[data-result="${type}"]`);
    try {
      const inputs = formValues(form);
      const result = runner(inputs);
      const presented = presenter(result, inputs);
      resultElement.classList.remove("error");
      resultElement.innerHTML = resultHtml(presented.items, presented.warning);
      storeResult(type, label, inputs, result);
      toast(`${label}已更新`, "success");
    } catch (error) {
      resultElement.classList.add("error");
      resultElement.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
      toast(error.message, "error");
    }
  }

  const calculatorHandlers = {
    dilution(form) {
      showCalculation(form, "dilution", "通用稀释", (i) => calc.dilution({
        stockConcentration: i.stock, targetConcentration: i.target, finalVolumeMl: i.volume,
      }), (r) => ({
        items: [["取储备液", `${format(r.stockVolumeMl)} mL`], ["理论溶剂体积", `${format(r.solventVolumeMl)} mL`], ["稀释倍数", `${format(r.dilutionFactor)} 倍`]],
        warning: r.stockVolumeMl < 0.1 ? "取液体积小于 0.1 mL，建议改用更稀的中间液。" : "请以最终定容为准，不要把“补水体积”直接当作容量瓶刻度。",
      }));
    },
    ion(form) {
      showCalculation(form, "ion", "离子投加", (i) => calc.ionDose({
        targetMmolL: i.target, stockMolL: i.stock, finalVolumeMl: i.volume,
      }), (r) => ({
        items: [["离子储备液", `${format(r.stockVolumeMl)} mL`], ["其余基液体积", `${format(r.baseSolutionVolumeMl)} mL`], ["离子物质的量", `${format(r.ionAmountMmol)} mmol`]],
        warning: r.stockVolumeMl < 0.1 ? "移取量过小，配制中间储备液可降低移液误差。" : "储备液属于最终总体积的一部分，加入前需预留相应体积。",
      }));
    },
    stock(form) {
      showCalculation(form, "stock", "摩尔储备液", (i) => calc.stockPreparation({
        molarityMolL: i.molarity, volumeMl: i.volume, molecularWeightGmol: i.mw, purityPercent: i.purity,
      }), (r) => ({ items: [["需要称量", `${format(r.massG, 4)} g`], ["物质的量", `${format(r.substanceAmountMol, 5)} mol`]], warning: "确认相对分子质量对应实际水合形态，并按容量瓶最终定容。" }));
    },
    direct(form) {
      showCalculation(form, "direct", "直接曝气臭氧", (i) => calc.directOzone({
        targetDoseMgMgDoc: i.dose, docMgL: i.doc, sampleVolumeL: i.volume,
        ozoneOutputMgMin: i.output, transferEfficiencyPercent: i.efficiency,
      }), (r, i) => {
        const short = r.timeMin < 0.5;
        const assumed = Number(i.efficiency) === 100;
        return {
          items: [["DOC 总量", `${format(r.docMassMg)} mg`], ["目标转移 O₃", `${format(r.targetOzoneMassMg)} mg`], ["需要曝气", `${format(r.timeMin)} min（${format(r.timeMin * 60, 1)} s）`], ["发生器输入 O₃", `${format(r.inputOzoneMassMg)} mg`]],
          warning: short ? "计算时间短于 30 s，阀门响应与气路滞后可能造成明显误差。" : assumed ? "当前按 100% 转移估算；完成 KI 尾气滴定后，应以实际转移剂量复核。" : "时间已按所填转移效率反算，请用 KI 尾气结果复核。",
        };
      });
    },
    water(form) {
      showCalculation(form, "water", "臭氧水投加", (i) => calc.ozoneWaterDose({
        targetDoseMgMgDoc: i.dose, docMgL: i.doc, finalVolumeMl: i.volume,
        ozoneWaterConcentrationMgL: i.concentration, retentionPercent: i.retention,
      }), (r) => ({
        items: [["量取臭氧水", `${format(r.ozoneWaterVolumeMl)} mL`], ["基础污染液体积", `${format(r.baseSolutionVolumeMl)} mL`], ["投加前基础液 DOC", `${format(r.requiredBaseDocMgL)} mg/L`], ["臭氧水占总体积", `${format(r.ozoneWaterFractionPercent)}%`], ["目标 O₃ 质量", `${format(r.targetOzoneMassMg)} mg`]],
        warning: r.ozoneWaterFractionPercent > 10 ? "臭氧水占比超过 10%，必须按上面的“投加前基础液 DOC”配制，否则最终 DOC 会被明显稀释。" : "臭氧水也计入最终总体积；投加后最终 DOC 才是目标 DOC。",
      }));
    },
    iodometric(form) {
      showCalculation(form, "iodometric", "KI 转移剂量", (i) => calc.iodometricTransfer({
        thiosulfateMolL: i.thio, bottle1Ml: i.v1, bottle2Ml: i.v2, blankMl: i.blank,
        ozoneOutputMgMin: i.output, ozoneTimeMin: i.time, docMgL: i.doc, sampleVolumeL: i.volume,
      }), (r, i) => {
        const secondShare = (Number(i.v2) - Number(i.blank)) / r.correctedVolumeMl;
        return {
          items: [["尾气 O₃", `${format(r.tailOzoneMassMg)} mg`], ["输入 O₃", `${format(r.inputOzoneMassMg)} mg`], ["表观转移 O₃", `${format(r.transferredOzoneMassMg)} mg`], ["转移效率", `${format(r.transferEfficiencyPercent)}%`], ["表观投加剂量 Dapp", `${format(r.apparentDoseMgMgDoc, 4)} mg/mg DOC`], ["实际转移剂量 Dtransfer", `${format(r.transferredDoseMgMgDoc, 4)} mg/mg DOC`]],
          warning: secondShare > 0.1 ? "第二级 KI 瓶占校正滴定量超过 10%，提示第一级吸收可能接近穿透；请重点检查吸收效率。" : "公式按每个 KI 瓶分别扣除一次空白 V₀。",
        };
      });
    },
    membrane(form) {
      showCalculation(form, "membrane", "膜性能指标", (i) => {
        let area = i.area;
        if (i.diameter) {
          area = calc.circularAreaCm2(i.diameter);
          form.elements.area.value = area.toFixed(4);
        }
        return calc.membraneMetrics({ permeateVolumeMl: i.permeate, collectionTimeMin: i.time, areaCm2: area, j0: i.j0, jr: i.jr });
      }, (r) => {
        const items = [["瞬时通量 J", `${format(r.fluxLmh)} L·m⁻²·h⁻¹`]];
        if (r.normalizedFlux !== undefined) items.push(["归一化通量 J/J₀", format(r.normalizedFlux, 4)]);
        if (r.frrPercent !== undefined) items.push(["通量恢复率 FRR", `${format(r.frrPercent)}%`]);
        return { items, warning: "不同组必须使用相同有效膜面积和一致的时间/产水终点。" };
      });
    },
  };

  function routeState() {
    workflowState[route] ||= {};
    workflowState[route].steps ||= {};
    workflowState[route].durations ||= {};
    return workflowState[route];
  }

  function workflowDuration(index, fallback) {
    const state = routeState();
    if (state.durations[index] !== undefined) return state.durations[index];
    if (route === "direct" && index === 6 && latestResults.direct?.result?.timeMin) return Number(latestResults.direct.result.timeMin.toFixed(2));
    return fallback;
  }

  function renderWorkflow() {
    const state = routeState();
    byId("workflowTitle").textContent = route === "direct" ? "直接曝气实验流程" : "臭氧水实验流程";
    document.querySelectorAll("[data-route]").forEach((button) => button.classList.toggle("active", button.dataset.route === route));
    byId("recordForm").elements.route.value = route;
    byId("workflowList").innerHTML = workflows[route].map((step, index) => {
      const done = Boolean(state.steps[index]);
      const duration = workflowDuration(index, step[2]);
      const timerActive = activeTimer && activeTimer.route === route && activeTimer.index === index;
      return `<div class="workflow-step ${done ? "done" : ""} ${timerActive ? "active-timer" : ""}" data-index="${index}">
        <input class="step-check" type="checkbox" aria-label="完成步骤 ${index + 1}" ${done ? "checked" : ""}>
        <div class="step-copy"><strong>${index + 1}. ${escapeHtml(step[0])}</strong><small>${escapeHtml(step[1])}${escapeHtml(completionTime(state.steps[index]))}</small></div>
        <label class="step-duration"><input type="number" min="0" step="0.1" value="${escapeHtml(duration)}" aria-label="计时分钟"><span>min</span></label>
        <button class="timer-start" ${duration <= 0 ? "disabled" : ""}>开始计时</button>
      </div>`;
    }).join("");

    byId("workflowList").querySelectorAll(".workflow-step").forEach((row) => {
      const index = Number(row.dataset.index);
      row.querySelector(".step-check").addEventListener("change", (event) => toggleStep(index, event.target));
      row.querySelector(".step-duration input").addEventListener("change", (event) => {
        const value = Math.max(0, Number(event.target.value) || 0);
        routeState().durations[index] = value;
        saveJson(KEYS.workflow, workflowState);
        row.querySelector(".timer-start").disabled = value <= 0;
      });
      row.querySelector(".timer-start").addEventListener("click", () => startTimer(index, Number(row.querySelector(".step-duration input").value)));
    });
    updateProgress();
  }

  function toggleStep(index, checkbox) {
    const state = routeState();
    if (checkbox.checked && !byId("allowSkip").checked) {
      const unfinished = workflows[route].slice(0, index).findIndex((_, i) => !state.steps[i]);
      if (unfinished !== -1) {
        checkbox.checked = false;
        toast(`请先完成第 ${unfinished + 1} 步，或开启“允许跳过”`, "error");
        return;
      }
    }
    state.steps[index] = checkbox.checked ? new Date().toISOString() : false;
    saveJson(KEYS.workflow, workflowState);
    renderWorkflow();
    refreshDashboard();
  }

  function updateProgress() {
    const done = Object.values(routeState().steps).filter(Boolean).length;
    const total = workflows[route].length;
    const percent = Math.round((done / total) * 100);
    byId("workflowPercent").textContent = `${percent}%`;
    byId("workflowBar").style.width = `${percent}%`;
  }

  function startTimer(index, minutes) {
    if (!Number.isFinite(minutes) || minutes <= 0) return toast("请先填写大于 0 的计时时长", "error");
    activeTimer = { route, index, label: workflows[route][index][0], remainingMs: minutes * 60 * 1000, running: true, endAt: Date.now() + minutes * 60 * 1000 };
    saveJson(KEYS.timer, activeTimer);
    startTimerLoop();
    renderWorkflow();
    toast(`已开始：${activeTimer.label}`);
  }

  function remainingMs() {
    if (!activeTimer) return 0;
    return activeTimer.running ? Math.max(0, activeTimer.endAt - Date.now()) : Math.max(0, activeTimer.remainingMs);
  }

  function startTimerLoop() {
    clearInterval(timerInterval);
    if (!activeTimer) return renderTimer();
    renderTimer();
    timerInterval = setInterval(() => {
      renderTimer();
      if (activeTimer && activeTimer.running && remainingMs() <= 0) finishTimer();
    }, 500);
  }

  function renderTimer() {
    const panel = byId("timerPanel");
    if (!activeTimer) {
      panel.classList.remove("active");
      return;
    }
    panel.classList.add("active");
    byId("timerStep").textContent = activeTimer.label;
    const seconds = Math.ceil(remainingMs() / 1000);
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    byId("timerDisplay").textContent = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    byId("pauseTimer").textContent = activeTimer.running ? "暂停" : "继续";
  }

  function toggleTimerPause() {
    if (!activeTimer) return;
    if (activeTimer.running) {
      activeTimer.remainingMs = remainingMs();
      activeTimer.running = false;
    } else {
      activeTimer.running = true;
      activeTimer.endAt = Date.now() + activeTimer.remainingMs;
    }
    saveJson(KEYS.timer, activeTimer);
    renderTimer();
  }

  function cancelTimer() {
    activeTimer = null;
    localStorage.removeItem(KEYS.timer);
    clearInterval(timerInterval);
    renderTimer();
    renderWorkflow();
  }

  function finishTimer() {
    const label = activeTimer.label;
    activeTimer.running = false;
    activeTimer.remainingMs = 0;
    saveJson(KEYS.timer, activeTimer);
    beep();
    toast(`${label}：计时结束，请立即确认取样或进入下一步`, "success");
    renderTimer();
  }

  function beep() {
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      [0, .22, .44].forEach((delay) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(.08, context.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + delay + .16);
        oscillator.start(context.currentTime + delay); oscillator.stop(context.currentTime + delay + .17);
      });
    } catch { /* Audio is optional. */ }
  }

  function workflowSnapshot() {
    const state = routeState();
    const completed = Object.values(state.steps).filter(Boolean).length;
    return { route, completed, total: workflows[route].length, steps: { ...state.steps } };
  }

  function newExperimentId() {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const count = records.filter((record) => String(record.experimentId).startsWith(stamp)).length + 1;
    return `${stamp}-SA-${String(count).padStart(2, "0")}`;
  }

  function resetRecordForm() {
    const form = byId("recordForm");
    form.reset();
    form.elements.experimentId.value = newExperimentId();
    form.elements.date.value = localDateString();
    form.elements.route.value = route;
    form.elements.doc.value = 10;
    form.elements.volume.value = 500;
    form.elements.ozoneDose.value = .5;
    form.elements.includeSnapshot.checked = true;
  }

  function saveRecord(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = formValues(form);
    const record = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      ...values,
      createdAt: new Date().toISOString(),
    };
    if (values.includeSnapshot === "on") {
      record.snapshot = { calculations: structuredClone(latestResults), workflow: workflowSnapshot() };
    }
    delete record.includeSnapshot;
    records.unshift(record);
    saveJson(KEYS.records, records);
    renderRecords();
    refreshDashboard();
    resetRecordForm();
    toast("实验记录已保存在本机", "success");
  }

  function conditionText(record) {
    const ion = record.ion && record.ion !== "none" ? `${record.ion} ${record.ionConcentration || 0} mmol/L` : "无二价离子";
    return `${record.pollutant || "SA"} · ${ion}`;
  }

  function routeText(value) { return ({ direct: "直接曝气", water: "臭氧水", control: "无臭氧" })[value] || value; }

  function renderRecords() {
    const body = byId("recordsBody");
    body.innerHTML = records.map((record) => `<tr>
      <td><strong>${escapeHtml(record.experimentId)}</strong><small>平行 ${escapeHtml(record.replicate || 1)}</small></td>
      <td><strong>${escapeHtml(conditionText(record))}</strong><small>DOC ${escapeHtml(record.doc)} mg/L · ${escapeHtml(record.volume)} mL</small></td>
      <td><strong>${escapeHtml(routeText(record.route))}</strong><small>${escapeHtml(record.ozoneDose || 0)} mg/mg DOC</small></td>
      <td><span class="status-pill">${escapeHtml(record.status)}</span></td>
      <td>${escapeHtml(record.date)}</td>
      <td><button class="delete-record" data-delete-record="${escapeHtml(record.id)}" aria-label="删除记录">删除</button></td>
    </tr>`).join("");
    byId("recordsEmpty").style.display = records.length ? "none" : "grid";
    body.querySelectorAll("[data-delete-record]").forEach((button) => button.addEventListener("click", () => {
      const record = records.find((item) => item.id === button.dataset.deleteRecord);
      if (!record || !confirm(`确定删除记录“${record.experimentId}”吗？`)) return;
      records = records.filter((item) => item.id !== record.id);
      saveJson(KEYS.records, records); renderRecords(); refreshDashboard();
      toast("记录已删除");
    }));
  }

  function download(filename, content, type) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
  function exportCsv() {
    if (!records.length) return toast("还没有可导出的记录", "error");
    const headers = ["实验编号", "日期", "污染物", "路线", "平行", "DOC_mg_L", "总体积_mL", "离子", "离子浓度_mmol_L", "臭氧剂量_mgO3_mgDOC", "状态", "备注"];
    const rows = records.map((r) => [r.experimentId, r.date, r.pollutant, routeText(r.route), r.replicate, r.doc, r.volume, r.ion, r.ionConcentration, r.ozoneDose, r.status, r.notes]);
    download(`ozonelab-records-${localDateString()}.csv`, `\ufeff${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}`, "text/csv;charset=utf-8");
  }

  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!Array.isArray(imported)) throw new Error("备份文件格式不正确");
        const existing = new Set(records.map((item) => item.id));
        records = [...imported.filter((item) => item && item.id && !existing.has(item.id)), ...records];
        saveJson(KEYS.records, records); renderRecords(); refreshDashboard();
        toast("JSON 备份已合并导入", "success");
      } catch (error) { toast(error.message, "error"); }
    };
    reader.readAsText(file);
  }

  function refreshDashboard() {
    const state = routeState();
    const done = Object.values(state.steps).filter(Boolean).length;
    const total = workflows[route].length;
    const percent = Math.round((done / total) * 100);
    byId("statProgress").textContent = `${percent}%`;
    byId("statProgressLabel").textContent = percent ? `${done}/${total} 步已完成 · ${routeText(route)}` : "尚未开始";
    byId("statRecords").textContent = records.length;
    byId("statCalculations").textContent = Object.keys(latestResults).length;

    const recent = byId("recentRecords");
    if (!records.length) {
      recent.className = "empty-state compact";
      recent.innerHTML = "<span>▤</span><p>还没有实验记录</p>";
    } else {
      recent.className = "";
      recent.innerHTML = records.slice(0, 3).map((record) => `<div class="recent-record"><div><strong>${escapeHtml(record.experimentId)}</strong><small>${escapeHtml(conditionText(record))}</small></div><time>${escapeHtml(record.date)}</time></div>`).join("");
    }
  }

  function bindEvents() {
    document.querySelectorAll("[data-section-target]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.sectionTarget)));
    document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.go)));
    document.querySelectorAll("[data-open-calc]").forEach((button) => button.addEventListener("click", () => {
      navigate("calculators");
      setTimeout(() => byId(`calc-${button.dataset.openCalc}`).scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }));
    document.querySelectorAll("form[data-calculator]").forEach((form) => form.addEventListener("submit", (event) => {
      event.preventDefault(); calculatorHandlers[form.dataset.calculator](form);
    }));
    document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => {
      route = button.dataset.route; localStorage.setItem(KEYS.route, route); renderWorkflow(); refreshDashboard();
    }));
    byId("resetWorkflow").addEventListener("click", () => {
      if (!confirm(`确定重置“${routeText(route)}”的流程进度和自定义时长吗？`)) return;
      workflowState[route] = {}; saveJson(KEYS.workflow, workflowState);
      if (activeTimer?.route === route) cancelTimer();
      renderWorkflow(); refreshDashboard(); toast("流程已重置");
    });
    byId("pauseTimer").addEventListener("click", toggleTimerPause);
    byId("cancelTimer").addEventListener("click", cancelTimer);
    byId("recordForm").addEventListener("submit", saveRecord);
    byId("exportCsv").addEventListener("click", exportCsv);
    byId("exportJson").addEventListener("click", () => {
      if (!records.length) return toast("还没有可备份的记录", "error");
      download(`ozonelab-backup-${localDateString()}.json`, JSON.stringify(records, null, 2), "application/json");
    });
    byId("importJson").addEventListener("change", (event) => importJson(event.target.files[0]));
    byId("mobileMenu").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
  }

  function initialize() {
    const now = new Date();
    byId("todayText").textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(now);
    bindEvents(); resetRecordForm(); renderRecords(); renderWorkflow(); refreshDashboard(); startTimerLoop();
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
