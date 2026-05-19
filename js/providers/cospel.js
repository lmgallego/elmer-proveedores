// js/providers/cospel.js
window.CospelProvider = {
    id: 'cospel',
    name: 'Cospel',
    providerCodeElmer: '87', // Código en la base de datos de Elmer
    
    // Función auxiliar para Cospel
    cleanCode: function(refOriginal) {
        const ref = String(refOriginal).trim();
        const textOnly = ["NO PEDIR MAS", "DESCATALOGADO", "A DESCATALOGAR", "CATALOGO COSPEL", "CATAL2016", "CATALOGO2013"];
        if (textOnly.includes(ref)) return { code: ref, note: "SOLO TEXTO" };
        
        const match1 = ref.match(/([\s\-]+[A-Za-z].*)$/);
        if (match1) return { code: ref.substring(0, match1.index).trim().replace(/[\s\-]+$/, ''), note: match1[1].replace(/^[\s\-]+/, '').trim() };
        
        const match2 = ref.match(/\s+([A-Za-z].*)$/);
        if (match2) return { code: ref.substring(0, match2.index).trim(), note: match2[1].trim() };

        return { code: ref, note: "" };
    },

    // MÉTODO PRINCIPAL REQUERIDO POR EL MOTOR
    normalizeCode: function(val) {
        if (val === null || val === undefined) return "";
        let s = String(val).trim();
        if (/^\d+\.0+$/.test(s)) s = s.split('.')[0];
        return s;
    },

    process: function(rawElmer, rawTarifa, overrides, rawMedidas) {
        overrides = overrides || {};
        if (rawMedidas === undefined) rawMedidas = null;
        // 1. Cabeceras Elmer
        let elmerHeaderIdx = (overrides.elmerHeaderRow !== undefined)
            ? overrides.elmerHeaderRow
            : rawElmer.findIndex(row => {
                const str = row.join("").toLowerCase();
                return str.includes("proveedor") && str.includes("referencia");
            });
        if (elmerHeaderIdx === -1 || elmerHeaderIdx == null || !rawElmer[elmerHeaderIdx]) {
            throw { type: 'HEADER_NOT_FOUND', rawData: rawElmer, context: 'elmer', providerId: this.id };
        }
        
        const eHeaders = rawElmer[elmerHeaderIdx];
        const pIdx = eHeaders.findIndex(h => String(h).toLowerCase().includes("proveedor") && !String(h).toLowerCase().includes("ref."));
        const rpIdx = eHeaders.findIndex(h => String(h).toLowerCase().includes("ref. proveedor"));
        const reIdx = eHeaders.findIndex(h => String(h).toLowerCase() === "referencia");

        // 2. Limpiar Elmer
        const elmerCleaned = [];
        for (let i = elmerHeaderIdx + 1; i < rawElmer.length; i++) {
            const row = rawElmer[i];
            if (row.length === 0 || !row[pIdx]) continue;
            if (String(row[pIdx]).trim() === this.providerCodeElmer) {
                const origRef = row[rpIdx] || "";
                if (origRef.trim() === "") continue;
                const { code, note } = this.cleanCode(origRef);
                elmerCleaned.push({ code, note, referencia: row[reIdx] || "", matched: false });
            }
        }

        // 3. Cabeceras Tarifa Cospel
        let tarifaHeaderIdx = (overrides.tarifaHeaderRow !== undefined)
            ? overrides.tarifaHeaderRow
            : rawTarifa.findIndex(row => {
                const str = row.join("").toLowerCase();
                return str.includes("code") && str.includes("price");
            });
        if (tarifaHeaderIdx === -1 || tarifaHeaderIdx == null || !rawTarifa[tarifaHeaderIdx]) {
            throw { type: 'HEADER_NOT_FOUND', rawData: rawTarifa, context: 'tarifa', providerId: this.id };
        }

        const tHeaders = rawTarifa[tarifaHeaderIdx];
        const codeIdx = tHeaders.findIndex(h => String(h).toLowerCase() === "code");
        const priceIdx = tHeaders.findIndex(h => String(h).toLowerCase().includes("price"));
        const descIdx = tHeaders.findIndex(h => String(h).toLowerCase().includes("description"));

        // 4. Mapear Tarifa Cospel
        const tarifaMap = new Map();
        for (let i = tarifaHeaderIdx + 1; i < rawTarifa.length; i++) {
            const row = rawTarifa[i];
            if (row.length === 0 || !row[codeIdx]) continue;
            const tCode = String(row[codeIdx]).trim();
            let tPrice = row[priceIdx];
            if (typeof tPrice === 'string') tPrice = parseFloat(tPrice.replace(',', '.'));
            tarifaMap.set(tCode, { price: tPrice, desc: descIdx !== -1 ? row[descIdx] : "", matched: false });
        }

        // 5. Cruzar
        const cruzados = [], soloElmer = [], soloProveedor = [];
        
        elmerCleaned.forEach(item => {
            if (tarifaMap.has(item.code)) {
                let tData = tarifaMap.get(item.code);
                tData.matched = true;
                cruzados.push({
                    "Proveedor": this.providerCodeElmer,
                    "Code": item.code,
                    "Estado/Nota": item.note,
                    "Referencia Elmer": item.referencia,
                    "Descripción Cospel": tData.desc,
                    "Precio Compra": tData.price
                });
            } else {
                soloElmer.push({
                    "Proveedor": this.providerCodeElmer,
                    "Code": item.code,
                    "Estado/Nota": item.note,
                    "Referencia Elmer": item.referencia,
                    "Precio Compra": "-"
                });
            }
        });

        tarifaMap.forEach((data, code) => {
            if (!data.matched) {
                soloProveedor.push({
                    "Proveedor": "-",
                    "Code": code,
                    "Estado/Nota": "NUEVO",
                    "Descripción Cospel": data.desc,
                    "Precio Compra": data.price
                });
            }
        });

        let columns = ["Proveedor", "Code", "Estado/Nota", "Referencia Elmer", "Descripción Cospel", "Precio Compra"];

        // 6. Enriquecimiento opcional con medidas
        if (rawMedidas) {
            const medidasHeaderIdx = (overrides.medidasHeaderRow !== undefined)
                ? overrides.medidasHeaderRow
                : rawMedidas.findIndex(row => {
                    const str = row.join(" ").toLowerCase();
                    return str.includes("bestellnummer") && (str.includes("länge") || str.includes("lange"));
                });
            if (medidasHeaderIdx === -1 || medidasHeaderIdx == null || !rawMedidas[medidasHeaderIdx]) {
                throw { type: 'HEADER_NOT_FOUND', rawData: rawMedidas, context: 'medidas', providerId: this.id };
            }

            const mHeaders = rawMedidas[medidasHeaderIdx];
            const idxCode  = mHeaders.findIndex(h => String(h).trim().toLowerCase().includes("bestellnummer"));
            const idxLargo = mHeaders.findIndex(h => {
                const s = String(h).trim().toLowerCase();
                return s.includes("länge") || s.includes("lange");
            });
            const idxAncho = mHeaders.findIndex(h => String(h).trim().toLowerCase().includes("breite"));
            const idxAlto  = mHeaders.findIndex(h => {
                const s = String(h).trim().toLowerCase();
                return s.includes("höhe") || s.includes("hohe");
            });

            const toCmCeil = (v) => {
                if (v === "" || v == null) return null;
                const n = (typeof v === 'number') ? v : parseFloat(String(v).replace(',', '.'));
                if (isNaN(n)) return null;
                return Math.ceil(n);
            };

            const medidasMap = new Map();
            for (let i = medidasHeaderIdx + 1; i < rawMedidas.length; i++) {
                const row = rawMedidas[i];
                if (!row || row.length === 0) continue;
                const codeKey = this.normalizeCode(idxCode !== -1 ? row[idxCode] : "");
                if (!codeKey) continue;
                if (medidasMap.has(codeKey)) continue;
                medidasMap.set(codeKey, {
                    largo: idxLargo !== -1 ? toCmCeil(row[idxLargo]) : null,
                    ancho: idxAncho !== -1 ? toCmCeil(row[idxAncho]) : null,
                    alto:  idxAlto  !== -1 ? toCmCeil(row[idxAlto])  : null
                });
            }

            cruzados.forEach(r => {
                const key = this.normalizeCode(r["Code"]);
                const m = medidasMap.get(key);
                if (m) {
                    r["Largo"] = m.largo != null ? m.largo : "";
                    r["Ancho"] = m.ancho != null ? m.ancho : "";
                    r["Alto"]  = m.alto  != null ? m.alto  : "";
                } else {
                    r["Largo"] = "";
                    r["Ancho"] = "";
                    r["Alto"]  = "";
                }
            });

            columns = columns.concat(["Largo", "Ancho", "Alto"]);
        }

        return {
            providerName: this.name,
            cruzados,
            soloElmer,
            soloProveedor,
            columns
        };
    }
};
