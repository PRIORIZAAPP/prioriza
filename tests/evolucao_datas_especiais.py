"""Run with PYTHONPATH=. python tests/evolucao_datas_especiais.py.

PRIORIZA_TEST_DATABASE_URL optionally selects a disposable loopback PostgreSQL database.
"""

import os
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi.testclient import TestClient


def executar(main):
    cliente = TestClient(main.app)

    def conta():
        r = cliente.post("/auth/register", json={
            "nome": "Validação", "email": f"{uuid4()}@example.invalid", "senha": "Teste-local-073!",
        })
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['token']}"}

    dono, outro = conta(), conta()
    rota = "/datas-especiais"
    assert cliente.get(rota).status_code == 401
    assert cliente.get(rota, headers=dono).headers["Cache-Control"] == "no-store"
    assert cliente.get(rota, headers=dono).json() == []

    datas = [
        {"titulo": "Aniversário", "data_original": "2020-02-29", "repeticao": "anual"},
        {"titulo": "Evento", "data_original": "2030-01-31", "repeticao": "mensal"},
        {"titulo": "Data única", "data_original": main._data_operacional_atual().isoformat()},
    ]
    for dados in datas:
        r = cliente.post(rota, headers=dono, json=dados)
        assert r.status_code == 201, r.text
        assert r.json()["criada_em"] == main._data_operacional_atual().isoformat()
    for extra in ({"titulo": " "}, {"data_original": "2026-02-29"}, {"repeticao": "semanal"}):
        assert cliente.post(rota, headers=dono, json={**datas[0], **extra}).status_code == 422

    salvas = cliente.get(rota, headers=dono).json()
    aniversario = next(d for d in salvas if d["titulo"] == "Aniversário")
    destino = rota + "/" + aniversario["id"]
    mudanca = {**datas[0], "titulo": "Aniversário editado", "data_original": "2020-01-31", "repeticao": "mensal"}
    assert cliente.put(destino, headers=outro, json=mudanca).status_code == 404
    assert cliente.delete(destino, headers=outro).status_code == 404
    assert cliente.get(rota, headers=outro).json() == []
    assert cliente.put(destino, headers=dono, json=mudanca).status_code == 204

    meta = cliente.post("/metas", headers=dono, json={"titulo": "Meta de teste", "tipo": "simples"}).json()
    meta_id = meta["id"]
    r = cliente.patch(f"/metas/{meta_id}/progresso", headers=dono, json={"progresso": 1, "versao": meta["versao"]})
    assert r.status_code == 200 and r.json()["concluida_em"]
    assert cliente.post("/habitos", headers=dono, json={"titulo": "Hábito de teste", "frequencia": 2}).status_code == 201
    backup = cliente.get("/backup", headers=dono).json()
    assert backup["versao"] == "2.4"
    assert "conquistas" not in backup

    for versao in ("2.2", "2.3"):
        r = cliente.post("/restaurar", headers=outro, json={"versao": versao})
        assert r.status_code == 200 and r.json()["importadas"]["datas_especiais"] == 0
    for quantidade in (3, 0):
        r = cliente.post("/restaurar", headers=outro, json=backup)
        assert r.status_code == 200 and r.json()["importadas"]["datas_especiais"] == quantidade, r.text
    salvo = cliente.get("/backup", headers=outro).json()
    assert salvo["datas_especiais"] == backup["datas_especiais"]
    assert salvo["habitos"] == backup["habitos"]
    assert salvo["metas"][0]["concluida_em"] == backup["metas"][0]["concluida_em"]
    assert cliente.delete(destino, headers=dono).status_code == 204
    assert len(cliente.get(rota, headers=dono).json()) == 2
    assert len(cliente.get(rota, headers=outro).json()) == 3

    with main.SessionLocal() as db:
        user_id = db.query(main.DataEspecial).filter_by(id=aniversario["id"]).one().user_id
        main.excluir_conta_usuario(db, db.get(main.User, user_id))
        for modelo in (main.DataEspecial, main.Meta, main.Habito):
            assert db.query(modelo).filter_by(user_id=user_id).count() == 0


if __name__ == "__main__":
    with TemporaryDirectory(prefix="prioriza-datas-") as tmp:
        url = os.environ.get("PRIORIZA_TEST_DATABASE_URL", "")
        if url:
            assert urlsplit(url).hostname in {"127.0.0.1", "localhost", "::1"}
        os.environ["DATABASE_URL"] = url or f"sqlite:///{tmp}/datas.sqlite"
        import main

        executar(main)
        print("Datas especiais: CRUD, isolamento, histórico, backup 2.4, restauração e exclusão de conta OK.")
