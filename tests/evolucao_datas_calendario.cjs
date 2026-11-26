"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const contexto = vm.createContext({});
vm.runInContext(fs.readFileSync("js/screens/datas-especiais.js", "utf8"), contexto);
const { calcularDataEspecial, compararDatasEspeciais } = contexto;

function conferir(original, repeticao, hoje, ocorrencia, texto) {
  const resultado = calcularDataEspecial({ data_original: original, repeticao }, hoje);
  assert.equal(resultado.ocorrencia, ocorrencia);
  assert.equal(resultado.texto, texto);
}

conferir("2027-02-01", "nenhuma", "2027-01-31", "2027-02-01", "Falta 1 dia");
conferir("2027-02-01", "nenhuma", "2027-01-30", "2027-02-01", "Faltam 2 dias");
conferir("2027-02-01", "nenhuma", "2027-02-02", "2027-02-01", "Há 1 dia");
conferir("2027-02-01", "nenhuma", "2027-02-04", "2027-02-01", "Há 3 dias");
conferir("2024-01-31", "mensal", "2024-02-29", "2024-02-29", "1 mês");
conferir("2024-01-31", "mensal", "2024-03-01", "2024-03-31", "Faltam 30 dias");
conferir("2024-01-31", "mensal", "2024-04-30", "2024-04-30", "3 meses");
conferir("2024-01-31", "mensal", "2025-02-28", "2025-02-28", "1 ano e 1 mês");
conferir("2024-01-31", "mensal", "2026-06-30", "2026-06-30", "2 anos e 5 meses");
conferir("2024-02-29", "anual", "2024-02-29", "2024-02-29", "É hoje");
conferir("2024-02-29", "anual", "2025-02-28", "2025-02-28", "1 ano");
conferir("2024-02-29", "anual", "2025-03-01", "2026-02-28", "Faltam 364 dias");
conferir("2024-02-29", "anual", "2028-02-29", "2028-02-29", "4 anos");
conferir("2027-01-31", "mensal", "2027-01-30", "2027-01-31", "Falta 1 dia");
conferir("2020-12-31", "mensal", "2026-12-31", "2026-12-31", "6 anos");
const ordem = [-15, 2, -1, 0, 1].map(dias => ({ dias, registro: { titulo: "Teste" } })).sort(compararDatasEspeciais);
assert.deepEqual(ordem.map(x => x.dias), [0, 1, 2, -1, -15]);
console.log("Datas especiais: calendário civil, recorrências, singular/plural e ordenação OK.");
