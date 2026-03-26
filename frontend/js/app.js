// ══════════════════════════════════════════════════
//  CAU AI Vision — Main Application Logic
// ══════════════════════════════════════════════════

// ── State ──────────────────────────────────────────
const state = {
    currentPage: 'dashboard',
    uploadedFile: null,
    originalDataUrl: null,
    classificationResult: null,
    segmentationResult: null,
    currentView: 'original',
    isLoading: { classify: false, segment: false },
    analysisCount: 0,
    totalTime: 0,
    zoomLevel: 1,
};

function getBackendUrl() {
    return localStorage.getItem('cau_backend_url') || 'http://localhost:8000';
}

// ══════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ══════════════════════════════════════════════════
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="material-symbols-outlined text-lg">${icons[type] || 'info'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4200);
}

// ══════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════
function navigateTo(page) {
    state.currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const el = document.getElementById('page-' + page);
    if (el) el.classList.remove('hidden');

    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.dataset.page === page) {
            link.className = 'nav-link flex items-center gap-3 px-6 py-3 bg-white/10 text-[#FD6B26] border-r-4 border-[#FD6B26] rounded-l-none font-headline font-semibold text-base';
        } else {
            link.className = 'nav-link flex items-center gap-3 px-6 py-3 text-blue-100/70 hover:text-white hover:bg-white/5 transition-all duration-300 font-headline font-semibold text-base';
        }
    });

    const titles = {
        dashboard: 'Dashboard', analysis: 'Biopsy Analysis', archive: 'Patient Archive',
        analytics: 'Analytics', research: 'Research', settings: 'Settings'
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    if (page === 'archive') loadArchive();
    if (page === 'analytics') loadAnalytics();
}

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => { e.preventDefault(); navigateTo(link.dataset.page); });
});

// ══════════════════════════════════════════════════
//  FILE UPLOAD
// ══════════════════════════════════════════════════
function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) processFile(file);
    else showToast('Please upload a PNG or JPG image', 'warning');
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
}

function processFile(file) {
    if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
        showToast('Invalid file type. Only PNG and JPG are supported.', 'error');
        return;
    }
    if (file.size > 50 * 1024 * 1024) {
        showToast('File too large. Maximum size is 50MB.', 'error');
        return;
    }
    state.uploadedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        state.originalDataUrl = e.target.result;
        showViewer();
        showToast('Image loaded: ' + file.name, 'success');
    };
    reader.readAsDataURL(file);
}

function showViewer() {
    document.getElementById('upload-zone').classList.add('hidden');
    document.getElementById('image-canvas').classList.remove('hidden');
    document.getElementById('viewer-toolbar').classList.remove('hidden');
    document.getElementById('viewer-img').src = state.originalDataUrl;
    state.zoomLevel = 1;
    document.getElementById('viewer-img').style.transform = '';
    document.getElementById('btn-classify').disabled = false;
    document.getElementById('btn-segment').disabled = false;
    document.getElementById('btn-both').disabled = false;
    loadPreprocessingPreview();
}

// ══════════════════════════════════════════════════
//  VIEW SWITCHING
// ══════════════════════════════════════════════════
function switchView(view) {
    state.currentView = view;
    const img = document.getElementById('viewer-img');
    if (!img) return;
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === view) btn.classList.add('active');
    });
    if (view === 'original') {
        img.src = state.originalDataUrl;
    } else if (view === 'mask' && state.segmentationResult) {
        img.src = 'data:image/png;base64,' + (state.segmentationResult.heatmap_base64 || state.segmentationResult.mask_base64);
    } else if (view === 'overlay' && state.segmentationResult) {
        img.src = 'data:image/png;base64,' + state.segmentationResult.overlay_base64;
    } else if (view !== 'original') {
        showToast('Run segmentation first to see this view', 'warning');
    }
}

// ══════════════════════════════════════════════════
//  ZOOM + SPLIT VIEW + FULLSCREEN
// ══════════════════════════════════════════════════
function zoomIn() { state.zoomLevel = Math.min(state.zoomLevel * 1.25, 5); applyZoom(); }
function zoomOut() { state.zoomLevel = Math.max(state.zoomLevel / 1.25, 0.5); applyZoom(); }
function resetZoom() { state.zoomLevel = 1; applyZoom(); }
function applyZoom() {
    const img = document.getElementById('viewer-img');
    if (img) img.style.transform = `scale(${state.zoomLevel})`;
}

let splitViewActive = false;
function toggleSplitView() {
    splitViewActive = !splitViewActive;
    const toggle = document.getElementById('split-toggle');
    const knob = document.getElementById('split-knob');
    const canvas = document.getElementById('image-canvas');
    if (splitViewActive) {
        toggle.classList.remove('bg-surface-container-high');
        toggle.classList.add('bg-secondary-container');
        knob.style.transform = 'translateX(24px)';
        if (state.segmentationResult) {
            canvas.innerHTML = `<div class="flex h-full w-full">
                <div class="flex-1 relative overflow-hidden border-r border-surface-container-high">
                    <img class="absolute inset-0 w-full h-full object-contain" src="${state.originalDataUrl}" alt="Original"/>
                    <div class="absolute bottom-2 left-2 bg-white/80 backdrop-blur px-2 py-0.5 rounded text-[10px] font-bold text-primary-container">Original</div>
                </div>
                <div class="flex-1 relative overflow-hidden">
                    <img class="absolute inset-0 w-full h-full object-contain" src="data:image/png;base64,${state.segmentationResult.overlay_base64}" alt="Segmentation"/>
                    <div class="absolute bottom-2 left-2 bg-white/80 backdrop-blur px-2 py-0.5 rounded text-[10px] font-bold text-primary-container">Segmentation</div>
                </div>
            </div>`;
        } else {
            showToast('Run segmentation first for split view', 'warning');
            splitViewActive = false;
        }
    } else {
        toggle.classList.add('bg-surface-container-high');
        toggle.classList.remove('bg-secondary-container');
        knob.style.transform = 'translateX(0)';
        canvas.innerHTML = `<img id="viewer-img" class="absolute inset-0 w-full h-full object-contain transition-transform duration-200" src="${state.originalDataUrl}" alt="Biopsy image"/>`;
        switchView(state.currentView);
    }
}

function toggleFullscreen() {
    const viewer = document.querySelector('#page-analysis .col-span-8 .glass-card');
    if (!document.fullscreenElement) viewer.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
}

// ══════════════════════════════════════════════════
//  API CALLS
// ══════════════════════════════════════════════════
async function runClassification() {
    if (!state.uploadedFile || state.isLoading.classify) return;
    state.isLoading.classify = true;
    document.getElementById('btn-classify').innerHTML = '<span class="spinner"></span> Classifying…';
    try {
        const form = new FormData();
        form.append('file', state.uploadedFile);
        const res = await fetch(getBackendUrl() + '/api/classify', { method: 'POST', body: form });
        if (!res.ok) throw new Error('Backend error: ' + res.status);
        const data = await res.json();
        state.classificationResult = data;
        renderClassification(data);
        showToast('Classification complete: Class ' + data.predicted_class, 'success');
    } catch (err) {
        showToast('Classification failed: ' + err.message, 'error');
    } finally {
        state.isLoading.classify = false;
        document.getElementById('btn-classify').innerHTML = '<span class="material-symbols-outlined text-lg">category</span> Run Classification';
    }
}

async function runSegmentation() {
    if (!state.uploadedFile || state.isLoading.segment) return;
    state.isLoading.segment = true;
    document.getElementById('btn-segment').innerHTML = '<span class="spinner"></span> Segmenting…';
    try {
        const form = new FormData();
        form.append('file', state.uploadedFile);
        const res = await fetch(getBackendUrl() + '/api/segment', { method: 'POST', body: form });
        if (!res.ok) throw new Error('Backend error: ' + res.status);
        const data = await res.json();
        state.segmentationResult = data;
        renderSegmentation(data);
        showToast('Segmentation complete: ROI ' + data.region_percentage + '%', 'success');
    } catch (err) {
        showToast('Segmentation failed: ' + err.message, 'error');
    } finally {
        state.isLoading.segment = false;
        document.getElementById('btn-segment').innerHTML = '<span class="material-symbols-outlined text-lg">texture</span> Run Segmentation';
    }
}

async function runBoth() {
    if (!state.uploadedFile) return;
    state.isLoading.classify = true;
    state.isLoading.segment = true;
    document.getElementById('btn-both').innerHTML = '<span class="spinner"></span> Analyzing…';
    try {
        const form = new FormData();
        form.append('file', state.uploadedFile);
        const res = await fetch(getBackendUrl() + '/api/analyze', { method: 'POST', body: form });
        if (!res.ok) throw new Error('Backend error: ' + res.status);
        const data = await res.json();
        state.classificationResult = data.classification;
        state.segmentationResult = data.segmentation;
        renderClassification(data.classification);
        renderSegmentation(data.segmentation);
        const totalMs = data.classification.inference_time_ms + data.segmentation.inference_time_ms;
        state.analysisCount++;
        state.totalTime += totalMs;
        updateDashStats();
        saveToHistory(data);
        switchView('overlay');
        showToast('Analysis complete — Class ' + data.classification.predicted_class + ' (' + (data.classification.confidence * 100).toFixed(1) + '%)', 'success');
    } catch (err) {
        showToast('Analysis failed: ' + err.message, 'error');
    } finally {
        state.isLoading.classify = false;
        state.isLoading.segment = false;
        document.getElementById('btn-both').innerHTML = '<span class="material-symbols-outlined text-lg">play_arrow</span> Analyze (Both)';
    }
}

// ══════════════════════════════════════════════════
//  RENDER RESULTS
// ══════════════════════════════════════════════════
function renderClassification(data) {
    document.getElementById('card-classification').classList.remove('hidden');
    document.getElementById('cls-result-label').textContent = 'Class ' + data.predicted_class;
    const pct = Math.round(data.confidence * 100);
    document.getElementById('cls-result-conf').textContent = 'Confidence: ' + (data.confidence * 100).toFixed(1) + '%';
    document.getElementById('cls-donut').setAttribute('stroke-dasharray', pct + ', 100');
    document.getElementById('cls-donut-pct').textContent = pct + '%';

    document.getElementById('card-probabilities').classList.remove('hidden');
    const container = document.getElementById('prob-bars');
    container.innerHTML = '';
    const sorted = Object.entries(data.probabilities).map(([k, v]) => [parseInt(k), v]).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([cls, prob], idx) => {
        const pctVal = (prob * 100).toFixed(1);
        const barColor = idx === 0 ? 'bg-secondary-container' : 'bg-primary-container opacity-30';
        container.innerHTML += `<div class="space-y-1.5"><div class="flex justify-between text-[10px] font-semibold text-primary-container"><span>Class ${cls}</span><span>${pctVal}%</span></div><div class="w-full h-2 bg-surface-container-low rounded-full overflow-hidden"><div class="h-full ${barColor} rounded-full transition-all duration-500" style="width: ${Math.max(prob * 100, 0.5)}%;"></div></div></div>`;
    });

    // Highlight reference atlas
    document.querySelectorAll('.atlas-cell').forEach(cell => {
        cell.classList.remove('ring-2', 'ring-secondary-container');
        if (parseInt(cell.dataset.cls) === data.predicted_class) {
            cell.classList.add('ring-2', 'ring-secondary-container');
        }
    });

    document.getElementById('fab-export').classList.remove('hidden');
}

function renderSegmentation(data) {
    document.getElementById('card-segmentation').classList.remove('hidden');
    document.getElementById('seg-roi').textContent = data.region_percentage + '%';
    document.getElementById('seg-time').textContent = data.inference_time_ms + 'ms';
    // Extended morphology
    const di = document.getElementById('seg-density');
    const bc = document.getElementById('seg-boundary');
    const rc = document.getElementById('seg-regions');
    if (di) di.textContent = data.density_index !== undefined ? data.density_index : '—';
    if (bc) bc.textContent = data.boundary_complexity !== undefined ? data.boundary_complexity : '—';
    if (rc) rc.textContent = data.region_count !== undefined ? data.region_count : '—';
    document.getElementById('fab-export').classList.remove('hidden');
}

// ══════════════════════════════════════════════════
//  CLEAR / NEW ANALYSIS
// ══════════════════════════════════════════════════
function clearAnalysis() {
    state.uploadedFile = null;
    state.originalDataUrl = null;
    state.classificationResult = null;
    state.segmentationResult = null;
    state.currentView = 'original';
    state.zoomLevel = 1;
    splitViewActive = false;
    document.getElementById('upload-zone').classList.remove('hidden');
    document.getElementById('image-canvas').classList.add('hidden');
    document.getElementById('viewer-toolbar').classList.add('hidden');
    const img = document.getElementById('viewer-img');
    if (img) { img.src = ''; img.style.transform = ''; }
    document.getElementById('card-classification').classList.add('hidden');
    document.getElementById('card-probabilities').classList.add('hidden');
    document.getElementById('card-segmentation').classList.add('hidden');
    document.getElementById('fab-export').classList.add('hidden');
    const prepCard = document.getElementById('card-preprocessing');
    if (prepCard) prepCard.classList.add('hidden');
    closeQueue();
    document.getElementById('btn-classify').disabled = true;
    document.getElementById('btn-segment').disabled = true;
    document.getElementById('btn-both').disabled = true;
    document.getElementById('file-input').value = '';
    document.querySelectorAll('.atlas-cell').forEach(c => c.classList.remove('ring-2', 'ring-secondary-container'));
}

function newAnalysis() { clearAnalysis(); navigateTo('analysis'); }

// ══════════════════════════════════════════════════
//  EXPORT — JSON
// ══════════════════════════════════════════════════
function exportResults() {
    const exportData = {
        timestamp: new Date().toISOString(),
        filename: state.uploadedFile ? state.uploadedFile.name : null,
        classification: state.classificationResult,
        segmentation: state.segmentationResult ? { region_percentage: state.segmentationResult.region_percentage, inference_time_ms: state.segmentationResult.inference_time_ms } : null,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analysis_' + (state.uploadedFile ? state.uploadedFile.name.replace(/\.\w+$/, '') : 'result') + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON report exported', 'success');
}

// ══════════════════════════════════════════════════
//  EXPORT — PDF (jsPDF)
// ══════════════════════════════════════════════════
async function exportPDF() {
    if (!window.jspdf) {
        showToast('PDF library not loaded. Retrying…', 'warning');
        // Try loading dynamically
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js';
        s.onload = () => exportPDF();
        document.head.appendChild(s);
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const w = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(5, 22, 78);
    doc.rect(0, 0, w, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('CAU AI Vision — Analysis Report', 14, 20);

    doc.setTextColor(25, 28, 30);
    let y = 40;

    // File info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('File: ' + (state.uploadedFile ? state.uploadedFile.name : 'N/A'), 14, y);
    doc.text('Date: ' + new Date().toLocaleString(), 14, y + 6);
    y += 14;

    // Images row — original + overlay side by side
    try {
        if (state.originalDataUrl) {
            doc.addImage(state.originalDataUrl, 'JPEG', 14, y, 55, 55);
        }
        if (state.segmentationResult && state.segmentationResult.overlay_base64) {
            doc.addImage('data:image/png;base64,' + state.segmentationResult.overlay_base64, 'PNG', 75, y, 55, 55);
        }
        // Labels under images
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        if (state.originalDataUrl) doc.text('Original', 30, y + 58);
        if (state.segmentationResult) doc.text('Segmentation Overlay', 85, y + 58);
        y += 64;
    } catch (e) { y += 4; }

    doc.setTextColor(25, 28, 30);

    // Classification
    if (state.classificationResult) {
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Classification Result', 14, y);
        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Predicted Class: ' + state.classificationResult.predicted_class, 14, y);
        doc.text('Confidence: ' + (state.classificationResult.confidence * 100).toFixed(1) + '%', 100, y);
        y += 8;
        doc.text('Inference Time: ' + state.classificationResult.inference_time_ms + 'ms', 14, y);
        y += 10;

        // Probabilities
        doc.setFontSize(9);
        const sorted = Object.entries(state.classificationResult.probabilities).map(([k, v]) => [parseInt(k), v]).sort((a, b) => b[1] - a[1]);
        sorted.forEach(([cls, prob]) => {
            const pct = (prob * 100).toFixed(1);
            doc.text('Class ' + cls + ': ' + pct + '%', 14, y);
            // Bar
            doc.setFillColor(230, 232, 234);
            doc.rect(55, y - 3, 80, 4, 'F');
            doc.setFillColor(cls === state.classificationResult.predicted_class ? 253 : 5, cls === state.classificationResult.predicted_class ? 107 : 22, cls === state.classificationResult.predicted_class ? 38 : 78);
            doc.rect(55, y - 3, Math.max(prob * 80, 0.5), 4, 'F');
            y += 6;
        });
        y += 6;
    }

    // Segmentation
    if (state.segmentationResult) {
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Segmentation Result', 14, y);
        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Region of Interest: ' + state.segmentationResult.region_percentage + '%', 14, y);
        doc.text('Inference Time: ' + state.segmentationResult.inference_time_ms + 'ms', 100, y);
        y += 6;
        if (state.segmentationResult.density_index !== undefined) {
            doc.text('Density Index: ' + state.segmentationResult.density_index, 14, y);
            doc.text('Boundary Complexity: ' + state.segmentationResult.boundary_complexity, 100, y);
            y += 6;
            doc.text('Region Count: ' + state.segmentationResult.region_count, 14, y);
            y += 10;
        }
    }

    // Disclaimer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('For research and demonstration purposes only. Not for clinical use.', 14, 285);
    doc.text('CAU AI Vision Dashboard — AI in Healthcare Hackathon 2026', 14, 289);

    doc.save('report_' + (state.uploadedFile ? state.uploadedFile.name.replace(/\.\w+$/, '') : 'analysis') + '.pdf');
    showToast('PDF report exported', 'success');
}

// ══════════════════════════════════════════════════
//  BATCH PROCESSING
// ══════════════════════════════════════════════════
function openBatchModal() {
    document.getElementById('batch-modal').classList.remove('hidden');
}
function closeBatchModal() {
    document.getElementById('batch-modal').classList.add('hidden');
    document.getElementById('batch-progress-wrap').classList.add('hidden');
    document.getElementById('batch-result').classList.add('hidden');
}

async function runBatchClassify() {
    const input = document.getElementById('batch-cls-input');
    const files = input.files;
    if (!files || files.length === 0) { showToast('Select a folder with test images', 'warning'); return; }
    document.getElementById('batch-progress-wrap').classList.remove('hidden');
    document.getElementById('batch-result').classList.add('hidden');
    document.getElementById('batch-status').textContent = `Classifying ${files.length} images…`;
    document.getElementById('batch-progress').style.width = '10%';

    try {
        const form = new FormData();
        for (const f of files) {
            if (f.type.startsWith('image/')) form.append('files', f);
        }
        document.getElementById('batch-progress').style.width = '50%';
        const res = await fetch(getBackendUrl() + '/api/batch-classify', { method: 'POST', body: form });
        if (!res.ok) throw new Error('Server error: ' + res.status);
        document.getElementById('batch-progress').style.width = '90%';
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'test_ground_truth.xlsx'; a.click();
        URL.revokeObjectURL(url);
        document.getElementById('batch-progress').style.width = '100%';
        document.getElementById('batch-result').classList.remove('hidden');
        document.getElementById('batch-result').textContent = `Done! ${files.length} images classified. Excel downloaded.`;
        showToast('Batch classification complete — Excel downloaded', 'success');
    } catch (err) {
        showToast('Batch classification failed: ' + err.message, 'error');
    }
}

async function runBatchSegment() {
    const input = document.getElementById('batch-seg-input');
    const files = input.files;
    if (!files || files.length === 0) { showToast('Select a folder with test images', 'warning'); return; }
    document.getElementById('batch-progress-wrap').classList.remove('hidden');
    document.getElementById('batch-result').classList.add('hidden');
    document.getElementById('batch-status').textContent = `Segmenting ${files.length} images…`;
    document.getElementById('batch-progress').style.width = '10%';

    try {
        const form = new FormData();
        for (const f of files) {
            if (f.type.startsWith('image/')) form.append('files', f);
        }
        document.getElementById('batch-progress').style.width = '50%';
        const res = await fetch(getBackendUrl() + '/api/batch-segment', { method: 'POST', body: form });
        if (!res.ok) throw new Error('Server error: ' + res.status);
        document.getElementById('batch-progress').style.width = '90%';
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'masks.zip'; a.click();
        URL.revokeObjectURL(url);
        document.getElementById('batch-progress').style.width = '100%';
        document.getElementById('batch-result').classList.remove('hidden');
        document.getElementById('batch-result').textContent = `Done! ${files.length} masks generated. ZIP downloaded.`;
        showToast('Batch segmentation complete — ZIP downloaded', 'success');
    } catch (err) {
        showToast('Batch segmentation failed: ' + err.message, 'error');
    }
}

// ══════════════════════════════════════════════════
//  HISTORY / ARCHIVE
// ══════════════════════════════════════════════════
function saveToHistory(data) {
    const hist = JSON.parse(localStorage.getItem('cau_history') || '[]');
    const entry = {
        timestamp: new Date().toISOString(),
        filename: state.uploadedFile ? state.uploadedFile.name : 'unknown',
        predicted_class: data.classification.predicted_class,
        confidence: data.classification.confidence,
        region_percentage: data.segmentation.region_percentage,
        cls_time: data.classification.inference_time_ms,
        seg_time: data.segmentation.inference_time_ms,
        image: state.originalDataUrl || '',
    };
    hist.unshift(entry);
    if (hist.length > 10) hist.pop(); // keep 10 to avoid localStorage overflow with full images
    try {
        localStorage.setItem('cau_history', JSON.stringify(hist));
    } catch (e) {
        // If localStorage is full, remove image data and retry
        entry.image = '';
        hist[0] = entry;
        localStorage.setItem('cau_history', JSON.stringify(hist));
    }
}

function loadArchive() {
    compareSelected = new Set();
    const btn = document.getElementById('compare-btn');
    if (btn) btn.classList.add('hidden');
    const hist = JSON.parse(localStorage.getItem('cau_history') || '[]');
    const container = document.getElementById('archive-list');
    document.getElementById('archive-total').textContent = hist.length;
    document.getElementById('archive-cls-count').textContent = hist.length;
    document.getElementById('archive-count-badge').textContent = hist.length + ' records';
    if (hist.length > 0) {
        document.getElementById('archive-avg-conf').textContent = (hist.reduce((s, h) => s + h.confidence, 0) / hist.length * 100).toFixed(1) + '%';
        document.getElementById('archive-avg-roi').textContent = (hist.reduce((s, h) => s + h.region_percentage, 0) / hist.length).toFixed(1) + '%';
    } else {
        document.getElementById('archive-avg-conf').textContent = '—';
        document.getElementById('archive-avg-roi').textContent = '—';
    }
    if (hist.length === 0) {
        container.innerHTML = `<div class="p-12 text-center text-on-surface-variant/50"><span class="material-symbols-outlined text-4xl mb-2 block">inbox</span><p class="text-sm">No patient records yet.</p></div>`;
        return;
    }
    container.innerHTML = hist.map((h, i) => {
        const confColor = h.confidence > 0.8 ? 'text-green-600' : h.confidence > 0.5 ? 'text-yellow-600' : 'text-red-500';
        const imgSrc = h.image || h.thumbnail || '';
        const thumbHtml = imgSrc
            ? `<img src="${imgSrc}" class="w-10 h-10 rounded-lg object-cover cursor-pointer hover:ring-2 hover:ring-secondary-container transition-all" alt="thumb" onclick="openImageViewer(this.src)"/>`
            : `<div class="w-10 h-10 rounded-lg bg-primary-container/10 flex items-center justify-center"><span class="material-symbols-outlined text-primary-container text-sm">image</span></div>`;
        return `<div class="flex items-center gap-4 px-6 py-3 hover:bg-surface-container-low/50 transition-all">
            <input type="checkbox" class="compare-cb accent-[#fd6b26] w-4 h-4 cursor-pointer shrink-0" onchange="toggleCompareSelect(${i})"/>
            <div class="text-[10px] font-bold text-on-surface-variant/50 w-8 shrink-0">#${String(i + 1).padStart(3, '0')}</div>
            <div class="shrink-0">${thumbHtml}</div>
            <div class="flex-1 min-w-0">
                <div class="text-xs font-semibold text-primary-container truncate">${h.filename}</div>
                <div class="text-[10px] text-on-surface-variant">${new Date(h.timestamp).toLocaleString()}</div>
            </div>
            <div class="text-center px-2"><span class="text-xs font-extrabold text-primary-container bg-surface-container-low px-2 py-0.5 rounded-full">Class ${h.predicted_class}</span></div>
            <div class="text-center px-2"><span class="text-xs font-bold ${confColor}">${(h.confidence * 100).toFixed(1)}%</span></div>
            <div class="text-center px-2"><span class="text-xs font-semibold text-primary-container">${h.region_percentage}%</span><div class="text-[10px] text-on-surface-variant">ROI</div></div>
            <div class="text-center px-2"><span class="text-[10px] text-on-surface-variant">${(h.cls_time + h.seg_time).toFixed(0)}ms</span></div>
        </div>`;
    }).join('');
}

function clearHistory() {
    if (confirm('Clear all patient records?')) {
        localStorage.removeItem('cau_history');
        loadArchive();
        showToast('History cleared', 'info');
    }
}

// ══════════════════════════════════════════════════
//  PREPROCESSING PREVIEW
// ══════════════════════════════════════════════════
async function loadPreprocessingPreview() {
    if (!state.uploadedFile) return;
    const card = document.getElementById('card-preprocessing');
    if (!card) return;
    card.classList.remove('hidden');
    document.getElementById('preprocess-content').innerHTML = '<div class="text-center py-2"><span class="spinner"></span></div>';

    try {
        const form = new FormData();
        form.append('file', state.uploadedFile);
        const res = await fetch(getBackendUrl() + '/api/preprocess-preview', { method: 'POST', body: form });
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        document.getElementById('preprocess-content').innerHTML = `
            <div class="grid grid-cols-3 gap-2">
                <div class="text-center">
                    <img src="data:image/png;base64,${data.resized_base64}" class="w-full rounded-lg border border-surface-container-high" alt="Resized"/>
                    <div class="text-[9px] font-bold text-on-surface-variant uppercase mt-1">Resized (224x224)</div>
                </div>
                <div class="text-center">
                    <img src="data:image/png;base64,${data.normalized_base64}" class="w-full rounded-lg border border-surface-container-high" alt="Normalized"/>
                    <div class="text-[9px] font-bold text-on-surface-variant uppercase mt-1">Normalized</div>
                </div>
                <div class="text-center">
                    <img src="data:image/png;base64,${data.grayscale_base64}" class="w-full rounded-lg border border-surface-container-high" alt="Grayscale"/>
                    <div class="text-[9px] font-bold text-on-surface-variant uppercase mt-1">Grayscale</div>
                </div>
            </div>
            <div class="text-[9px] text-on-surface-variant mt-2">Original: ${data.original_size} → Model input: 224x224</div>`;
    } catch (err) {
        document.getElementById('preprocess-content').innerHTML = '<p class="text-[10px] text-on-surface-variant">Preview unavailable</p>';
    }
}

// ══════════════════════════════════════════════════
//  MULTI-IMAGE QUEUE
// ══════════════════════════════════════════════════
let imageQueue = [];
let queueProcessing = false;

function handleMultiFileSelect(e) {
    const files = Array.from(e.target.files).filter(f => f.type.match(/^image\/(png|jpeg|jpg)$/));
    if (files.length === 0) { showToast('No valid images selected', 'warning'); return; }
    if (files.length === 1) { processFile(files[0]); return; }

    imageQueue = files.map(f => ({ file: f, status: 'pending' }));
    showQueuePanel();
}

function handleMultiDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) { showToast('No valid images', 'warning'); return; }
    if (files.length === 1) { processFile(files[0]); return; }

    imageQueue = files.map(f => ({ file: f, status: 'pending' }));
    showQueuePanel();
}

function showQueuePanel() {
    const panel = document.getElementById('queue-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    document.getElementById('upload-zone').classList.add('hidden');
    renderQueue();
}

function renderQueue() {
    const list = document.getElementById('queue-list');
    if (!list) return;
    list.innerHTML = imageQueue.map((item, i) => {
        const icon = item.status === 'done' ? '<span class="material-symbols-outlined text-green-600 text-sm">check_circle</span>'
            : item.status === 'processing' ? '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>'
            : '<span class="material-symbols-outlined text-on-surface-variant/40 text-sm">schedule</span>';
        const cls = item.result ? 'Class ' + item.result.classification.predicted_class : '';
        return `<div class="flex items-center gap-3 py-1.5">
            ${icon}
            <span class="text-xs text-on-surface-variant flex-1 truncate">${item.file.name}</span>
            <span class="text-[10px] font-bold text-primary-container">${cls}</span>
        </div>`;
    }).join('');
    const done = imageQueue.filter(i => i.status === 'done').length;
    document.getElementById('queue-progress-text').textContent = done + '/' + imageQueue.length;
}

async function processQueue() {
    if (queueProcessing) return;
    queueProcessing = true;
    document.getElementById('queue-start-btn').disabled = true;

    for (let i = 0; i < imageQueue.length; i++) {
        if (imageQueue[i].status === 'done') continue;
        imageQueue[i].status = 'processing';
        renderQueue();

        try {
            const form = new FormData();
            form.append('file', imageQueue[i].file);
            const res = await fetch(getBackendUrl() + '/api/analyze', { method: 'POST', body: form });
            if (!res.ok) throw new Error(res.status);
            const data = await res.json();
            imageQueue[i].status = 'done';
            imageQueue[i].result = data;

            // Save to history and show results
            state.uploadedFile = imageQueue[i].file;
            state.classificationResult = data.classification;
            state.segmentationResult = data.segmentation;

            // Read file for display + history
            await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    state.originalDataUrl = ev.target.result;
                    saveToHistory(data);
                    resolve();
                };
                reader.readAsDataURL(imageQueue[i].file);
            });
        } catch (err) {
            imageQueue[i].status = 'done';
            showToast('Failed: ' + imageQueue[i].file.name, 'error');
        }
        renderQueue();
    }

    queueProcessing = false;
    document.getElementById('queue-start-btn').disabled = false;

    // Show last analyzed result in viewer
    const lastDone = [...imageQueue].reverse().find(i => i.result);
    if (lastDone && state.originalDataUrl) {
        document.getElementById('queue-panel').classList.add('hidden');
        document.getElementById('image-canvas').classList.remove('hidden');
        document.getElementById('viewer-toolbar').classList.remove('hidden');
        document.getElementById('viewer-img').src = state.originalDataUrl;
        document.getElementById('btn-classify').disabled = false;
        document.getElementById('btn-segment').disabled = false;
        document.getElementById('btn-both').disabled = false;
        renderClassification(state.classificationResult);
        renderSegmentation(state.segmentationResult);
        switchView('overlay');
        loadPreprocessingPreview();
    }

    showToast('Queue complete — ' + imageQueue.filter(i => i.result).length + ' images analyzed', 'success');
}

function closeQueue() {
    imageQueue = [];
    queueProcessing = false;
    const panel = document.getElementById('queue-panel');
    if (panel) panel.classList.add('hidden');
    document.getElementById('upload-zone').classList.remove('hidden');
}

// ══════════════════════════════════════════════════
//  SIDE-BY-SIDE COMPARISON (Patient Archive)
// ══════════════════════════════════════════════════
let compareSelected = new Set();

function toggleCompareSelect(index) {
    if (compareSelected.has(index)) {
        compareSelected.delete(index);
    } else {
        if (compareSelected.size >= 3) {
            showToast('Maximum 3 records for comparison', 'warning');
            return;
        }
        compareSelected.add(index);
    }
    // Update checkbox UI
    document.querySelectorAll('.compare-cb').forEach((cb, i) => {
        cb.checked = compareSelected.has(i);
    });
    // Show/hide compare button
    const btn = document.getElementById('compare-btn');
    if (btn) btn.classList.toggle('hidden', compareSelected.size < 2);
}

function openCompareModal() {
    const hist = JSON.parse(localStorage.getItem('cau_history') || '[]');
    const selected = Array.from(compareSelected).map(i => hist[i]).filter(Boolean);
    if (selected.length < 2) { showToast('Select at least 2 records', 'warning'); return; }

    const modal = document.getElementById('compare-modal');
    const content = document.getElementById('compare-content');
    content.innerHTML = `<div class="flex gap-4 overflow-x-auto">
        ${selected.map(h => {
            const imgHtml = h.image ? `<img src="${h.image}" class="w-full h-40 object-cover rounded-lg mb-3" alt="${h.filename}"/>` : '<div class="w-full h-40 bg-surface-container-low rounded-lg mb-3 flex items-center justify-center"><span class="material-symbols-outlined text-3xl text-on-surface-variant/30">image</span></div>';
            return `<div class="flex-1 min-w-[200px] p-4 glass-card border border-white rounded-xl">
                ${imgHtml}
                <div class="text-sm font-bold text-primary-container truncate mb-1">${h.filename}</div>
                <div class="text-[10px] text-on-surface-variant mb-3">${new Date(h.timestamp).toLocaleString()}</div>
                <div class="space-y-2">
                    <div class="flex justify-between text-xs"><span class="text-on-surface-variant">Class</span><span class="font-extrabold text-primary-container">${h.predicted_class}</span></div>
                    <div class="flex justify-between text-xs"><span class="text-on-surface-variant">Confidence</span><span class="font-bold ${h.confidence > 0.8 ? 'text-green-600' : h.confidence > 0.5 ? 'text-yellow-600' : 'text-red-500'}">${(h.confidence * 100).toFixed(1)}%</span></div>
                    <div class="flex justify-between text-xs"><span class="text-on-surface-variant">ROI</span><span class="font-bold text-primary-container">${h.region_percentage}%</span></div>
                    <div class="flex justify-between text-xs"><span class="text-on-surface-variant">Time</span><span class="text-on-surface-variant">${(h.cls_time + h.seg_time).toFixed(0)}ms</span></div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
    modal.classList.remove('hidden');
}

function closeCompareModal() {
    document.getElementById('compare-modal').classList.add('hidden');
}

// ══════════════════════════════════════════════════
//  IMAGE VIEWER MODAL (Patient Archive)
// ══════════════════════════════════════════════════
let viewerZoom = 1;

function openImageViewer(src) {
    viewerZoom = 1;
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('image-viewer-img');
    img.src = src;
    img.style.transform = 'scale(1)';
    img.style.imageRendering = 'auto';
    document.getElementById('viewer-zoom-label').textContent = '100%';
    modal.classList.remove('hidden');
}

function closeImageViewer() {
    document.getElementById('image-viewer-modal').classList.add('hidden');
}

function viewerZoomIn() {
    viewerZoom = Math.min(viewerZoom * 1.3, 10);
    document.getElementById('image-viewer-img').style.transform = `scale(${viewerZoom})`;
    document.getElementById('viewer-zoom-label').textContent = Math.round(viewerZoom * 100) + '%';
}

function viewerZoomOut() {
    viewerZoom = Math.max(viewerZoom / 1.3, 0.3);
    document.getElementById('image-viewer-img').style.transform = `scale(${viewerZoom})`;
    document.getElementById('viewer-zoom-label').textContent = Math.round(viewerZoom * 100) + '%';
}

function viewerResetZoom() {
    viewerZoom = 1;
    document.getElementById('image-viewer-img').style.transform = 'scale(1)';
    document.getElementById('viewer-zoom-label').textContent = '100%';
}

// ══════════════════════════════════════════════════
//  ANALYTICS
// ══════════════════════════════════════════════════
function loadAnalytics() {
    const hist = JSON.parse(localStorage.getItem('cau_history') || '[]');
    document.getElementById('analytics-total').textContent = hist.length;
    if (hist.length === 0) {
        document.getElementById('analytics-class-empty').classList.remove('hidden');
        document.getElementById('analytics-class-bars').innerHTML = '';
        ['analytics-avg-cls-time','analytics-avg-seg-time','analytics-roi-min','analytics-roi-avg','analytics-roi-max'].forEach(id => { const el = document.getElementById(id); if(el) el.textContent = '—'; });
        document.getElementById('analytics-timeline').innerHTML = '<div class="text-center text-on-surface-variant/50 py-4"><p class="text-sm">No activity yet.</p></div>';
        return;
    }
    document.getElementById('analytics-class-empty').classList.add('hidden');

    const classCounts = {};
    for (let i = 0; i < 12; i++) classCounts[i] = 0;
    hist.forEach(h => classCounts[h.predicted_class]++);
    const maxCount = Math.max(...Object.values(classCounts), 1);
    document.getElementById('analytics-class-bars').innerHTML = Object.entries(classCounts).map(([cls, count]) => {
        const pct = (count / maxCount) * 100;
        const barColor = count === maxCount && count > 0 ? 'bg-secondary-container' : 'bg-primary-container opacity-30';
        return `<div class="space-y-1"><div class="flex justify-between text-[10px] font-semibold text-primary-container"><span>Class ${cls}</span><span>${count}</span></div><div class="w-full h-2 bg-surface-container-low rounded-full overflow-hidden"><div class="h-full ${barColor} rounded-full transition-all duration-500" style="width: ${Math.max(pct, count > 0 ? 2 : 0)}%;"></div></div></div>`;
    }).join('');

    document.getElementById('analytics-avg-cls-time').textContent = (hist.reduce((s, h) => s + h.cls_time, 0) / hist.length).toFixed(1) + 'ms';
    document.getElementById('analytics-avg-seg-time').textContent = (hist.reduce((s, h) => s + h.seg_time, 0) / hist.length).toFixed(1) + 'ms';

    let high = 0, med = 0, low = 0;
    hist.forEach(h => { if (h.confidence > 0.8) high++; else if (h.confidence > 0.5) med++; else low++; });
    const total = hist.length;
    document.getElementById('analytics-conf-high').textContent = high;
    document.getElementById('analytics-conf-med').textContent = med;
    document.getElementById('analytics-conf-low').textContent = low;
    document.getElementById('analytics-conf-high-bar').style.width = (high / total * 100) + '%';
    document.getElementById('analytics-conf-med-bar').style.width = (med / total * 100) + '%';
    document.getElementById('analytics-conf-low-bar').style.width = (low / total * 100) + '%';

    const rois = hist.map(h => h.region_percentage);
    document.getElementById('analytics-roi-min').textContent = Math.min(...rois).toFixed(1) + '%';
    document.getElementById('analytics-roi-avg').textContent = (rois.reduce((a, b) => a + b, 0) / rois.length).toFixed(1) + '%';
    document.getElementById('analytics-roi-max').textContent = Math.max(...rois).toFixed(1) + '%';

    document.getElementById('analytics-timeline').innerHTML = hist.slice(0, 10).map(h => `
        <div class="flex items-center gap-3"><div class="w-2 h-2 rounded-full bg-secondary-container shrink-0"></div>
        <div class="flex-1 flex justify-between items-center"><span class="text-[10px] text-on-surface-variant"><strong class="text-primary-container">${h.filename}</strong> — Class ${h.predicted_class} (${(h.confidence * 100).toFixed(0)}%)</span>
        <span class="text-[10px] text-on-surface-variant/50">${new Date(h.timestamp).toLocaleTimeString()}</span></div></div>`).join('');
}

// ══════════════════════════════════════════════════
//  DATASET VERIFICATION
// ══════════════════════════════════════════════════
const EXPECTED_COUNTS = {
    'classification/train/0': 571, 'classification/train/1': 974, 'classification/train/2': 1043,
    'classification/train/3': 750, 'classification/train/4': 814, 'classification/train/5': 441,
    'classification/train/6': 545, 'classification/train/7': 2136, 'classification/train/8': 331,
    'classification/train/9': 1111, 'classification/train/10': 899, 'classification/train/11': 1796,
    'classification/test': 1276,
    'segmentation/training/images': 1800, 'segmentation/training/masks': 1800,
    'segmentation/validation/images': 400, 'segmentation/validation/masks': 400,
    'segmentation/testing/images': 200,
};

function verifyDataset() {
    const input = document.getElementById('dataset-folder-input');
    const files = input.files;
    if (!files || files.length === 0) { showToast('Select the dataset root folder', 'warning'); return; }

    const counts = {};
    for (const f of files) {
        const path = f.webkitRelativePath;
        const parts = path.split('/');
        // Try to match known folder patterns
        for (const expected of Object.keys(EXPECTED_COUNTS)) {
            const expectedParts = expected.split('/');
            // Check if the file's path contains this folder structure
            const idx = parts.findIndex((p, i) => {
                return expectedParts.every((ep, j) => parts[i + j] === ep);
            });
            if (idx >= 0) {
                // File is inside this expected folder (should be at depth expectedParts.length after idx)
                const remaining = parts.slice(idx + expectedParts.length);
                if (remaining.length === 1 && f.name.match(/\.(png|jpg|jpeg)$/i)) {
                    counts[expected] = (counts[expected] || 0) + 1;
                }
                break;
            }
        }
    }

    const container = document.getElementById('verify-results');
    container.innerHTML = '';
    let allOk = true;
    for (const [folder, expected] of Object.entries(EXPECTED_COUNTS)) {
        const actual = counts[folder] || 0;
        const ok = actual === expected;
        if (!ok) allOk = false;
        container.innerHTML += `<div class="grid grid-cols-12 gap-2 px-4 py-2 items-center ${ok ? '' : 'bg-red-50'}">
            <div class="col-span-6 text-xs font-mono text-primary-container">${folder}</div>
            <div class="col-span-2 text-xs font-bold text-center">${expected}</div>
            <div class="col-span-2 text-xs font-bold text-center ${ok ? 'text-green-600' : 'text-red-500'}">${actual}</div>
            <div class="col-span-2 text-center"><span class="material-symbols-outlined text-sm ${ok ? 'text-green-600' : 'text-red-500'}">${ok ? 'check_circle' : 'cancel'}</span></div>
        </div>`;
    }
    document.getElementById('verify-summary').textContent = allOk ? 'All counts match!' : 'Some folders have mismatched counts.';
    document.getElementById('verify-summary').className = 'text-sm font-bold mt-3 ' + (allOk ? 'text-green-600' : 'text-red-500');
    document.getElementById('verify-wrap').classList.remove('hidden');
    showToast(allOk ? 'Dataset verification passed' : 'Dataset has mismatches — check results', allOk ? 'success' : 'warning');
}


// ══════════════════════════════════════════════════
//  DARK MODE
// ══════════════════════════════════════════════════
function toggleDarkMode() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    localStorage.setItem('cau_dark_mode', isDark ? '1' : '0');
    showToast(isDark ? 'Dark mode enabled' : 'Light mode enabled', 'info');
}

function loadDarkMode() {
    if (localStorage.getItem('cau_dark_mode') === '1') {
        document.documentElement.classList.add('dark');
    }
}

// ══════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════
function saveSettings() {
    const url = document.getElementById('settings-url').value.replace(/\/+$/, '');
    localStorage.setItem('cau_backend_url', url);
    document.getElementById('info-backend').textContent = url.replace(/^https?:\/\//, '');
    showToast('Settings saved', 'success');
    checkHealth();
}

async function testConnection() {
    try {
        const res = await fetch(getBackendUrl() + '/api/health');
        if (res.ok) showToast('Connection successful!', 'success');
        else showToast('Server returned ' + res.status, 'error');
    } catch {
        showToast('Cannot connect to backend', 'error');
    }
}

// ══════════════════════════════════════════════════
//  DASHBOARD STATS + HEALTH
// ══════════════════════════════════════════════════
function updateDashStats() {
    document.getElementById('stat-total').textContent = state.analysisCount;
    if (state.analysisCount > 0) {
        document.getElementById('stat-avg-time').textContent = Math.round(state.totalTime / state.analysisCount) + 'ms';
    }
}

async function checkHealth() {
    try {
        const res = await fetch(getBackendUrl() + '/api/health');
        const data = await res.json();
        const clsLoaded = data.models_loaded.classification;
        const segLoaded = data.models_loaded.segmentation;
        document.getElementById('dash-server-status').textContent = 'Online';
        document.getElementById('dash-server-status').className = 'font-semibold text-green-600';
        document.getElementById('dash-cls-status').textContent = clsLoaded ? 'Loaded' : 'Using stub';
        document.getElementById('dash-cls-status').className = 'font-semibold ' + (clsLoaded ? 'text-green-600' : 'text-yellow-600');
        document.getElementById('dash-seg-status').textContent = segLoaded ? 'Loaded' : 'Using stub';
        document.getElementById('dash-seg-status').className = 'font-semibold ' + (segLoaded ? 'text-green-600' : 'text-yellow-600');
        if (clsLoaded && segLoaded) {
            document.getElementById('info-cls-arch').textContent = 'Loaded';
            document.getElementById('info-seg-arch').textContent = 'Loaded';
        }
    } catch {
        document.getElementById('dash-server-status').textContent = 'Offline';
        document.getElementById('dash-server-status').className = 'font-semibold text-error';
        document.getElementById('dash-cls-status').textContent = '—';
        document.getElementById('dash-cls-status').className = 'font-semibold text-on-surface-variant';
        document.getElementById('dash-seg-status').textContent = '—';
        document.getElementById('dash-seg-status').className = 'font-semibold text-on-surface-variant';
    }
}

// ══════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════
(function init() {
    loadDarkMode();
    const savedUrl = localStorage.getItem('cau_backend_url');
    if (savedUrl) {
        document.getElementById('settings-url').value = savedUrl;
        document.getElementById('info-backend').textContent = savedUrl.replace(/^https?:\/\//, '');
    }
    navigateTo('dashboard');
    checkHealth();
})();
