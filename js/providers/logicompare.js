// js/providers/logicompare.js
window.LogiCompareProvider = {
    id: 'logicompare',
    name: 'LogiCompare',

    limpiarRefElmer: function(val) {
        if (val === null || val === undefined || val === '') return '';
        let s = String(val).trim();
        if (/^[A-Za-z]{3}/.test(s)) s = s.substring(3);
        return s;
    },

    findHeaderRow: function(raw, mustInclude) {
        return raw.findIndex(row => {
            if (!row) return false;
            const joined = row.map(c => String(c == null ? '' : c).toLowerCase()).join(' | ');
            return mustInclude.every(needle => joined.includes(needle.toLowerCase()));
        });
    },

    findColIdx: function(headers, needles) {
        const arr = Array.isArray(needles) ? needles : [needles];
        return headers.findIndex(h => {
            const s = String(h == null ? '' : h).trim().toLowerCase();
            return arr.every(n => s.includes(n.toLowerCase()));
        });
    },

    isNumeric: function(v) {
        if (v === null || v === undefined || v === '') return false;
        if (typeof v === 'number') return !isNaN(v);
        const n = parseFloat(String(v).replace(',', '.'));
        return !isNaN(n);
    },

    toCmCeil: function(v) {
        const n = (typeof v === 'number') ? v : parseFloat(String(v).replace(',', '.'));
        if (isNaN(n)) return null;
        return Math.ceil(n);
    },

    process: function(rawCospel, rawPoliplast) {
        // --- Cospel headers ---
        const cospelHdrIdx = this.findHeaderRow(rawCospel, ["code", "referencia elmer", "largo"]);
        if (cospelHdrIdx === -1) {
            throw new Error("Cruce Cospel: no se han detectado los encabezados (Code, Referencia Elmer, Largo).");
        }
        const cHeaders = rawCospel[cospelHdrIdx];
        const cRefIdx   = this.findColIdx(cHeaders, ["referencia elmer"]);
        const cDescIdx  = this.findColIdx(cHeaders, ["descripción"]);
        const cLargoIdx = this.findColIdx(cHeaders, ["largo"]);
        const cAnchoIdx = this.findColIdx(cHeaders, ["ancho"]);
        const cAltoIdx  = this.findColIdx(cHeaders, ["alto"]);

        const registrosCospel = [];
        for (let i = cospelHdrIdx + 1; i < rawCospel.length; i++) {
            const row = rawCospel[i];
            if (!row || row.length === 0) continue;
            const largo = cLargoIdx !== -1 ? row[cLargoIdx] : "";
            const ancho = cAnchoIdx !== -1 ? row[cAnchoIdx] : "";
            const alto  = cAltoIdx  !== -1 ? row[cAltoIdx]  : "";
            if (!this.isNumeric(largo) || !this.isNumeric(ancho) || !this.isNumeric(alto)) continue;

            const ref = this.limpiarRefElmer(cRefIdx !== -1 ? row[cRefIdx] : "");
            if (!ref) continue;

            registrosCospel.push({
                "Referencia Elmer": ref,
                "Descripción": cDescIdx !== -1 ? (row[cDescIdx] || "") : "",
                "Proveedor": "COSPEL",
                "Largo": this.toCmCeil(largo) + 5,
                "Ancho": this.toCmCeil(ancho) + 5,
                "Alto":  this.toCmCeil(alto)  + 5
            });
        }

        // --- Poliplast headers ---
        const polHdrIdx = this.findHeaderRow(rawPoliplast, ["ref. elmer", "largo"]);
        if (polHdrIdx === -1) {
            throw new Error("Cruce Poliplast: no se han detectado los encabezados (Ref. ELMER, Largo).");
        }
        const pHeaders = rawPoliplast[polHdrIdx];
        const pRefIdx   = this.findColIdx(pHeaders, ["ref.", "elmer"]);
        const pDescIdx  = this.findColIdx(pHeaders, ["descripción"]);
        const pLargoIdx = this.findColIdx(pHeaders, ["largo"]);
        const pAnchoIdx = this.findColIdx(pHeaders, ["ancho"]);
        const pAltoIdx  = this.findColIdx(pHeaders, ["alto"]);

        const registrosPoliplast = [];
        for (let i = polHdrIdx + 1; i < rawPoliplast.length; i++) {
            const row = rawPoliplast[i];
            if (!row || row.length === 0) continue;
            const largo = pLargoIdx !== -1 ? row[pLargoIdx] : "";
            const ancho = pAnchoIdx !== -1 ? row[pAnchoIdx] : "";
            const alto  = pAltoIdx  !== -1 ? row[pAltoIdx]  : "";
            if (!this.isNumeric(largo) || !this.isNumeric(ancho) || !this.isNumeric(alto)) continue;

            const ref = this.limpiarRefElmer(pRefIdx !== -1 ? row[pRefIdx] : "");
            if (!ref) continue;

            registrosPoliplast.push({
                "Referencia Elmer": ref,
                "Descripción": pDescIdx !== -1 ? (row[pDescIdx] || "") : "",
                "Proveedor": "POLIPLAST",
                "Largo": this.toCmCeil(largo) + 5,
                "Ancho": this.toCmCeil(ancho) + 5,
                "Alto":  this.toCmCeil(alto)  + 5
            });
        }

        const cruzados = registrosCospel.concat(registrosPoliplast);

        return {
            providerName: this.name,
            cruzados,
            soloElmer: [],
            soloProveedor: [],
            columns: ["Referencia Elmer", "Descripción", "Proveedor", "Largo", "Ancho", "Alto"]
        };
    }
};
