"""Run on temporary SQLite or a disposable PostgreSQL loopback database.

PYTHONPATH=. python tests/evolucao_habitos.py
Set PRIORIZA_TEST_DATABASE_URL to run the same cases on isolated PostgreSQL.
"""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi.testclient import TestClient


def executar(main):
    cliente = TestClient(main.app)
    nome = "Hábito de teste"
    dia = date(2025, 12, 30)
    senha = "Teste-local-072!"

    def conta():
        registro = cliente.post("/auth/register", json={
            "nome": "Validação", "email": f"{uuid4()}@example.invalid", "senha": senha,
        })
        assert registro.status_code == 200, registro.text
        return {"Authorization": f"Bearer {registro.json()['token']}"}

    dono, outro = conta(), conta()

    def req(metodo, rota="", *, headers=dono, status=200, **kwargs):
        resposta = cliente.request(metodo, "/habitos" + rota, headers=headers, **kwargs)
        assert resposta.status_code == status, resposta.text
        return None if status == 204 else resposta.json()

    def lista(semana=None, headers=dono):
        params = {"semana": semana} if semana else {}
        return req("GET", headers=headers, params=params)

    with patch.object(main, "_data_operacional_atual", side_effect=lambda: dia):
        assert cliente.get("/habitos").status_code == 401
        assert lista()["semana"] == "2025-12-29" and lista()["habitos"] == []
        for frequencia in range(1, 8):
            criado = req("POST", status=201, json={"titulo": nome, "frequencia": frequencia})
            assert lista()["habitos"][0]["frequencia"] == frequencia
            req("DELETE", f"/{criado['id']}", status=204)
        for invalido in (0, 8, True, 1.5, "3"):
            req("POST", status=422, json={"titulo": nome, "frequencia": invalido})
        criado = req("POST", status=201, json={"titulo": nome, "frequencia": 2})
        id_habito = criado["id"]

        def realizar(data, feito=True, **kwargs):
            return req("PUT", f"/{id_habito}/realizacoes/{data}", json={"realizado": feito}, **kwargs)

        realizar("2025-12-29", status=422)
        realizar("2025-12-31", status=422)
        req("GET", status=422, params={"semana": "2026-01-05"})
        req("GET", status=422, params={"semana": "2025-12-30"})
        realizar("2025-12-30", headers=outro, status=404)
        req("PUT", f"/{id_habito}", headers=outro, status=404, json={"titulo": "Outro", "frequencia": 7})
        req("PUT", f"/{id_habito}/arquivo", headers=outro, status=404, json={"arquivado": True})
        req("DELETE", f"/{id_habito}", headers=outro, status=404)
        assert lista(headers=outro)["habitos"] == []
        with ThreadPoolExecutor(4) as pool:
            assert all(r["realizado"] for r in pool.map(lambda _: realizar("2025-12-30"), range(4)))
        assert lista()["habitos"][0]["realizacoes"] == ["2025-12-30"]
        dia = date(2026, 1, 4)
        realizar("2026-01-01")
        realizar("2026-01-04")
        assert len(lista()["habitos"][0]["realizacoes"]) == 3
        realizar("2026-01-04", False)
        realizar("2026-01-04", False)
        assert len(lista()["habitos"][0]["realizacoes"]) == 2
        dia = date(2026, 1, 5)
        req("PUT", f"/{id_habito}", json={"titulo": "Título editado", "frequencia": 5})
        assert lista()["habitos"][0]["frequencia"] == 5
        assert lista("2025-12-29")["habitos"][0]["frequencia"] == 2
        req("PUT", f"/{id_habito}/arquivo", json={"arquivado": True})
        req("PUT", f"/{id_habito}/arquivo", json={"arquivado": True})
        assert lista()["habitos"][0]["arquivado_em"] == "2026-01-05"
        dia = date(2026, 1, 8)
        realizar("2026-01-06", status=422)
        req("PUT", f"/{id_habito}/arquivo", json={"arquivado": False})
        req("PUT", f"/{id_habito}/arquivo", json={"arquivado": False})
        realizar("2026-01-06", status=422)
        realizar("2026-01-08")
        req("PUT", f"/{id_habito}/arquivo", json={"arquivado": True})
        req("PUT", f"/{id_habito}/arquivo", json={"arquivado": False})
        assert lista()["habitos"][0]["realizacoes"] == ["2026-01-08"]
        req("PUT", f"/{id_habito}/arquivo", json={"arquivado": True})

        backup = cliente.get("/backup", headers=dono).json()
        assert backup["versao"] == "2.5"
        assert len(backup["habitos"][0]["frequencias"]) == 2
        assert backup["habitos"][0]["arquivado_em"] == "2026-01-08"
        antigo = cliente.post("/restaurar", headers=outro, json={"versao": "2.2", "metas": []})
        assert antigo.json()["importadas"]["habitos"] == 0
        for quantidade in (1, 0):
            restaurado = cliente.post("/restaurar", headers=outro, json={"habitos": backup["habitos"]})
            assert restaurado.status_code == 200, restaurado.text
            assert restaurado.json()["importadas"]["habitos"] == quantidade, restaurado.text
        assert cliente.get("/backup", headers=outro).json()["habitos"] == backup["habitos"]
        req("DELETE", f"/{id_habito}", status=204)
        assert lista()["habitos"] == [] and len(lista(headers=outro)["habitos"]) == 1
        with main.SessionLocal() as db:
            outro_id = db.query(main.Habito).filter_by(id=id_habito).one().user_id
            main.excluir_conta_usuario(db, db.get(main.User, outro_id))
            for modelo in (main.Habito, main.HabitoPeriodo, main.HabitoFrequencia, main.HabitoRealizacao):
                assert db.query(modelo).filter_by(user_id=outro_id).count() == 0

    class Relogio(datetime):
        @classmethod
        def now(cls, tz=None):
            return instante.astimezone(tz)

    for utc, semana in [("2026-01-05T02:59:59+00:00", "2025-12-29"), ("2026-01-05T03:00:00+00:00", "2026-01-05")]:
        instante = datetime.fromisoformat(utc)
        with patch.object(main, "datetime", Relogio):
            assert lista()["semana"] == semana


if __name__ == "__main__":
    with TemporaryDirectory(prefix="prioriza-habitos-") as tmp:
        url = os.environ.get("PRIORIZA_TEST_DATABASE_URL", "")
        if url:
            assert urlsplit(url).hostname in {"127.0.0.1", "localhost", "::1"}, "Use apenas um banco descartável local."
        os.environ["DATABASE_URL"] = url or f"sqlite:///{tmp}/habitos.sqlite"
        import main

        executar(main)
        print("Hábitos: frequências, calendário de Brasília, concorrência, histórico, isolamento, backups e exclusão OK.")
