"""Exercise goal CRUD and backup on temporary SQLite or an explicitly selected local test DB.

From the repository root: PYTHONPATH=. python tests/evolucao_metas.py
For PostgreSQL set PRIORIZA_TEST_DATABASE_URL to a disposable loopback database.
"""

import os
from concurrent.futures import ThreadPoolExecutor
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi.testclient import TestClient


def executar(cliente):
    def conta():
        registro = cliente.post("/auth/register", json={
            "nome": "Validação de metas",
            "email": f"{uuid4()}@example.invalid",
            "senha": "Teste-local-071!",
        })
        assert registro.status_code == 200, registro.text
        return {"Authorization": f"Bearer {registro.json()['token']}"}

    dono, outro = conta(), conta()
    assert cliente.get("/metas").status_code == 401
    assert cliente.get("/metas", headers=dono).headers["Cache-Control"] == "no-store"
    assert cliente.get("/metas", headers=dono).json() == []

    def criar(**campos):
        resposta = cliente.post("/metas", headers=dono, json=campos)
        assert resposta.status_code == 201, resposta.text
        return resposta.json()

    def progresso(meta, valor):
        return cliente.patch(f"/metas/{meta['id']}/progresso", headers=dono, json={
            "progresso": valor, "versao": meta["versao"],
        })

    quantidade = criar(titulo="Ler livros", tipo="quantidade", objetivo="12.125", unidade="livros", prazo="2020-01-01")
    percentual = criar(titulo="Pós-graduação", tipo="percentual")
    simples = criar(titulo="Passaporte", tipo="simples")
    for invalida in [
        {"titulo": "  ", "tipo": "simples"},
        {"titulo": "Sem quantidade", "tipo": "quantidade"},
        {"titulo": "Prazo inválido", "tipo": "simples", "prazo": "2026-02-31"},
        {"titulo": "Unidade indevida", "tipo": "percentual", "unidade": "livros"},
        {"titulo": "Precisão indevida", "tipo": "quantidade", "objetivo": "1.0001"},
    ]:
        assert cliente.post("/metas", headers=dono, json=invalida).status_code == 422
    assert progresso(quantidade, "-1").status_code == 422
    assert progresso(quantidade, "12.126").status_code == 422
    assert progresso(percentual, 101).status_code == 422
    with ThreadPoolExecutor(2) as executor:
        concorrentes = list(executor.map(lambda valor: progresso(percentual, valor), (30, 40)))
    assert sorted(r.status_code for r in concorrentes) == [200, 409]
    percentual = next(r.json() for r in concorrentes if r.status_code == 200)
    assert progresso(simples, "0.5").status_code == 422

    quant_atualizada = progresso(quantidade, "4.125")
    assert quant_atualizada.status_code == 200, quant_atualizada.text
    assert progresso(quantidade, 3).status_code == 409
    quant_corrigida = progresso(quant_atualizada.json(), "2.5")
    assert quant_corrigida.status_code == 200
    percent_concluida = progresso(percentual, 100).json()
    assert percent_concluida["concluida_em"]
    percent_reaberta = progresso(percent_concluida, 65).json()
    assert percent_reaberta["concluida_em"] is None
    simples_concluida = progresso(simples, 1).json()
    assert simples_concluida["concluida_em"]

    edicoes = (
        (quant_corrigida.json(), {"titulo": "Leitura", "tipo": "quantidade", "objetivo": 15, "unidade": "livros"}),
        (percent_reaberta, {"titulo": "Curso", "tipo": "percentual", "prazo": "2029-02-01"}),
        (simples_concluida, {"titulo": "Emitir passaporte", "tipo": "simples"}),
    )
    for meta, campos in edicoes:
        rota = f"/metas/{meta['id']}"
        dados = {**campos, "versao": meta["versao"]}
        assert cliente.put(rota, headers=outro, json=dados).status_code == 404
        assert cliente.patch(rota + "/progresso", headers=outro, json={"progresso": 0, "versao": 1}).status_code == 404
        assert cliente.delete(rota, headers=outro).status_code == 404
        resultado = cliente.put(rota, headers=dono, json=dados)
        assert resultado.status_code == 200, resultado.text
        assert resultado.json()["concluida_em"] == meta["concluida_em"]
    assert cliente.get("/metas", headers=outro).json() == []

    legado = {"versao": "2.1", "notas": [{"texto": "Histórico preservado", "tipo": "GERAL"}]}
    assert cliente.post("/restaurar", headers=outro, json=legado).status_code == 200
    assert cliente.get("/metas", headers=outro).json() == []
    backup = cliente.get("/backup", headers=dono).json()
    assert len(backup["metas"]) == 3
    secao_metas = {"versao": backup["versao"], "metas": backup["metas"]}
    restauracao = cliente.post("/restaurar", headers=outro, json=secao_metas)
    assert restauracao.status_code == 200, restauracao.text
    assert restauracao.json()["importadas"]["metas"] == 3
    assert cliente.post("/restaurar", headers=outro, json=secao_metas).json()["importadas"]["metas"] == 0
    restauradas = cliente.get("/metas", headers=outro).json()
    original = {item["id"]: item for item in backup["metas"]}
    for meta in restauradas:
        for campo in ("titulo", "tipo", "objetivo", "progresso", "prazo", "unidade", "criada_em", "concluida_em"):
            assert meta[campo] == original[meta["id"]][campo], (campo, meta)
    assert any(nota["texto"] == "Histórico preservado" for nota in cliente.get("/notes", headers=outro).json())

    assert cliente.post("/restaurar", headers=outro, json={"metas": [{}]}).json()["importadas"]["erros"]
    for meta in backup["metas"]:
        assert cliente.delete(f"/metas/{meta['id']}", headers=dono).status_code == 204
    assert cliente.get("/metas", headers=dono).json() == []
    assert len(cliente.get("/metas", headers=outro).json()) == 3


if __name__ == "__main__":
    with TemporaryDirectory(prefix="prioriza-metas-") as diretorio:
        url = os.environ.get("PRIORIZA_TEST_DATABASE_URL", "")
        if url:
            assert urlsplit(url).hostname in {"127.0.0.1", "localhost", "::1"}, "Use apenas um PostgreSQL isolado local."
        os.environ["DATABASE_URL"] = url or f"sqlite:///{diretorio}/metas.sqlite"
        from main import app

        executar(TestClient(app))
        print("CRUD, validações, concorrência, isolamento e backup de Metas aprovados.")
