"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const contexto = vm.createContext({});
vm.runInContext(fs.readFileSync("js/screens/datas-especiais.js", "utf8"), contexto);
const { calcularDataEspecial, compararDatasEspeciais } = contexto;

function conferir(original, repeticao, hoje, ocorrencia, texto, transcorrido = null) {
  const resultado = calcularDataEspecial({ data_original: original, repeticao }, hoje);
  assert.equal(resultado.ocorrencia, ocorrencia);
  assert.equal(resultado.texto, texto);
  assert.equal(resultado.transcorrido, transcorrido);
}

conferir("2027-02-01", "nenhuma", "2027-01-31", "2027-02-01", "Falta 1 dia");
conferir("2027-02-01", "nenhuma", "2027-01-30", "2027-02-01", "Faltam 2 dias");
conferir("2027-02-01", "nenhuma", "2027-02-02", "2027-02-01", "Há 1 dia");
conferir("2027-02-01", "nenhuma", "2027-02-04", "2027-02-01", "Há 3 dias");
conferir("2024-01-31", "mensal", "2024-02-29", "2024-02-29", "É hoje", "1m");
conferir("2024-01-31", "mensal", "2024-03-01", "2024-03-31", "Faltam 30 dias", "1m 1d");
conferir("2024-01-31", "mensal", "2024-04-30", "2024-04-30", "É hoje", "3m");
conferir("2024-01-31", "mensal", "2025-02-28", "2025-02-28", "É hoje", "1a 1m");
conferir("2024-01-31", "mensal", "2026-06-30", "2026-06-30", "É hoje", "2a 5m");
conferir("2024-02-29", "anual", "2024-02-29", "2024-02-29", "É hoje", "0d");
conferir("2024-02-29", "anual", "2025-02-28", "2025-02-28", "É hoje", "1a");
conferir("2024-02-29", "anual", "2025-03-01", "2026-02-28", "Faltam 364 dias", "1a 1d");
conferir("2024-02-29", "anual", "2028-02-29", "2028-02-29", "É hoje", "4a");
conferir("2027-01-31", "mensal", "2027-01-30", "2027-01-31", "Falta 1 dia");
conferir("2020-12-31", "mensal", "2026-12-31", "2026-12-31", "É hoje", "6a");
conferir("2024-12-17", "mensal", "2026-11-26", "2026-12-17", "Faltam 21 dias", "1a 11m 9d");
conferir("2024-12-17", "mensal", "2026-12-17", "2026-12-17", "É hoje", "2a");
conferir("2024-12-17", "mensal", "2026-12-18", "2027-01-17", "Faltam 30 dias", "2a 1d");
conferir("2025-01-30", "mensal", "2025-03-29", "2025-03-30", "Falta 1 dia", "1m 29d");
conferir("2024-12-17", "anual", "2027-03-29", "2027-12-17", "Faltam 263 dias", "2a 3m 12d");
const ordem = [-15, 2, -1, 0, 1].map(dias => ({ dias, registro: { titulo: "Teste" } })).sort(compararDatasEspeciais);
assert.deepEqual(ordem.map(x => x.dias), [0, 1, 2, -1, -15]);
console.log("Datas especiais: calendário civil, recorrências, singular/plural e ordenação OK.");
