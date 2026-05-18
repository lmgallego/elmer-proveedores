// js/engine.js

const AppEngine = {
    rawElmerData: null,
    rawTarifaData: null,
    currentResult: null,
    currentTab: 'cruzados',
    fsData: [],
    fsFilteredData: [],
    fsCurrentTab: 'cruzados',
    fsRenderedCount: 0,
    fsPageSize: 100,

    // Registro de proveedores (El listado de módulos)
    Providers: {
        'cospel': window.CospelProvider
    },

    init: function() {
        this.bindEvents();
    },

    bindEvents: function() {
        const providerSelect = document.getElementById('provider-select');
        const processBtn = document.getElementById('process-btn');

        providerSelect.addEventListener('change', (e) => {
            this.checkReady();
        });

        document.getElementById('elmer-file').addEventListener('change', (e) => this.handleFile(e, 'elmer'));
        document.getElementById('tarifa-file').addEventListener('change', (e) => this.handleFile(e, 'tarifa'));
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
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" });
            
            // Validación para evitar subir el excel en la casilla equivocada
            let isElmerContent = false;
            const limit = Math.min(jsonData.length, 50); // Buscar en las primeras 50 filas
            for(let i=0; i<limit; i++) {
                const str = jsonData[i].join("").toLowerCase();
                if (str.includes("proveedor") && str.includes("referencia")) {
                    isElmerContent = true;
                    break;
                }
            }
            
            let isValid = true;
            let errorMsg = "";
            
            if (type === 'elmer' && !isElmerContent) {
                isValid = false;
                errorMsg = "❌ Error: El archivo subido no parece ser el Archivo Base Elmer. Faltan las columnas 'proveedor' o 'referencia'.";
            } else if (type === 'tarifa' && isElmerContent) {
                isValid = false;
                errorMsg = "❌ Error: Has subido el Archivo Base Elmer en la zona de Tarifa Proveedor. Te has equivocado de recuadro.";
            }
            
            const fileNameEl = document.getElementById(`${type}-file-name`);
            const fileTextEl = document.getElementById(`${type}-file-text`);

            if (!isValid) {
                this.showMsg(errorMsg, "error");
                if (fileNameEl) fileNameEl.classList.add('hidden');
                if (fileTextEl) fileTextEl.classList.remove('hidden');
                event.target.value = ''; // Limpiar input
                if (type === 'elmer') this.rawElmerData = null;
                if (type === 'tarifa') this.rawTarifaData = null;
                this.checkReady();
                return;
            }

            // Archivo válido
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
            this.checkReady();
        };
        reader.readAsArrayBuffer(file);
    },

    checkReady: function() {
        const btn = document.getElementById('process-btn');
        if (this.rawElmerData && this.rawTarifaData && document.getElementById('provider-select').value) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.classList.add('hover:bg-[#B3050F]');
        } else {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.classList.remove('hover:bg-[#B3050F]');
        }
    },

    runProcess: function() {
        const providerId = document.getElementById('provider-select').value;
        const strategy = this.Providers[providerId];

        if (!strategy) return alert("Estrategia de proveedor no encontrada.");
        
        this.showMsg("Procesando...", "info");
        
        setTimeout(() => {
            try {
                // DELEGAMOS LA LÓGICA AL MÓDULO DEL PROVEEDOR (PATRÓN ESTRATEGIA)
                this.currentResult = strategy.process(this.rawElmerData, this.rawTarifaData);
                
                document.getElementById('results-title').textContent = `Resultados: ${this.currentResult.providerName}`;
                document.getElementById('count-cruzados').textContent = this.currentResult.cruzados.length;
                document.getElementById('count-elmer').textContent = this.currentResult.soloElmer.length;
                document.getElementById('count-proveedor').textContent = this.currentResult.soloProveedor.length;
                
                document.getElementById('results-placeholder').classList.add('hidden');
                document.getElementById('results-content').classList.remove('hidden');
                document.getElementById('results-content').classList.add('flex');
                this.showMsg("", "hide"); // hide status message
                
                this.switchTab('cruzados');
            } catch (err) {
                console.error(err);
                this.showMsg("Error: " + err.message, "error");
            }
        }, 100);
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
                let val = row[col] || "-";
                let tdClass = "px-md py-sm font-body-md text-body-md text-on-surface";
                
                if (col === "Precio Compra" && val !== "-") {
                    val = Number(val).toFixed(3).replace('.', ',') + " €";
                    tdClass += " text-right font-bold text-primary";
                } else if (col === "Estado/Nota" && val !== "-") {
                    let badgeColor = "bg-primary-container text-on-primary-container"; // Red variant
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
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(this.currentResult.cruzados), "✅ Cruzados");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(this.currentResult.soloElmer), "⚠️ Solo Elmer");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(this.currentResult.soloProveedor), "✨ Solo Tarifa");
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
                let val = row[col] || "-";
                let tdClass = "px-md py-sm font-body-md text-body-md text-on-surface";
                
                if (col === "Precio Compra" && val !== "-") {
                    val = Number(val).toFixed(3).replace('.', ',') + " €";
                    tdClass += " text-right font-bold text-primary";
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
