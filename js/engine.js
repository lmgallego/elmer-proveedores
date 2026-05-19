// js/engine.js

const AppEngine = {
    rawElmerData: null,
    rawTarifaData: null,
    rawMedidasData: null,
    rawLogiCospelData: null,
    rawLogiPoliplastData: null,
    currentResult: null,
    currentTab: 'cruzados',
    fsData: [],
    fsFilteredData: [],
    fsCurrentTab: 'cruzados',
    fsRenderedCount: 0,
    fsPageSize: 100,

    activeProvider: null,
    pendingHeaderContext: null,

    PRICE_COLUMNS: {
        "Precio Compra": 3,
        "Price": 2
    },

    formatPrice: function(val, decimals) {
        const n = (typeof val === 'number') ? val : parseFloat(String(val).replace(',', '.'));
        if (isNaN(n)) return "-";
        return n.toFixed(decimals).replace('.', ',') + " €";
    },

    // Registro de proveedores (El listado de módulos)
    Providers: {
        'cospel': window.CospelProvider,
        'poliplast': window.PoliplastProvider,
        'logicompare': window.LogiCompareProvider
    },

    init: function() {
        this.bindEvents();
    },

    bindEvents: function() {
        const processBtn = document.getElementById('process-btn');

        document.querySelectorAll('.provider-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setActiveProvider(btn.dataset.provider));
        });

        const hClose = document.getElementById('header-modal-close');
        if (hClose) hClose.addEventListener('click', () => this.closeHeaderModal());
        const hConfirm = document.getElementById('header-modal-confirm');
        if (hConfirm) hConfirm.addEventListener('click', () => this.confirmHeaderModal());

        document.getElementById('elmer-file').addEventListener('change', (e) => this.handleFile(e, 'elmer'));
        document.getElementById('tarifa-file').addEventListener('change', (e) => this.handleFile(e, 'tarifa'));
        const medidasInput = document.getElementById('medidas-file');
        if (medidasInput) medidasInput.addEventListener('change', (e) => this.handleFile(e, 'medidas'));
        const logiCospelInput = document.getElementById('logi-cospel-file');
        if (logiCospelInput) logiCospelInput.addEventListener('change', (e) => this.handleFile(e, 'logi-cospel'));
        const logiPolInput = document.getElementById('logi-poliplast-file');
        if (logiPolInput) logiPolInput.addEventListener('change', (e) => this.handleFile(e, 'logi-poliplast'));
        processBtn.addEventListener('click', () => this.runProcess());
        document.getElementById('btn-export-excel').addEventListener('click', () => this.exportExcel());
        
        const btnFs = document.getElementById('btn-fullscreen');
        if(btnFs) btnFs.addEventListener('click', () => this.openFullscreen());
        const btnCloseFs = document.getElementById('btn-close-fs');
        if(btnCloseFs) btnCloseFs.addEventListener('click', () => this.closeFullscreen());
        const fsSearch = document.getElementById('fs-search');
        if(fsSearch) fsSearch.addEventListener('input', (e) => this.filterFullscreen(e.target.value));
        const btnFsExport = document.getElementById('btn-fs-export');
        if(btnFsExport) btnFsExport.addEventListener('click', () => this.exportExcel());
        
        document.querySelectorAll('.fs-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchFsTab(e.target.dataset.tab));
        });
        
        const fsContainer = document.getElementById('fs-table-container');
        if (fsContainer) {
            fsContainer.addEventListener('scroll', (e) => {
                const el = e.target;
                if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
                    this.loadMoreFsTable();
                }
            });
        }
        
        // Tab events
        document.getElementById('tab-cruzados').addEventListener('click', () => this.switchTab('cruzados'));
        document.getElementById('tab-elmer').addEventListener('click', () => this.switchTab('elmer'));
        document.getElementById('tab-proveedor').addEventListener('click', () => this.switchTab('proveedor'));

        // Drag and drop setup
        this.setupDragAndDrop('elmer-dropzone', 'elmer-file', 'elmer');
        this.setupDragAndDrop('tarifa-dropzone', 'tarifa-file', 'tarifa');
        if (document.getElementById('medidas-dropzone')) {
            this.setupDragAndDrop('medidas-dropzone', 'medidas-file', 'medidas');
        }
        if (document.getElementById('logi-cospel-dropzone')) {
            this.setupDragAndDrop('logi-cospel-dropzone', 'logi-cospel-file', 'logi-cospel');
        }
        if (document.getElementById('logi-poliplast-dropzone')) {
            this.setupDragAndDrop('logi-poliplast-dropzone', 'logi-poliplast-file', 'logi-poliplast');
        }
    },

    setupDragAndDrop: function(zoneId, inputId, type) {
        const dropZone = document.getElementById(zoneId);
        const fileInput = document.getElementById(inputId);

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
        });

        dropZone.addEventListener('drop', (e) => {
            let dt = e.dataTransfer;
            let files = dt.files;
            fileInput.files = files;
            // Trigger change event manually
            const event = new Event('change');
            fileInput.dispatchEvent(event);
        }, false);
    },

    handleFile: function(event, type) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });

            const isLogi = (type === 'logi-cospel' || type === 'logi-poliplast');
            let sheet;
            if (isLogi) {
                sheet = workbook.Sheets["Cruzados"];
                if (!sheet) {
                    this.showMsg("Este archivo no contiene la hoja 'Cruzados'. Sube un Excel generado por esta misma app.", "error");
                    const nameEl = document.getElementById(`${type}-file-name`);
                    const textEl = document.getElementById(`${type}-file-text`);
                    if (nameEl) nameEl.classList.add('hidden');
                    if (textEl) textEl.classList.remove('hidden');
                    event.target.value = '';
                    if (type === 'logi-cospel') this.rawLogiCospelData = null;
                    if (type === 'logi-poliplast') this.rawLogiPoliplastData = null;
                    this.checkReady();
                    return;
                }
            } else {
                sheet = workbook.Sheets[workbook.SheetNames[0]];
            }
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

            let isValid = true;
            let errorMsg = "";

            if (type === 'elmer' || type === 'tarifa') {
                let isElmerContent = false;
                const limit = Math.min(jsonData.length, 50);
                for(let i=0; i<limit; i++) {
                    const str = jsonData[i].join(" ").toLowerCase();
                    const hasRefElmer = str.includes("ref. elmer");
                    const hasRefSimilar = str.includes("ref.") && str.includes("similar");
                    const legacyMatch = str.includes("proveedor") && str.includes("referencia");
                    if (hasRefElmer || hasRefSimilar || legacyMatch) {
                        isElmerContent = true;
                        break;
                    }
                }
                if (type === 'elmer' && !isElmerContent) {
                    isValid = false;
                    errorMsg = "Error: El archivo subido no parece ser el Archivo Base Elmer.";
                } else if (type === 'tarifa' && isElmerContent) {
                    isValid = false;
                    errorMsg = "Error: Has subido el Archivo Base Elmer en la zona de Tarifa Proveedor. Te has equivocado de recuadro.";
                }
            } else if (type === 'medidas') {
                let isMedidasContent = false;
                const limit = Math.min(jsonData.length, 15);
                for (let i = 0; i < limit; i++) {
                    const str = jsonData[i].join(" ").toLowerCase();
                    if (str.includes("bestellnummer") && (str.includes("länge") || str.includes("lange"))) {
                        isMedidasContent = true;
                        break;
                    }
                }
                if (!isMedidasContent) {
                    isValid = false;
                    errorMsg = "Este archivo no parece ser el archivo de Medidas Cospel";
                }
            } else if (type === 'logi-cospel') {
                const limit = Math.min(jsonData.length, 15);
                let ok = false;
                for (let i = 0; i < limit; i++) {
                    const str = jsonData[i].join(" | ").toLowerCase();
                    if (str.includes("code") && str.includes("referencia elmer") && str.includes("largo") && str.includes("ancho") && str.includes("alto")) {
                        ok = true; break;
                    }
                }
                if (!ok) {
                    isValid = false;
                    errorMsg = "El archivo Cruce Cospel no contiene las columnas esperadas (Code, Referencia Elmer, Largo, Ancho, Alto).";
                }
            } else if (type === 'logi-poliplast') {
                const limit = Math.min(jsonData.length, 15);
                let ok = false;
                for (let i = 0; i < limit; i++) {
                    const str = jsonData[i].join(" | ").toLowerCase();
                    if (str.includes("ref. elmer") && str.includes("largo") && str.includes("ancho") && str.includes("alto")) {
                        ok = true; break;
                    }
                }
                if (!ok) {
                    isValid = false;
                    errorMsg = "El archivo Cruce Poliplast no contiene las columnas esperadas (Ref. ELMER, Largo, Ancho, Alto).";
                }
            }

            const fileNameEl = document.getElementById(`${type}-file-name`);
            const fileTextEl = document.getElementById(`${type}-file-text`);

            if (!isValid) {
                this.showMsg(errorMsg, "error");
                if (fileNameEl) fileNameEl.classList.add('hidden');
                if (fileTextEl) fileTextEl.classList.remove('hidden');
                event.target.value = '';
                if (type === 'elmer') this.rawElmerData = null;
                if (type === 'tarifa') this.rawTarifaData = null;
                if (type === 'medidas') this.rawMedidasData = null;
                if (type === 'logi-cospel') this.rawLogiCospelData = null;
                if (type === 'logi-poliplast') this.rawLogiPoliplastData = null;
                this.checkReady();
                return;
            }

            this.showMsg("", "hide");
            if (fileNameEl) {
                fileNameEl.innerHTML = `<span class="material-symbols-outlined align-middle mr-1 text-[20px] text-[#22c55e]" style="font-variation-settings: 'FILL' 1;">check_circle</span>${file.name}`;
                fileNameEl.classList.remove('hidden');
            }
            if (fileTextEl) {
                fileTextEl.classList.add('hidden');
            }

            if (type === 'elmer') this.rawElmerData = jsonData;
            if (type === 'tarifa') this.rawTarifaData = jsonData;
            if (type === 'medidas') this.rawMedidasData = jsonData;
            if (type === 'logi-cospel') this.rawLogiCospelData = jsonData;
            if (type === 'logi-poliplast') this.rawLogiPoliplastData = jsonData;
            this.checkReady();
        };
        reader.readAsArrayBuffer(file);
    },

    setActiveProvider: function(providerId) {
        this.activeProvider = providerId;
        this.rawElmerData = null;
        this.rawTarifaData = null;
        this.rawMedidasData = null;
        this.rawLogiCospelData = null;
        this.rawLogiPoliplastData = null;
        this.currentResult = null;

        const providerName = (this.Providers[providerId] && this.Providers[providerId].name) || 'Tarifa';
        const tabLabel = document.getElementById('tab-proveedor-label');
        if (tabLabel) tabLabel.textContent = 'Solo ' + providerName;
        const fsTabLabel = document.getElementById('fs-tab-proveedor-label');
        if (fsTabLabel) fsTabLabel.textContent = 'Solo ' + providerName;

        document.querySelectorAll('.provider-btn').forEach(btn => {
            if (btn.dataset.provider === providerId) {
                btn.classList.add('active');
                btn.classList.remove('bg-surface-container-high', 'text-secondary');
            } else {
                btn.classList.remove('active');
                btn.classList.add('bg-surface-container-high', 'text-secondary');
            }
        });

        // Reset file UI
        ['elmer', 'tarifa', 'medidas', 'logi-cospel', 'logi-poliplast'].forEach(t => {
            const input = document.getElementById(`${t}-file`);
            if (input) input.value = '';
            const nameEl = document.getElementById(`${t}-file-name`);
            if (nameEl) { nameEl.classList.add('hidden'); nameEl.innerHTML = ''; }
            const textEl = document.getElementById(`${t}-file-text`);
            if (textEl) textEl.classList.remove('hidden');
        });

        // Toggle standard vs logicompare zones
        const medidasWrapper = document.getElementById('medidas-zone-wrapper');
        const grid = document.getElementById('file-drop-zones');
        const logiWrapper = document.getElementById('logi-zones-wrapper');
        if (providerId === 'logicompare') {
            if (grid) grid.classList.add('hidden');
            if (medidasWrapper) medidasWrapper.classList.add('hidden');
            if (logiWrapper) logiWrapper.classList.remove('hidden');
        } else {
            if (logiWrapper) logiWrapper.classList.add('hidden');
            if (grid) grid.classList.remove('hidden');
            if (providerId === 'cospel') {
                if (medidasWrapper) medidasWrapper.classList.remove('hidden');
                if (grid) { grid.classList.remove('lg:grid-cols-2'); grid.classList.add('lg:grid-cols-3'); }
            } else {
                if (medidasWrapper) medidasWrapper.classList.add('hidden');
                if (grid) { grid.classList.remove('lg:grid-cols-3'); grid.classList.add('lg:grid-cols-2'); }
            }
        }

        // Hide non-relevant tabs for LogiCompare and rename Cruzados → Medidas
        const tabElmer = document.getElementById('tab-elmer');
        const tabProveedor = document.getElementById('tab-proveedor');
        const fsTabElmer = document.querySelector('.fs-tab-btn[data-tab="elmer"]');
        const fsTabProveedor = document.querySelector('.fs-tab-btn[data-tab="proveedor"]');
        const tabCruzadosLabel = document.getElementById('tab-cruzados-label');
        const fsTabCruzadosLabel = document.getElementById('fs-tab-cruzados-label');
        if (providerId === 'logicompare') {
            if (tabElmer) tabElmer.classList.add('hidden');
            if (tabProveedor) tabProveedor.classList.add('hidden');
            if (fsTabElmer) fsTabElmer.classList.add('hidden');
            if (fsTabProveedor) fsTabProveedor.classList.add('hidden');
            if (tabCruzadosLabel) tabCruzadosLabel.textContent = 'Medidas';
            if (fsTabCruzadosLabel) fsTabCruzadosLabel.textContent = 'Medidas';
        } else {
            if (tabElmer) tabElmer.classList.remove('hidden');
            if (tabProveedor) tabProveedor.classList.remove('hidden');
            if (fsTabElmer) fsTabElmer.classList.remove('hidden');
            if (fsTabProveedor) fsTabProveedor.classList.remove('hidden');
            if (tabCruzadosLabel) tabCruzadosLabel.textContent = 'Cruzados';
            if (fsTabCruzadosLabel) fsTabCruzadosLabel.textContent = 'Cruzados';
        }

        const resultsTitle = document.getElementById('results-title');
        if (resultsTitle) resultsTitle.textContent = 'Previsualización de Resultados';

        const resultsPlaceholder = document.getElementById('results-placeholder');
        const resultsContent = document.getElementById('results-content');
        if (resultsPlaceholder) resultsPlaceholder.classList.remove('hidden');
        if (resultsContent) { resultsContent.classList.add('hidden'); resultsContent.classList.remove('flex'); }

        ['count-cruzados', 'count-elmer', 'count-proveedor'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '0';
        });

        this.currentTab = 'cruzados';
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active-tab', 'text-primary', 'font-bold');
            btn.classList.add('text-secondary', 'font-medium');
        });
        const defaultTab = document.getElementById('tab-cruzados');
        if (defaultTab) {
            defaultTab.classList.add('active-tab', 'text-primary', 'font-bold');
            defaultTab.classList.remove('text-secondary', 'font-medium');
        }

        // Show main / hide empty state
        const empty = document.getElementById('empty-state');
        const main = document.getElementById('main-content');
        if (empty) empty.classList.add('hidden');
        if (main) main.classList.remove('hidden');

        this.showMsg("", "hide");
        this.checkReady();
    },

    checkReady: function() {
        const btn = document.getElementById('process-btn');
        if (!btn) return;
        let ready = false;
        if (this.activeProvider === 'logicompare') {
            ready = !!(this.rawLogiCospelData && this.rawLogiPoliplastData);
        } else if (this.activeProvider) {
            ready = !!(this.rawElmerData && this.rawTarifaData);
        }
        if (ready) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.classList.add('hover:bg-[#B3050F]');
        } else {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.classList.remove('hover:bg-[#B3050F]');
        }
    },

    runProcess: function(overrides) {
        overrides = overrides || {};
        const providerId = this.activeProvider;
        const strategy = this.Providers[providerId];

        if (!strategy) return alert("Estrategia de proveedor no encontrada.");

        this.showMsg("Procesando...", "info");

        setTimeout(() => {
            try {
                if (providerId === 'logicompare') {
                    this.currentResult = strategy.process(this.rawLogiCospelData, this.rawLogiPoliplastData);
                } else {
                    this.currentResult = strategy.process(this.rawElmerData, this.rawTarifaData, overrides, this.rawMedidasData);
                }

                document.getElementById('results-title').textContent = `Resultados: ${this.currentResult.providerName}`;
                document.getElementById('count-cruzados').textContent = this.currentResult.cruzados.length;
                document.getElementById('count-elmer').textContent = this.currentResult.soloElmer.length;
                document.getElementById('count-proveedor').textContent = this.currentResult.soloProveedor.length;

                document.getElementById('results-placeholder').classList.add('hidden');
                document.getElementById('results-content').classList.remove('hidden');
                document.getElementById('results-content').classList.add('flex');
                this.showMsg("", "hide");

                this.switchTab('cruzados');
            } catch (err) {
                if (err && err.type === 'HEADER_NOT_FOUND') {
                    this.openHeaderModal(err, overrides);
                    return;
                }
                console.error(err);
                this.showMsg("Error: " + (err && err.message ? err.message : err), "error");
            }
        }, 100);
    },

    openHeaderModal: function(err, prevOverrides) {
        this.pendingHeaderContext = { context: err.context, prevOverrides: prevOverrides || {} };
        const tbody = document.getElementById('header-modal-table');
        if (tbody) {
            const rows = (err.rawData || []).slice(0, 15);
            const maxCols = rows.reduce((m, r) => Math.max(m, (r || []).length), 0);
            let html = '';
            rows.forEach((r, i) => {
                html += `<tr class="${i % 2 ? 'bg-surface-container-low' : 'bg-white'} border-b border-[#E5E5E5]">`;
                html += `<td class="px-sm py-xs font-bold text-secondary">${i}</td>`;
                for (let c = 0; c < maxCols; c++) {
                    const v = (r && r[c] != null) ? String(r[c]) : '';
                    html += `<td class="px-sm py-xs">${v.replace(/</g, '&lt;')}</td>`;
                }
                html += '</tr>';
            });
            tbody.innerHTML = html;
        }
        const input = document.getElementById('header-modal-input');
        if (input) input.value = 0;
        this.showMsg("", "hide");
        document.getElementById('header-modal').classList.remove('hidden');
    },

    closeHeaderModal: function() {
        document.getElementById('header-modal').classList.add('hidden');
        this.pendingHeaderContext = null;
    },

    confirmHeaderModal: function() {
        if (!this.pendingHeaderContext) return;
        const idx = parseInt(document.getElementById('header-modal-input').value, 10);
        if (isNaN(idx) || idx < 0) {
            this.showMsg("Índice no válido", "error");
            return;
        }
        const { context, prevOverrides } = this.pendingHeaderContext;
        const overrides = Object.assign({}, prevOverrides);
        if (context === 'tarifa') overrides.tarifaHeaderRow = idx;
        else if (context === 'elmer') overrides.elmerHeaderRow = idx;
        else if (context === 'medidas') overrides.medidasHeaderRow = idx;
        document.getElementById('header-modal').classList.add('hidden');
        this.pendingHeaderContext = null;
        this.runProcess(overrides);
    },

    switchTab: function(tabId) {
        this.currentTab = tabId;
        
        // Reset all tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active-tab', 'text-primary', 'font-bold');
            btn.classList.add('text-secondary', 'font-medium');
        });
        
        // Set active tab
        const activeBtn = document.getElementById(`tab-${tabId}`);
        activeBtn.classList.add('active-tab', 'text-primary', 'font-bold');
        activeBtn.classList.remove('text-secondary', 'font-medium');

        let data = [];
        if (tabId === 'cruzados') data = this.currentResult.cruzados;
        if (tabId === 'elmer') data = this.currentResult.soloElmer;
        if (tabId === 'proveedor') data = this.currentResult.soloProveedor;

        this.renderTable(data);
    },

    renderTable: function(data) {
        const thead = document.getElementById('table-header');
        const tbody = document.getElementById('results-table-body');
        
        // Render Headers (Dinámicos según el proveedor)
        let hHtml = "<tr>";
        this.currentResult.columns.forEach(col => {
            hHtml += `<th class="px-md py-sm text-left font-label-md text-label-md text-secondary border-b border-[#E5E5E5]">${col}</th>`;
        });
        hHtml += "</tr>";
        thead.innerHTML = hHtml;

        // Render Body
        tbody.innerHTML = '';
        const limit = data.slice(0, 100);
        document.getElementById('showing-text').textContent = `Mostrando ${limit.length} de ${data.length} registros.`;

        limit.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-surface-container-low transition-colors border-b border-[#E5E5E5]";
            
            this.currentResult.columns.forEach(col => {
                const raw = row[col];
                let val = (raw === 0 || raw === "0") ? raw : (raw || "-");
                let tdClass = "px-md py-sm font-body-md text-body-md text-on-surface";

                if (this.PRICE_COLUMNS[col] !== undefined && val !== "-") {
                    val = this.formatPrice(raw, this.PRICE_COLUMNS[col]);
                    tdClass += " text-right font-bold text-primary";
                } else if (row._matchedOEMCol && col === row._matchedOEMCol && val !== "-") {
                    tdClass += " font-bold";
                    val = `<span style="color:#c0000c">${val}</span>`;
                } else if (col === "Estado/Nota" && val !== "-") {
                    let badgeColor = "bg-primary-container text-on-primary-container";
                    if (val === "SOLO TEXTO") badgeColor = "bg-surface-container-high text-on-surface-variant";
                    if (val === "NUEVO") badgeColor = "bg-secondary-container text-on-secondary-container";

                    val = `<span class="px-xs py-1 ${badgeColor} rounded text-label-md font-label-md border border-outline-variant">${val}</span>`;
                }

                tr.innerHTML += `<td class="${tdClass}">${val}</td>`;
            });
            tbody.appendChild(tr);
        });
    },

    exportExcel: function() {
        if (!this.currentResult) return;
        const wb = XLSX.utils.book_new();
        const columns = this.currentResult.columns;

        const stripMeta = (rows) => rows.map(r => {
            const out = {};
            Object.keys(r).forEach(k => { if (!k.startsWith('_')) out[k] = r[k]; });
            return out;
        });

        const buildSheet = (rows, applyHighlight) => {
            const clean = stripMeta(rows);
            const ws = XLSX.utils.json_to_sheet(clean, { header: columns });
            if (applyHighlight) {
                rows.forEach((r, i) => {
                    const matchedCol = r._matchedOEMCol;
                    if (!matchedCol) return;
                    const colIdx = columns.indexOf(matchedCol);
                    if (colIdx === -1) return;
                    const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: colIdx });
                    const cell = ws[cellRef];
                    if (cell) {
                        cell.s = { font: { bold: true, color: { rgb: "C0000C" } } };
                    }
                });
            }
            return ws;
        };

        if (this.activeProvider === 'logicompare') {
            const ws = buildSheet(this.currentResult.cruzados, false);
            // Forzar Referencia Elmer como string
            const refColIdx = columns.indexOf("Referencia Elmer");
            if (refColIdx !== -1) {
                for (let i = 0; i < this.currentResult.cruzados.length; i++) {
                    const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: refColIdx });
                    const cell = ws[cellRef];
                    if (cell) {
                        cell.t = 's';
                        cell.v = cell.v == null ? '' : String(cell.v);
                    }
                }
            }
            XLSX.utils.book_append_sheet(wb, ws, "Medidas");
            XLSX.writeFile(wb, "Medidas.xlsx");
            return;
        }

        XLSX.utils.book_append_sheet(wb, buildSheet(this.currentResult.cruzados, true), "Cruzados");
        XLSX.utils.book_append_sheet(wb, buildSheet(this.currentResult.soloElmer, false), "Solo Elmer");
        XLSX.utils.book_append_sheet(wb, buildSheet(this.currentResult.soloProveedor, false), 'Solo ' + this.currentResult.providerName);
        XLSX.writeFile(wb, `Cruce_${this.currentResult.providerName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    },

    openFullscreen: function() {
        if (!this.currentResult) return;
        
        this.fsCurrentTab = this.currentTab; // Sync with dashboard tab
        document.getElementById('fs-search').value = '';
        this.switchFsTab(this.fsCurrentTab);
        
        document.getElementById('fullscreen-modal').classList.remove('hidden');
    },

    switchFsTab: function(tabId) {
        this.fsCurrentTab = tabId;
        
        document.querySelectorAll('.fs-tab-btn').forEach(btn => {
            btn.classList.remove('bg-white', 'shadow-sm', 'text-primary');
            btn.classList.add('text-secondary');
        });
        
        const activeBtn = document.querySelector(`.fs-tab-btn[data-tab="${tabId}"]`);
        if(activeBtn) {
            activeBtn.classList.add('bg-white', 'shadow-sm', 'text-primary');
            activeBtn.classList.remove('text-secondary');
        }
        
        let data = [];
        if (tabId === 'cruzados') data = this.currentResult.cruzados;
        if (tabId === 'elmer') data = this.currentResult.soloElmer;
        if (tabId === 'proveedor') data = this.currentResult.soloProveedor;

        this.fsData = data;
        
        const query = document.getElementById('fs-search').value;
        this.filterFullscreen(query);
    },

    closeFullscreen: function() {
        document.getElementById('fullscreen-modal').classList.add('hidden');
    },

    filterFullscreen: function(query) {
        if (!query) {
            this.fsFilteredData = this.fsData;
        } else {
            const q = query.toLowerCase();
            this.fsFilteredData = this.fsData.filter(row => {
                return Object.values(row).some(val => 
                    String(val).toLowerCase().includes(q)
                );
            });
        }
        this.fsRenderedCount = 0;
        this.renderFsTable();
    },

    renderFsTable: function() {
        const thead = document.getElementById('fs-table-header');
        const tbody = document.getElementById('fs-table-body');
        
        // Render Headers
        let hHtml = "<tr>";
        this.currentResult.columns.forEach(col => {
            hHtml += `<th class="px-md py-sm text-left font-label-md text-label-md text-secondary border-b border-[#E5E5E5]">${col}</th>`;
        });
        hHtml += "</tr>";
        thead.innerHTML = hHtml;

        // Reset Body
        tbody.innerHTML = '';
        this.fsRenderedCount = 0;
        
        this.loadMoreFsTable();
    },

    loadMoreFsTable: function() {
        if (this.fsRenderedCount >= this.fsFilteredData.length) return;
        
        const tbody = document.getElementById('fs-table-body');
        const data = this.fsFilteredData;
        const nextBatch = data.slice(this.fsRenderedCount, this.fsRenderedCount + this.fsPageSize);
        
        nextBatch.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-surface-container-low transition-colors border-b border-[#E5E5E5]";
            
            this.currentResult.columns.forEach(col => {
                const raw = row[col];
                let val = (raw === 0 || raw === "0") ? raw : (raw || "-");
                let tdClass = "px-md py-sm font-body-md text-body-md text-on-surface";

                if (this.PRICE_COLUMNS[col] !== undefined && val !== "-") {
                    val = this.formatPrice(raw, this.PRICE_COLUMNS[col]);
                    tdClass += " text-right font-bold text-primary";
                } else if (row._matchedOEMCol && col === row._matchedOEMCol && val !== "-") {
                    tdClass += " font-bold";
                    val = `<span style="color:#c0000c">${val}</span>`;
                } else if (col === "Estado/Nota" && val !== "-") {
                    let badgeColor = "bg-primary-container text-on-primary-container";
                    if (val === "SOLO TEXTO") badgeColor = "bg-surface-container-high text-on-surface-variant";
                    if (val === "NUEVO") badgeColor = "bg-secondary-container text-on-secondary-container";

                    val = `<span class="px-xs py-1 ${badgeColor} rounded text-label-md font-label-md border border-outline-variant">${val}</span>`;
                }

                tr.innerHTML += `<td class="${tdClass}">${val}</td>`;
            });
            tbody.appendChild(tr);
        });

        this.fsRenderedCount += nextBatch.length;
        document.getElementById('fs-showing-text').textContent = `Mostrando ${this.fsRenderedCount} de ${data.length} registros filtrados. (Desplázate hacia abajo para ver más)`;
    },

    showMsg: function(text, type) {
        const m = document.getElementById('status-message');
        if (type === 'hide') {
            m.classList.add('hidden');
            return;
        }
        m.classList.remove('hidden', 'bg-error-container', 'text-error', 'bg-primary-container', 'text-primary', 'border-error', 'border-primary');
        
        document.getElementById('status-text').textContent = text;
        
        if (type === 'error') m.classList.add('bg-error-container', 'text-error', 'border-error');
        if (type === 'info') m.classList.add('bg-primary-container', 'text-primary', 'border-primary'); 
    }
};

window.AppEngine = AppEngine;
