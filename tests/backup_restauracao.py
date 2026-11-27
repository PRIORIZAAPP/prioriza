"""Run against temporary SQLite or a disposable pri077_ database on loopback."""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import os
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi.testclient import TestClient


def executar():
    import main

    with TestClient(main.app) as cliente:
        def conta():
            dados = {
                "nome": "Auditoria sintética",
                "email": f"{uuid4()}@example.invalid",
                "senha": "Teste-backup-077!",
            }
            res = cliente.post("/auth/register", json=dados)
            assert res.status_code == 200, res.text
            return {"Authorization": f"Bearer {res.json()['token']}"}, res.json()["user"]["id"]

        def chamar(metodo, rota, headers, **kwargs):
            res = cliente.request(metodo, rota, headers=headers, **kwargs)
            assert res.is_success, (rota, res.status_code, res.text)
            return res.json()

        def exportar(headers):
            return chamar("GET", "/backup", headers)

        def restaurar(headers, dados):
            return chamar("POST", "/restaurar", headers, json=dados)

        def contar(dados):
            return {chave: len(dados[chave]) for chave in main.CHAVES_BACKUP}

        origem, uid_origem = conta()
        destino, uid_destino = conta()
        concorrente, _ = conta()
        falha, _ = conta()
        terceiro, _ = conta()

        # Seed comparable records with deliberately identical content and distinct IDs.
        with main.SessionLocal() as db:
            db.add_all([
                main.Tarefa(user_id=uid_origem, titulo="Série", data=dia, hora_inicio="10:00",
                            hora_fim="11:00", recurrence_type="SEMANAL", recurrence_until="2030-03-08",
                            recurrence_started_at=main.datetime(2026, 1, 1, 12), google_event_id="ficticio",
                            google_html_link="https://calendar.google.com/ficticio", sincronizado_google=True,
                            status="feito" if dia == "2030-03-01" else "pendente")
                for dia in ("2030-03-01", "2030-03-08")
            ])
            db.add(main.ChecklistItem(user_id=uid_origem, titulo="Rotina", status="feito",
                                     ultimo_exec=main.datetime(2026, 1, 1, 10),
                                     recurrence_ended_at=main.datetime(2026, 1, 2, 10)))
            db.add_all([main.Note(user_id=uid_origem, texto="Conteúdo igual", data="2030-03-01", tipo="GERAL") for _ in range(2)])
            db.add(main.MarcoOperacional(user_id=uid_origem, titulo="Marco", data="2030-03-01", categoria="Auditoria", severidade="Alta"))
            db.commit()

        meta = chamar("POST", "/metas", origem, json={"titulo": "Meta", "tipo": "simples"})
        chamar("PATCH", f"/metas/{meta['id']}/progresso", origem, json={"versao": meta["versao"], "progresso": 1})
        criar_habito = chamar("POST", "/habitos", origem, json={"titulo": "Hábito", "frequencia": 2})
        hoje = main._data_operacional_atual()
        chamar("PUT", f"/habitos/{criar_habito['id']}/realizacoes/{hoje}", origem, json={"realizado": True})
        chamar("POST", "/datas-especiais", origem, json={"titulo": "Data", "data_original": "2024-02-29", "repeticao": "anual"})
        backup = exportar(origem)
        totais = contar(backup)
        assert totais == {
            "tarefas": 2, "checklist": 1, "notas": 2, "marcos_operacionais": 1,
            "metas": 1, "habitos": 1, "datas_especiais": 1,
        }
        assert backup["versao"] == "2.5" and "conquistas" not in backup
        assert "user_id" not in backup["marcos_operacionais"][0]
        assert "google_event_id" not in backup["tarefas"][0] and "google_html_link" not in backup["tarefas"][0]
        assert len({item["backup_id"] for item in backup["notas"]}) == 2

        # Same-account restore should match native records without making receipt rows.
        assert restaurar(origem, backup)["ignoradas"] == totais
        chamar("POST", "/notes", destino, data={"texto": "Nota preexistente", "tipo": "PESSOAL"})

        modificado = deepcopy(backup)
        modificado["user_id"] = uid_origem
        modificado["marcos_operacionais"][0]["user_id"] = uid_origem
        modificado["tarefas"][0]["google_event_id"] = "ficticio-manipulado"
        modificado["checklist"][0]["area"] = "Área antiga"
        for rodada in range(3):
            resultado = restaurar(destino, modificado)
            assert sum(resultado["conflitos"].values()) == 0, resultado
            assert all(resultado["importadas"][k] == (v if rodada == 0 else 0) for k, v in totais.items())
            assert sum(resultado["ignoradas"].values()) == (0 if rodada == 0 else sum(totais.values()))
        salvo = exportar(destino)
        assert contar(salvo) == {**totais, "notas": 3}
        assert salvo["checklist"][0]["ultimo_exec"] == backup["checklist"][0]["ultimo_exec"]
        assert salvo["checklist"][0]["recurrence_ended_at"] == backup["checklist"][0]["recurrence_ended_at"]
        assert salvo["checklist"][0]["area"] == "Área antiga"
        assert salvo["habitos"] == backup["habitos"]
        assert salvo["metas"][0]["concluida_em"] == backup["metas"][0]["concluida_em"]
        assert salvo["datas_especiais"] == backup["datas_especiais"]
        assert all(item["backup_id"] in {x["backup_id"] for x in backup["tarefas"]} for item in salvo["tarefas"])
        for campo in ("backup_serie_id", "recurrence_started_at", "recurrence_until", "recurrence_type"):
            assert [t[campo] for t in salvo["tarefas"]] == [t[campo] for t in backup["tarefas"]]
        with main.SessionLocal() as db:
            assert all(t.google_event_id is None and not t.sincronizado_google
                       for t in db.query(main.Tarefa).filter_by(user_id=uid_destino))
            assert db.query(main.Tarefa).filter_by(user_id=uid_origem).count() == 2
            assert all(t.google_event_id == "ficticio" for t in db.query(main.Tarefa).filter_by(user_id=uid_origem))

        nota = next(n for n in salvo["notas"] if n["texto"] == "Conteúdo igual")
        chamar("PUT", f"/notes/{nota['id']}", destino, params={"texto": "Edição local"})
        chamar("POST", "/notes", origem, data={"texto": "Nota de backup posterior"})
        depois = restaurar(destino, exportar(origem))
        assert depois["conflitos"]["notas"] == 1 and depois["importadas"]["notas"] == 1
        assert any(n["texto"] == "Edição local" for n in exportar(destino)["notas"])
        print("Restauração 3×, conteúdo igual, sobreposição, vínculos e isolamento aprovados.", flush=True)

        # Distinct v2.5 series sharing the same timestamp must not become one series.
        outra_serie = deepcopy(backup)
        ids_serie = str(uuid4())
        for tarefa in outra_serie["tarefas"]:
            tarefa.update(backup_id=str(uuid4()), backup_serie_id=ids_serie)
        assert restaurar(destino, outra_serie)["importadas"]["tarefas"] == 2
        with main.SessionLocal() as db:
            series = [r.recurrence_started_at for r in db.query(main.Tarefa).filter_by(user_id=uid_destino)]
            assert len(set(series)) == 2 and all(series.count(x) == 2 for x in set(series))
        exportada = exportar(destino)
        assert {item["backup_serie_id"] for item in exportada["tarefas"]} == {ids_serie, backup["tarefas"][0]["backup_serie_id"]}

        tarefa_original = next(t for t in exportada["tarefas"] if t["backup_serie_id"] != ids_serie)
        chamar("PUT", f"/tarefas/{tarefa_original['id']}", destino, params={"titulo": "Série editada", "scope": "series"})
        tarefas_pos_edicao = exportar(destino)["tarefas"]
        assert {t["titulo"] for t in tarefas_pos_edicao if t["backup_serie_id"] == ids_serie} == {"Série"}
        assert {t["titulo"] for t in tarefas_pos_edicao if t["backup_serie_id"] != ids_serie} == {"Série editada"}

        with ThreadPoolExecutor(max_workers=3) as executor:
            respostas = list(executor.map(lambda _: restaurar(concorrente, backup), range(3)))
        assert sorted(sum(r["importadas"][k] for k in totais) for r in respostas) == [0, 0, sum(totais.values())]
        assert contar(exportar(concorrente)) == totais

        for versao in (None, "1.0", "2.0", "2.1", "2.2", "2.3", "2.4"):
            legado = {"notas": [{"texto": f"Legado {versao}"}, {"texto": f"Legado {versao}"}]}
            if versao is not None:
                legado["versao"] = versao
            assert restaurar(terceiro, legado)["importadas"]["notas"] == 2
            assert restaurar(terceiro, legado)["ignoradas"]["notas"] == 2
        legado_a = {"versao": "2.4", "exportado_em": "2026-01-01", "notas": [{"texto": "Mesmo conteúdo"}]}
        legado_b = {**legado_a, "exportado_em": "2026-01-02"}
        assert restaurar(terceiro, legado_a)["importadas"]["notas"] == 1
        assert restaurar(terceiro, legado_b)["importadas"]["notas"] == 1

        anterior = deepcopy(backup)
        anterior["versao"] = "2.4"
        for chave in main.MODULOS_BACKUP:
            for item in anterior[chave]:
                item.pop("backup_id")
                item.pop("backup_serie_id", None)
        r = restaurar(concorrente, anterior)
        assert sum(r["importadas"][k] for k in totais) == 0

        incompletos = [
            None, [], {}, {"versao": "99", "notas": []}, {"versao": "2.5", "notas": []},
            {"versao": "2.4", "notas": {}}, {"notas": [{"texto": "Válida"}, {"texto": "  "}]},
            {**backup, "notas": [backup["notas"][0]] * 2},
            {**backup, "datas_especiais": [{"id": "inválido"}]},
        ]
        for payload in incompletos:
            assert cliente.post("/restaurar", headers=falha, json=payload).status_code == 400
        for invalido in ("{ arquivo incompleto", '{"notas":[],"notas":[]}', '{"notas":[],"valor":NaN}'):
            assert cliente.post("/restaurar", headers=falha, content=invalido).status_code == 400
        assert cliente.post("/restaurar", json=backup).status_code == 401
        with patch.object(main, "restaurar_evolucao_backup", side_effect=RuntimeError("detalhe privado fictício")):
            res = cliente.post("/restaurar", headers=falha, json=backup)
            assert res.status_code == 500 and "detalhe privado" not in res.text
        assert not any(contar(exportar(falha)).values())
        assert restaurar(falha, backup)["importadas"]["tarefas"] == 2
        assert cliente.request("DELETE", "/auth/account", headers=destino, json={
            "senha": "Teste-backup-077!", "confirmacao": "EXCLUIR",
        }).status_code == 200
        with main.SessionLocal() as db:
            assert db.query(main.IdentidadeBackup).filter_by(user_id=uid_destino).count() == 0
        assert contar(exportar(origem))["notas"] == 3
        print("Concorrência, edição de séries distintas, formatos legados, rollback e exclusão de conta aprovados.", flush=True)


if __name__ == "__main__":
    with TemporaryDirectory(prefix="prioriza-backup-077-") as tmp:
        url = os.environ.get("PRIORIZA_TEST_DATABASE_URL", "")
        if url:
            parsed = urlsplit(url)
            assert parsed.hostname in {"127.0.0.1", "::1", "localhost"} and parsed.path.startswith("/pri077_")
        os.environ["DATABASE_URL"] = url or f"sqlite:///{tmp}/backup.sqlite"
        executar()
