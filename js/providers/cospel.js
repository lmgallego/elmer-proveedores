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
    process: function(rawElmer, rawTarifa) {
        // 1. Cabeceras Elmer
        let elmerHeaderIdx = rawElmer.findIndex(row => {
            const str = row.join("").toLowerCase();
            return str.includes("proveedor") && str.includes("referencia");
        });
        if (elmerHeaderIdx === -1) throw new Error("No cabeceras en Elmer");
        
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
        let tarifaHeaderIdx = rawTarifa.findIndex(row => {
            const str = row.join("").toLowerCase();
            return str.includes("code") && str.includes("price");
        });
        if (tarifaHeaderIdx === -1) throw new Error("No cabeceras en Tarifa Cospel");

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

        // Devolvemos el estándar que el Motor espera
        return {
            providerName: this.name,
            cruzados,
            soloElmer,
            soloProveedor,
            columns: ["Proveedor", "Code", "Estado/Nota", "Referencia Elmer", "Descripción Cospel", "Precio Compra"]
        };
    }
};
