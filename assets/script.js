/* script.js - v13.0 - Full Restoration + Mirror Validator Workflow */

// --- GLOBAL VARIABLES ---
let projects = [];
let activeProjectIdx = 0;
let isOverviewMode = false;
let currentMode = 'creator'; 
let fetchedTruth = null; 
const MAX_TOTAL_SETS = 50; 
let deletedItem = null;
let deletedItemIdx = -1;
let toastTimeout;

// --- INITIALIZATION ---
window.onload = function() {
    addNewProject();
    toggleAppMode();
};

// --- MODE SWITCHING ---
function toggleAppMode() {
    const selector = document.getElementById('appMode');
    if(!selector) return;
    currentMode = selector.value;
    
    // Toggle Inputs
    const cPo = document.getElementById('creatorPoWrapper');
    const vPo = document.getElementById('validatorPoWrapper');
    const cAct = document.getElementById('creatorActions');
    const vAct = document.getElementById('validatorActions');
    const lockOverlay = document.getElementById('lockedOverlay');
    const lblSource = document.getElementById('lblSource');
    const lblTarget = document.getElementById('lblTarget');

    if (currentMode === 'creator') {
        cPo.style.display = 'flex';
        vPo.style.display = 'none';
        cAct.style.display = 'flex';
        vAct.style.display = 'none';
        if(lockOverlay) lockOverlay.style.display = 'none';
        if(lblSource) lblSource.innerText = "Table 1 — Source";
        if(lblTarget) lblTarget.innerText = "Table 2 — Extracted";
        document.getElementById('tableA').readOnly = false;
    } else {
        cPo.style.display = 'none';
        vPo.style.display = 'flex';
        cAct.style.display = 'none';
        vAct.style.display = 'flex';
        if(lblSource) lblSource.innerText = "Locked Source (From Cloud)";
        if(lblTarget) lblTarget.innerText = "Paste Submission Data";
        
        // Clear current workspace for safety when entering validator mode
        projects = [];
        addNewProject();
        document.getElementById('tableA').placeholder = "Waiting for Order search...";
    }
}

// --- CLOUD FUNCTIONS ---

async function saveOrderToCloud() {
    const orderId = document.getElementById('orderInput').value.trim();
    const poId = document.getElementById('poInput').value.trim();

    if (!orderId) { alert("⚠️ Enter Order # to save."); return; }

    // Save full data of Table A (Source) for verification
    const setsPayload = projects.map(p => ({
        name: p.name,
        rawSource: p.rawA || "", 
        rawMatrix: p.rawMatrix || "" 
    }));

    const payload = {
        orderId: orderId,
        poId: poId,
        timestamp: new Date().toISOString(),
        sets: setsPayload
    };

    const btn = document.querySelector('.btn-top-save');
    const originalText = btn.innerText;
    btn.innerText = "Saving...";

    try {
        const response = await fetch('/.netlify/functions/manageOrder', {
            method: 'POST', body: JSON.stringify(payload)
        });
        if (response.ok) showToast(`✅ Order ${orderId} LOCKED.`);
        else {
            localStorage.setItem("MOCK_DB_" + orderId, JSON.stringify(payload));
            showToast("Saved Locally (Mock Mode)");
        }
    } catch (e) {
        localStorage.setItem("MOCK_DB_" + orderId, JSON.stringify(payload));
        showToast("Saved Locally (Mock Mode)");
    }
    btn.innerText = originalText;
}

async function fetchOrderFromCloud() {
    const orderId = document.getElementById('orderInput').value.trim();
    if (!orderId) { alert("Enter Order #."); return; }
    
    const btn = document.querySelector('.btn-top-fetch');
    btn.innerText = "Searching...";

    let data = null;
    try {
        const response = await fetch(`/.netlify/functions/manageOrder?id=${orderId}`);
        if (response.ok) data = await response.json();
    } catch(e) {}
    
    if (!data) {
        const mock = localStorage.getItem("MOCK_DB_" + orderId);
        if (mock) data = JSON.parse(mock);
    }

    if (data) {
        fetchedTruth = data;
        loadValidatorProjects(data);
        showToast(`🔓 Order Found: ${data.sets.length} Sets`);
    } else {
        alert("❌ Order not found.");
    }
    btn.innerText = "🔍 Find Order";
}

// --- VALIDATOR LOGIC ---

function loadValidatorProjects(data) {
    projects = [];
    
    // Create projects based on Cloud Data
    data.sets.forEach((set, i) => {
        projects.push({
            name: set.name || `Set ${i+1}`,
            status: 'ready', 
            rawA: set.rawSource, // LOCKED SOURCE
            rawB: "", // User must paste this
            rawMatrix: set.rawMatrix, 
            dataA: null, dataB: null, matrix: [], mapping: [], step: 1, 
            isLocked: true 
        });
    });

    activeProjectIdx = 0;
    renderTopBar();
    switchProject(0);
    
    // Trigger PO check logic
    const poVerify = document.getElementById('validatorPoVerify');
    poVerify.value = ""; 
    poVerify.placeholder = "Type PO to verify...";
    poVerify.oninput = () => checkPO(data.poId);
}

function checkPO(expectedPO) {
    const input = document.getElementById('validatorPoVerify');
    const val = input.value.trim();
    if(!expectedPO) return;
    
    if(val.toLowerCase() === expectedPO.toLowerCase()) {
        input.style.borderColor = "#10b981";
        input.style.backgroundColor = "#ecfdf5";
    } else {
        input.style.borderColor = "#ef4444";
        input.style.backgroundColor = "#fef2f2";
    }
}

// --- STANDARD PROJECT MANAGEMENT ---

function updateAddButtonText() {
    const input = document.getElementById('addSetQty');
    const btn = document.getElementById('btnAddSets');
    if (input && btn) {
        let qty = parseInt(input.value) || 0;
        if(qty < 1) qty = 1;
        btn.innerText = `+ Add ${qty} Set${qty > 1 ? 's' : ''}`;
    }
}

function addSetsFromInput() {
    const input = document.getElementById('addSetQty');
    let qty = parseInt(input.value) || 1;
    if (projects.length + qty > MAX_TOTAL_SETS) { alert(`Limit is ${MAX_TOTAL_SETS}`); return; }
    for(let i=0; i<qty; i++) createSet();
    renderTopBar();
    switchProject(projects.length - qty);
    input.value = 1;
    updateAddButtonText();
}

function addNewProject() {
    if (projects.length >= MAX_TOTAL_SETS) return;
    createSet();
    renderTopBar();
    switchProject(projects.length - 1);
}

function createSet() {
    const id = projects.length + 1;
    projects.push({
        name: `Set ${id}`, status: 'empty', 
        rawA: "", rawB: "", rawMatrix: "",
        dataA: null, dataB: null, matrix: [], mapping: [], step: 1, showMatrix: false 
    });
}

function renderTopBar() {
    const list = document.getElementById('projectTabs');
    list.innerHTML = "";
    projects.forEach((p, i) => {
        const activeClass = (i === activeProjectIdx && !isOverviewMode) ? 'active' : '';
        const lockIcon = p.isLocked ? "🔒 " : "";
        list.innerHTML += `<div class="tab-item ${activeClass}" onclick="switchProject(${i})"><div class="tab-dot ${p.status}"></div><span>${lockIcon}${p.name}</span><button class="btn-tab-close" onclick="deleteProject(event, ${i})">×</button></div>`;
    });
    updateAddButtonText();
}

function deleteProject(e, idx) {
    e.stopPropagation(); 
    deletedItem = projects[idx]; deletedItemIdx = idx;
    projects.splice(idx, 1);
    if (projects.length === 0) { createSet(); activeProjectIdx = 0; }
    else if (activeProjectIdx >= projects.length) activeProjectIdx = projects.length - 1;
    renderTopBar();
    if(isOverviewMode) showOverview(); else switchProject(activeProjectIdx);
    showToast("Set Deleted. <button onclick='undoDelete()' class='btn-undo'>Undo</button>");
}

function undoDelete() {
    if (!deletedItem) return;
    if (deletedItemIdx >= 0 && deletedItemIdx <= projects.length) projects.splice(deletedItemIdx, 0, deletedItem);
    else projects.push(deletedItem);
    renderTopBar();
    switchProject(deletedItemIdx !== -1 ? deletedItemIdx : projects.length - 1);
    deletedItem = null;
    showToast("Undo Successful");
}

function switchProject(idx) {
    if(isOverviewMode) { document.getElementById('tabOverview').classList.remove('active'); isOverviewMode = false; }
    else saveCurrentViewToProject();
    activeProjectIdx = idx;
    loadProjectIntoView(idx);
    renderTopBar();
}

// --- VIEW LOADING LOGIC ---

function loadProjectIntoView(idx) {
    const p = projects[idx];
    
    // Load Textareas
    document.getElementById('tableA').value = p.rawA || "";
    document.getElementById('tableB').value = p.rawB || "";
    document.getElementById('matrixRawInput').value = p.rawMatrix || "";
    
    // Handle Locked State
    if (p.isLocked) {
        document.getElementById('tableA').readOnly = true;
        document.getElementById('lockedOverlay').style.display = 'flex';
        document.getElementById('matrixRawInput').readOnly = true;
    } else {
        document.getElementById('tableA').readOnly = false;
        document.getElementById('lockedOverlay').style.display = 'none';
        document.getElementById('matrixRawInput').readOnly = false;
    }

    // Matrix
    const matrixList = document.getElementById('matrixList');
    matrixList.innerHTML = "";
    if (p.matrix && p.matrix.length > 0) p.matrix.forEach(m => addMatrixRow(m.key, m.val));
    else addMatrixRow();
    
    const matSec = document.getElementById('matrixSection');
    const btn = document.getElementById('btnToggleMatrix');
    if (p.showMatrix) { matSec.style.display = 'block'; btn.innerText = "- Hide Matrix Rules"; }
    else { matSec.style.display = 'none'; btn.innerText = "+ Show Matrix Rules"; }

    jumpToStep(p.step || 1);
    
    if (p.step >= 2 && p.dataA) renderPreviewTables();
    if (p.step === 3) goToMapping();
    if (p.step === 4) renderDashboard();
}

function saveCurrentViewToProject() {
    if(projects.length===0 || isOverviewMode) return;
    const p = projects[activeProjectIdx];
    // Only save Table A if NOT locked
    if (!p.isLocked && document.getElementById('step1').style.display !== 'none') {
        p.rawA = document.getElementById('tableA').value;
        p.rawMatrix = document.getElementById('matrixRawInput').value;
    }
    // Always save Table B (User Input)
    if (document.getElementById('step1').style.display !== 'none') {
        p.rawB = document.getElementById('tableB').value;
        p.matrix = getMatrixDataFromUI();
        const matSec = document.getElementById('matrixSection');
        p.showMatrix = (matSec && matSec.style.display !== 'none');
    }
}

function clearCurrentProject() {
    const p = projects[activeProjectIdx];
    if (p.isLocked) {
        document.getElementById('tableB').value = "";
        p.rawB = "";
        alert("Source is locked. Only Extracted cleared.");
    } else {
        document.getElementById('tableA').value = "";
        document.getElementById('tableB').value = "";
        document.getElementById('matrixRawInput').value = "";
        p.rawA = ""; p.rawB = ""; p.rawMatrix = "";
    }
    p.dataA = null; p.dataB = null; p.step = 1;
    renderTopBar();
}

function jumpToStep(step) {
    const p = projects[activeProjectIdx];
    p.step = step;
    document.querySelectorAll('.page-section').forEach(el => el.style.display = 'none');
    document.getElementById(`step${step}`).style.display = 'block';
    
    // Nav highlight
    document.querySelectorAll('.v-step').forEach(el => el.classList.remove('active'));
    if(document.getElementById(`navStep${step}`)) document.getElementById(`navStep${step}`).classList.add('active');
    
    // Wizard highlight
    document.querySelectorAll('.w-step').forEach((el, idx) => {
        if(idx + 1 === step) el.classList.add('active'); else el.classList.remove('active');
    });
}

// --- PREVIEW & PARSING ---

function goToPreview() {
    saveCurrentViewToProject();
    const p = projects[activeProjectIdx];
    const modeA = document.getElementById('headerModeA').value || "1row";
    const modeB = document.getElementById('headerModeB').value || "1row";
    
    if (!p.rawA.trim() || !p.rawB.trim()) { alert("Please ensure data is present."); return; }
    
    p.dataA = parseExcelData(p.rawA, modeA);
    p.dataB = parseExcelData(p.rawB, modeB);
    
    if(p.dataA && p.dataB) {
        autoCleanData(p.dataA); autoCleanData(p.dataB);
        p.status = 'ready'; p.step = 2;
        renderTopBar(); renderPreviewTables(); jumpToStep(2);
    }
}

function parseExcelData(raw, mode) {
    if (!raw.trim()) return null;
    const rowRegex = /\r?\n(?=(?:[^"]*"[^"]*")*[^"]*$)/;
    let rows = raw.trim().split(rowRegex);
    while (rows.length > 0 && rows[rows.length - 1].trim() === "") rows.pop();
    if (rows.length < 1) return null;
    let ignoreFirstColumn = false; 
    if (rows.length >= 2 && rows[0].toLowerCase().includes("sku information")) { rows.shift(); ignoreFirstColumn = true; }
    const delimiter = rows[0].includes('\t') ? '\t' : ',';
    const splitRow = (r) => r.split(delimiter).map(c => {
        let val = c.trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/""/g, '"');
        return val;
    });
    let headers = [], bodyStartIndex = 1;
    if (mode === "2rows" && rows.length >= 2) {
        const r1 = splitRow(rows[0]), r2 = splitRow(rows[1]);
        headers = r1.map((h, i) => { const h1 = (h||"").trim(); const h2 = (r2[i]||"").trim(); return h2 ? h2 : h1; });
        bodyStartIndex = 2;
    } else { headers = splitRow(rows[0]); }
    let body = rows.slice(bodyStartIndex).map(r => splitRow(r));
    if (ignoreFirstColumn) { headers.shift(); body = body.map(r => r.slice(1)); }
    return { headers, body };
}

function autoCleanData(data) {
    if (!data || !data.body) return;
    const qtyIndices = data.headers.map((h, i) => /qty|quantity|total\s*qty/i.test(h) ? i : -1).filter(i => i !== -1);
    data.body = data.body.filter(row => {
        const hasContent = row.some(c => c && c.trim() !== "");
        if (!hasContent) return false;
        if (row.some(c => c.toString().includes("UPC"))) return false;
        for (let idx of qtyIndices) { if ((row[idx]||"").trim() === "" || (row[idx]||"").trim() === "0") return false; }
        return true;
    });
}

function renderPreviewTables() {
    const p = projects[activeProjectIdx];
    if(!p.dataA || !p.dataB) return;
    renderSinglePreview('previewTableA', 'countA', p.dataA, 'A', p.isLocked);
    renderSinglePreview('previewTableB', 'countB', p.dataB, 'B', false);
}
function renderSinglePreview(tableId, countId, data, side, isLocked) {
    const tbl = document.getElementById(tableId);
    document.getElementById(countId).innerText = data.body.length;
    let html = "<thead><tr><th>Action</th><th>#</th>" + data.headers.map(h => `<th>${h}</th>`).join('') + "</tr></thead><tbody>";
    data.body.forEach((row, i) => {
        const delBtn = isLocked ? `<span style="color:#cbd5e1;">🔒</span>` : `<button class="btn-del" onclick="deleteRow('${side}', ${i})">Del</button>`;
        html += `<tr><td>${delBtn}</td><td>${i+1}</td>` + row.map(c => `<td>${c}</td>`).join('') + "</tr>";
    });
    tbl.innerHTML = html + "</tbody>";
}
function deleteRow(side, idx) {
    const p = projects[activeProjectIdx];
    if(side === 'A') p.dataA.body.splice(idx, 1); else p.dataB.body.splice(idx, 1);
    renderPreviewTables();
}

// --- MATRIX & MAPPING ---

function autoParseMatrix() {
    const raw = document.getElementById("matrixRawInput").value;
    const list = document.getElementById("matrixList");
    list.innerHTML = "";
    if(!raw) return;
    const lines = raw.split(/\r?\n/);
    lines.forEach(l => {
        const parts = l.split("\t");
        if(parts.length > 0) {
            const k = parts[0].trim();
            const v = parts.length > 1 ? parts[1].trim() : "";
            if(k) addMatrixRow(k, v);
        }
    });
}
function addMatrixRow(key = "", val = "") {
    const div = document.createElement('div');
    div.className = 'matrix-row-item';
    div.innerHTML = `<input type="text" class="m-key" value="${key}" placeholder="Field"><input type="text" class="m-val" value="${val}" placeholder="Value"><button class="btn-x" onclick="this.parentElement.remove()">×</button>`;
    document.getElementById('matrixList').appendChild(div);
}
function getMatrixDataFromUI() {
    const rows = document.querySelectorAll('.matrix-row-item');
    const data = [];
    rows.forEach(r => { const k = r.querySelector('.m-key').value.trim(); const v = r.querySelector('.m-val').value.trim(); if(k) data.push({key: k, val: v}); });
    return data;
}
function toggleMatrix() {
    const s = document.getElementById('matrixSection');
    const btn = document.getElementById('btnToggleMatrix');
    if(s.style.display==='none') { s.style.display='block'; btn.innerText = "- Hide Matrix Rules"; }
    else { s.style.display='none'; btn.innerText = "+ Show Matrix Rules"; }
}

function goToMapping() {
    const p = projects[activeProjectIdx];
    const tbody = document.getElementById('mappingBody');
    tbody.innerHTML = "";
    const leftRows = [];
    p.dataA.headers.forEach((h, i) => { if (h && h.trim() !== "") leftRows.push({ type: 'source', name: h, val: i }); });
    p.matrix.forEach(m => leftRows.push({ type: 'matrix', name: m.key, val: m.key, display: m.val }));
    const rightOptions = p.dataB.headers.map((h, i) => ({ name: h, index: i }));

    leftRows.forEach(row => {
        let matchVal = "-1";
        const savedSession = p.mapping.find(m => {
             return (row.type === m.targetType && String(row.val) === String(m.targetVal));
        });
        if (savedSession) matchVal = savedSession.idxB;
        else {
            const memMatch = rightOptions.find(opt => {
                const saved = localStorage.getItem("map_" + opt.name);
                if (!saved) return false;
                const [sType, sVal] = saved.split(':');
                return (row.type === 'source' && sType === 'SRC' && sVal === row.name) || (row.type === 'matrix' && sType === 'MAT' && sVal === row.name);
            });
            if (memMatch) matchVal = memMatch.index;
            else { const match = rightOptions.find(t => t.name.toLowerCase() === row.name.toLowerCase()); if(match) matchVal = match.index; }
        }

        let opts = `<option value="-1">-- Ignore --</option>`;
        rightOptions.forEach(opt => {
            const sel = (opt.index === matchVal) ? "selected" : "";
            opts += `<option value="${opt.index}" ${sel}>${opt.name}</option>`;
        });
        const isChecked = matchVal !== "-1" ? "checked" : "";
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><b>${row.name}</b></td><td style="text-align:center">➔</td><td><select class="map-select" data-type="${row.type}" data-val="${row.val}" data-name="${row.name}">${opts}</select></td><td style="text-align:center"><input type="checkbox" class="map-check" ${isChecked}></td>`;
        tbody.appendChild(tr);
    });
    jumpToStep(3);
    updateMapStats();
}

function updateMapStats() {
    const p = projects[activeProjectIdx];
    const selectedIndices = new Set();
    document.querySelectorAll('.map-select').forEach((sel, i) => {
        if (document.querySelectorAll('.map-check')[i].checked && sel.value !== "-1") selectedIndices.add(parseInt(sel.value));
    });
    const unmapped = p.dataB.headers.filter((h, i) => !selectedIndices.has(i));
    const display = document.getElementById('unmappedList');
    if (unmapped.length === 0) { display.innerText = "All Mapped ✓"; display.style.background = "#d1fae5"; display.style.color = "#065f46"; }
    else { display.innerText = unmapped.join(", "); display.style.background = "#fee2e2"; display.style.color = "#b91c1c"; }
}

function generateResults() {
    const p = projects[activeProjectIdx];
    p.mapping = [];
    document.querySelectorAll('.map-select').forEach((sel, i) => {
        if (document.querySelectorAll('.map-check')[i].checked && sel.value !== "-1") {
            const targetIdx = parseInt(sel.value);
            const srcType = sel.getAttribute('data-type');
            const srcVal = sel.getAttribute('data-val');
            const srcName = sel.getAttribute('data-name');
            p.mapping.push({ name: p.dataB.headers[targetIdx], idxB: targetIdx, targetType: srcType, targetVal: (srcType === 'source' ? parseInt(srcVal) : srcVal) });
            localStorage.setItem("map_" + p.dataB.headers[targetIdx], `${srcType === 'source' ? 'SRC' : 'MAT'}:${(srcType === 'source' ? srcName : srcVal)}`);
        }
    });
    if(p.mapping.length === 0) { alert("Map at least one column."); return; }
    p.status = 'done'; p.step = 4;
    renderTopBar(); renderDashboard(); jumpToStep(4);
}

function renderDashboard() {
    const p = projects[activeProjectIdx];
    const maxRows = Math.max(p.dataA.body.length, p.dataB.body.length);
    let totalMatches = 0, totalMismatches = 0;
    const cardArea = document.getElementById('summaryCards');
    cardArea.innerHTML = "";
    
    // Add Validator Banner if needed
    if (p.isLocked) {
        const verifyPo = document.getElementById('validatorPoVerify').value.trim();
        const expectedPo = fetchedTruth ? fetchedTruth.poId : "N/A";
        let bannerHtml = "";
        
        if (verifyPo.toLowerCase() === expectedPo.toLowerCase()) {
            bannerHtml = `<div class="alert-box success"><strong>✅ PO Verified: ${expectedPo}</strong></div>`;
        } else {
            bannerHtml = `<div class="alert-box error"><strong>⛔ PO Mismatch!</strong> Expected: ${expectedPo}, Found: ${verifyPo}</div>`;
        }
        document.getElementById('validatorResultBanner').innerHTML = bannerHtml;
        document.getElementById('validatorResultBanner').style.display = 'block';
    } else {
        document.getElementById('validatorResultBanner').style.display = 'none';
    }

    p.mapping.forEach(map => {
        let match = 0, miss = 0;
        for(let i=0; i<maxRows; i++) {
            let vB = (p.dataB.body[i]?.[map.idxB] || "").trim();
            let vA = "";
            if(map.targetType === 'matrix') vA = p.matrix.find(m => m.key === map.targetVal)?.val || "";
            else vA = (p.dataA.body[i]?.[map.targetVal] || "").trim();
            
            const normA = String(vA).trim().toLowerCase();
            const normB = String(vB).trim().toLowerCase();
            let equal = false;
            if (/price|cost|retail/i.test(map.name)) equal = (normA.replace(/[$,\s]/g,'') === normB.replace(/[$,\s]/g,''));
            else if (/qty|quantity/i.test(map.name)) equal = (normA.replace(/[\,\s]/g,'') === normB.replace(/[\,\s]/g,''));
            else equal = (normA === normB);
            
            if(equal) match++; else miss++;
        }
        totalMatches += match; totalMismatches += miss;
        const cls = miss > 0 ? 'bg-warn' : 'bg-good';
        cardArea.innerHTML += `<div class="field-card ${cls}"><div class="fc-head">${map.name}</div><div class="fc-stats"><span class="fc-ok">✓ ${match}</span> <span class="fc-err">✗ ${miss}</span></div></div>`;
    });
    document.getElementById('globalStats').innerHTML = `<div class="big-stat blue"><div class="bs-val">${maxRows}</div><div class="bs-lbl">Rows</div></div><div class="big-stat green"><div class="bs-val">${totalMatches}</div><div class="bs-lbl">Matches</div></div><div class="big-stat red"><div class="bs-val">${totalMismatches}</div><div class="bs-lbl">Mismatches</div></div>`;
    renderResultTables(maxRows);
}

function renderResultTables(maxRows) {
    const p = projects[activeProjectIdx];
    const tA = document.getElementById('renderTableA'), tB = document.getElementById('renderTableB');
    let hA = "<thead><tr><th>#</th>" + p.dataA.headers.map(h=>`<th>${h}</th>`).join('') + "</tr></thead><tbody>";
    let hB = "<thead><tr><th>#</th>" + p.dataB.headers.map(h=>`<th>${h}</th>`).join('') + "</tr></thead><tbody>";
    let bA = "", bB = "";
    
    const mapLookup = {}; p.mapping.forEach(m => mapLookup[m.idxB] = m);
    
    for(let i=0; i<maxRows; i++) {
        let rA = `<td>${i+1}</td>`; p.dataA.body[i]?.forEach(c => rA += `<td>${c}</td>`); bA += `<tr>${rA}</tr>`;
        let rB = `<td>${i+1}</td>`;
        p.dataB.headers.forEach((_, colIdx) => {
            let val = (p.dataB.body[i]?.[colIdx] || "");
            let cls = "";
            if(mapLookup[colIdx]) {
                const map = mapLookup[colIdx];
                let vA = (map.targetType === 'matrix') ? (p.matrix.find(m => m.key === map.targetVal)?.val || "") : (p.dataA.body[i]?.[map.targetVal] || "");
                const normA = String(vA).trim().toLowerCase();
                const normB = String(val).trim().toLowerCase();
                let equal = false;
                if (/price|cost/i.test(map.name)) equal = (normA.replace(/[$,\s]/g,'') === normB.replace(/[$,\s]/g,''));
                else if (/qty/i.test(map.name)) equal = (normA.replace(/[\,\s]/g,'') === normB.replace(/[\,\s]/g,''));
                else equal = (normA === normB);
                cls = equal ? "match" : "diff";
            }
            rB += `<td class="${cls}">${val}</td>`;
        });
        bB += `<tr>${rB}</tr>`;
    }
    tA.innerHTML = hA + bA + "</tbody>"; tB.innerHTML = hB + bB + "</tbody>";
}

function showOverview() {
    saveCurrentViewToProject();
    isOverviewMode = true;
    document.getElementById('tabOverview').classList.add('active');
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.page-section').forEach(el => el.style.display = 'none');
    document.getElementById('overviewSection').style.display = 'block';
    
    let totalRows = 0, tbody = "";
    projects.forEach(p => {
        let rows = 0;
        if (p.step === 4 && p.mapping.length > 0) rows = Math.max(p.dataA.body.length, p.dataB.body.length);
        totalRows += rows;
        tbody += `<tr><td><strong>${p.name}</strong></td><td><span class="status-dot ${p.status}"></span> ${p.status}</td><td>${rows}</td><td>-</td><td>-</td><td><button onclick="switchProject(${projects.indexOf(p)})" class="btn-ghost">View</button></td></tr>`;
    });
    document.getElementById('overviewBody').innerHTML = tbody;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.querySelector('span').innerText = msg || "Action completed";
    t.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { t.classList.add('hidden'); }, 3000); 
}

function cleanAllSets() {
    saveCurrentViewToProject();
    let processed = 0;
    const modeA = document.getElementById('headerModeA').value || "1row";
    const modeB = document.getElementById('headerModeB').value || "1row";
    projects.forEach(p => {
        if(p.rawA && p.rawB) {
            p.dataA = parseExcelData(p.rawA, modeA); p.dataB = parseExcelData(p.rawB, modeB);
            if(p.dataA && p.dataB) { autoCleanData(p.dataA); autoCleanData(p.dataB); p.status = 'ready'; p.step = 2; processed++; }
        }
    });
    if(processed>0) { renderTopBar(); loadProjectIntoView(activeProjectIdx); alert(`Cleaned ${processed} sets.`); }
}

function runAllComparisons() {
    saveCurrentViewToProject();
    let processed = 0;
    const modeA = document.getElementById('headerModeA').value || "1row";
    const modeB = document.getElementById('headerModeB').value || "1row";
    projects.forEach(p => {
        if(p.rawA && p.rawB) {
             if(!p.dataA) p.dataA = parseExcelData(p.rawA, modeA);
             if(!p.dataB) p.dataB = parseExcelData(p.rawB, modeB);
             if(p.dataA && p.dataB) {
                 p.mapping = [];
                 const rightOptions = p.dataB.headers.map((h, i) => ({ name: h, index: i }));
                 const leftRows = [];
                 p.dataA.headers.forEach((h, i) => leftRows.push({type:'source', name:h, val:i}));
                 p.matrix.forEach(m => leftRows.push({type:'matrix', name:m.key, val:m.key}));
                 
                 leftRows.forEach(row => {
                     let matchVal = -1;
                     const memMatch = rightOptions.find(opt => {
                         const saved = localStorage.getItem("map_" + opt.name);
                         if (!saved) return false;
                         const [sType, sVal] = saved.split(':');
                         return (row.type === 'source' && sType === 'SRC' && sVal === row.name) || (row.type === 'matrix' && sType === 'MAT' && sVal === row.name);
                     });
                     if (memMatch) matchVal = memMatch.index;
                     else { const match = rightOptions.find(t => t.name.toLowerCase() === row.name.toLowerCase()); if(match) matchVal = match.index; }
                     
                     if(matchVal !== -1) {
                         p.mapping.push({ name: p.dataB.headers[matchVal], idxB: matchVal, targetType: row.type, targetVal: (row.type==='source'?row.val:row.name) });
                     }
                 });
                 p.status = 'done'; p.step = 4; processed++;
             }
        }
    });
    if(processed > 0) { renderTopBar(); showOverview(); } else { alert("No data to run."); }
}
