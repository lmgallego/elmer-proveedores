// js/providers/poliplast.js
window.PoliplastProvider = {
    id: 'poliplast',
    name: 'Poliplast',

    MAX_OEMS: 10,

    detectTarifaHeaderIdx: function(rawTarifa) {
        return rawTarifa.findIndex(row => {
            const str = row.join(" ").toLowerCase();
            return str.includes("poliplast code") && str.includes("price");
        });
    },

    detectElmerHeaderIdx: function(rawElmer) {
        return rawElmer.findIndex(row => {
            const str = row.join(" ").toLowerCase();
            return str.includes("ref. elmer") || str.includes("ref. similar");
        });
    },

    findColIdx: function(headers, needles) {
        const arr = Array.isArray(needles) ? needles : [needles];
        return headers.findIndex(h => {
            const s = String(h).trim().toLowerCase();
            return arr.every(n => s.includes(n.toLowerCase()));
        });
    },

    toCm: function(v) {
        if (v === "" || v == null) return "";
        const n = (typeof v === 'number') ? v : parseFloat(String(v).replace(',', '.'));
        if (isNaN(n)) return "";
        return Math.ceil(n * 100);
    },

    process: function(rawElmer, rawTarifa, overrides) {
        overrides = overrides || {};

        // --- Tarifa headers ---
        let tarifaHeaderIdx = (overrides.tarifaHeaderRow !== undefined)
            ? overrides.tarifaHeaderRow
            : this.detectTarifaHeaderIdx(rawTarifa);
        if (tarifaHeaderIdx === -1 || tarifaHeaderIdx == null || !rawTarifa[tarifaHeaderIdx]) {
            throw { type: 'HEADER_NOT_FOUND', rawData: rawTarifa, context: 'tarifa', providerId: this.id };
        }

        const tHeaders = rawTarifa[tarifaHeaderIdx];
        const codeIdx = this.findColIdx(tHeaders, ["poliplast", "code"]);
        const similarIdx = this.findColIdx(tHeaders, ["similar"]);
        const priceIdx = this.findColIdx(tHeaders, ["price"]);
        const lenIdx = this.findColIdx(tHeaders, ["lenght"]);
        const widIdx = this.findColIdx(tHeaders, ["width"]);
        const heiIdx = this.findColIdx(tHeaders, ["height"]);

        // --- Build OEM -> poliplast map ---
        const oemMap = new Map();           // oemCode -> { poliplastCode, price, largo, ancho, alto, refsOEM, matched }
        const tarifaUnique = new Map();     // poliplastCode -> { ... }

        for (let i = tarifaHeaderIdx + 1; i < rawTarifa.length; i++) {
            const row = rawTarifa[i];
            if (!row || row.length === 0) continue;
            const polCode = codeIdx !== -1 ? String(row[codeIdx] || "").trim() : "";
            if (!polCode) continue;

            const similarRaw = similarIdx !== -1 ? String(row[similarIdx] || "") : "";
            let price = priceIdx !== -1 ? row[priceIdx] : "";
            if (typeof price === 'string') {
                const n = parseFloat(price.replace(',', '.'));
                price = isNaN(n) ? "" : n;
            } else if (typeof price !== 'number') {
                price = "";
            }
            const largo = this.toCm(lenIdx !== -1 ? row[lenIdx] : "");
            const ancho = this.toCm(widIdx !== -1 ? row[widIdx] : "");
            const alto  = this.toCm(heiIdx !== -1 ? row[heiIdx] : "");

            const refsOEM = similarRaw.split(" - ")
                .map(s => s.trim())
                .filter(s => s.length > 0)
                .slice(0, this.MAX_OEMS);

            if (!tarifaUnique.has(polCode)) {
                tarifaUnique.set(polCode, { poliplastCode: polCode, price, largo, ancho, alto, refsOEM });
            }

            refsOEM.forEach(oem => {
                if (!oemMap.has(oem)) {
                    oemMap.set(oem, { poliplastCode: polCode, price, largo, ancho, alto, refsOEM, matched: false });
                }
            });
        }

        // --- Elmer headers ---
        let elmerHeaderIdx = (overrides.elmerHeaderRow !== undefined)
            ? overrides.elmerHeaderRow
            : this.detectElmerHeaderIdx(rawElmer);
        if (elmerHeaderIdx === -1 || elmerHeaderIdx == null || !rawElmer[elmerHeaderIdx]) {
            throw { type: 'HEADER_NOT_FOUND', rawData: rawElmer, context: 'elmer', providerId: this.id };
        }

        const eHeaders = rawElmer[elmerHeaderIdx];
        const refElmerIdx   = this.findColIdx(eHeaders, ["ref.", "elmer"]);
        const refSimilarIdx = this.findColIdx(eHeaders, ["ref.", "similar"]);
        const descIdx       = this.findColIdx(eHeaders, ["descrip"]);
        const marcaIdx      = this.findColIdx(eHeaders, ["marca"]);

        const cruzados = [];
        const soloElmer = [];

        const buildOemFields = (refsOEM) => {
            const obj = {};
            for (let k = 1; k <= this.MAX_OEMS; k++) {
                obj["Ref_OEM_" + k] = refsOEM && refsOEM[k-1] ? refsOEM[k-1] : "";
            }
            return obj;
        };

        for (let i = elmerHeaderIdx + 1; i < rawElmer.length; i++) {
            const row = rawElmer[i];
            if (!row || row.length === 0) continue;
            const refElmer   = refElmerIdx   !== -1 ? String(row[refElmerIdx]   || "").trim() : "";
            const refSimilar = refSimilarIdx !== -1 ? String(row[refSimilarIdx] || "").trim() : "";
            const desc       = descIdx       !== -1 ? String(row[descIdx]       || "").trim() : "";
            const marca      = marcaIdx      !== -1 ? String(row[marcaIdx]      || "").trim() : "";

            if (!refElmer && !refSimilar) continue;

            if (refSimilar && oemMap.has(refSimilar)) {
                const t = oemMap.get(refSimilar);
                t.matched = true;
                const oemFields = buildOemFields(t.refsOEM);
                const matchedIdx = (t.refsOEM || []).indexOf(refSimilar);
                const matchedCol = matchedIdx >= 0 ? "Ref_OEM_" + (matchedIdx + 1) : "";
                cruzados.push(Object.assign({
                    "Ref. ELMER": refElmer,
                    "Ref. Similar - OEM": refSimilar,
                    "Descripción": desc,
                    "Marca": marca,
                    "Poliplast Code": t.poliplastCode,
                    "Price": t.price
                }, oemFields, {
                    "Largo": t.largo,
                    "Ancho": t.ancho,
                    "Alto": t.alto,
                    "_matchedOEMCol": matchedCol
                }));
            } else {
                soloElmer.push({
                    "Ref. ELMER": refElmer,
                    "Ref. Similar - OEM": refSimilar,
                    "Descripción": desc,
                    "Marca": marca
                });
            }
        }

        // Solo Proveedor: poliplastCodes whose NONE of its OEMs matched
        const matchedPolCodes = new Set();
        oemMap.forEach(v => { if (v.matched) matchedPolCodes.add(v.poliplastCode); });

        const soloProveedor = [];
        tarifaUnique.forEach((t, polCode) => {
            if (matchedPolCodes.has(polCode)) return;
            const oemFields = buildOemFields(t.refsOEM);
            soloProveedor.push(Object.assign({
                "Poliplast Code": t.poliplastCode,
                "Price": t.price
            }, oemFields, {
                "Largo": t.largo,
                "Ancho": t.ancho,
                "Alto": t.alto
            }));
        });

        // Maximum OEM column index actually used across cruzados + soloProveedor
        let maxOEM = 0;
        const scanMax = (recs) => {
            recs.forEach(r => {
                for (let k = this.MAX_OEMS; k > maxOEM; k--) {
                    if (r["Ref_OEM_" + k] && String(r["Ref_OEM_" + k]).length > 0) {
                        maxOEM = k;
                        break;
                    }
                }
            });
        };
        scanMax(cruzados);
        scanMax(soloProveedor);

        const oemCols = [];
        for (let k = 1; k <= maxOEM; k++) oemCols.push("Ref_OEM_" + k);

        const columns = ["Ref. ELMER", "Ref. Similar - OEM", "Descripción", "Marca", "Poliplast Code", "Price"]
            .concat(oemCols)
            .concat(["Largo", "Ancho", "Alto"]);

        return {
            providerName: this.name,
            cruzados,
            soloElmer,
            soloProveedor,
            columns,
            highlightMeta: { matchedColKey: "_matchedOEMCol", highlightSheets: ["cruzados"] }
        };
    }
};
