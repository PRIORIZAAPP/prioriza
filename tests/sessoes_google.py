"""Regression tests using fictitious accounts, Google mocks and a disposable database."""

from datetime import datetime, timedelta, timezone
import os
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient


def executar():
    import main

    with TestClient(main.app, base_url="https://testserver") as cliente:
        def conta():
            email = f"{uuid4()}@example.invalid"
            res = cliente.post("/auth/register", json={"nome": "Teste 078", "email": email, "senha": "Local-078!"})
            assert res.status_code == 200, res.text
            return email, res.json()["token"], res.json()["user"]["id"]

        def cabecalho(token):
            return {"Authorization": f"Bearer {token}"}

        def login(email, senha="Local-078!"):
            r = cliente.post("/auth/login", json={"email": email, "senha": senha})
            assert r.status_code == 200, r.text
            return r.json()["token"]

        def autenticado(token):
            return cliente.get("/auth/me", headers=cabecalho(token)).status_code

        email, primeiro, uid = conta()
        _, outro, outro_id = conta()
        segundo = login(email)
        assert primeiro != segundo
        assert autenticado(primeiro) == autenticado(segundo) == 200
        assert cliente.get("/auth/me", params={"token": primeiro}).status_code == 401
        assert cliente.get("/auth/me", params={"access_token": primeiro}).status_code == 401
        assert cliente.post("/auth/logout").status_code == 401
        assert cliente.post("/auth/logout", headers=cabecalho(primeiro)).status_code == 200
        assert autenticado(primeiro) == 401 and autenticado(segundo) == 200
        with TestClient(main.app) as novo_cliente:
            assert novo_cliente.get("/auth/me", headers=cabecalho(segundo)).status_code == 200
        with main.SessionLocal() as db, patch.object(main, "JWT_EXP_HOURS", -1):
            expirado = main.criar_token_acesso(db.get(main.User, uid), db)
            db.commit()
        assert autenticado(expirado) == 401
        with main.SessionLocal() as db:
            chave = main.decodificar_token(segundo)["jti"]
            db.get(main.SessaoAutenticada, chave).expira_em = 0
            db.commit()
        assert autenticado(segundo) == 401
        segundo = login(email)

        with patch.object(main, "enviar_email_recuperacao_senha", return_value=True) as envio:
            assert cliente.post("/auth/forgot-password", json={"email": email}).status_code == 200
        redefinir = {"token": envio.call_args.args[-1], "senha": "Redefinida-078!"}
        assert cliente.post("/auth/reset-password", json=redefinir).status_code == 200
        assert cliente.post("/auth/reset-password", json=redefinir).status_code == 400
        assert autenticado(segundo) == 401 and autenticado(outro) == 200
        atual = login(email, redefinir["senha"])
        outro_dispositivo = login(email, redefinir["senha"])
        alteracao = {"senha_atual": redefinir["senha"], "nova_senha": "Mudanca-078!", "confirmar_senha": "Mudanca-078!"}
        r = cliente.post("/auth/change-password", headers=cabecalho(atual), json=alteracao)
        assert r.status_code == 200, r.text
        assert autenticado(atual) == autenticado(outro_dispositivo) == 401
        atual = r.json()["token"]
        assert autenticado(atual) == 200
        print("Sessões, isolamento, logout, expiração, redefinição e troca aprovados.", flush=True)

        with patch.multiple(main, GOOGLE_CLIENT_ID="app-ficticio", GOOGLE_CLIENT_SECRET="segredo-ficticio",
                            GOOGLE_REDIRECT_URI="https://testserver/auth/google/callback"):
            def iniciar(token=atual):
                resposta = cliente.post("/auth/google", headers=cabecalho(token))
                assert resposta.status_code == 200, resposta.text
                assert "no-store" in resposta.headers["cache-control"]
                url = urlsplit(resposta.json()["url"])
                qs = parse_qs(url.query)
                assert url.hostname == "accounts.google.com" and qs["code_challenge_method"] == ["S256"]
                assert token not in resposta.text and "token" not in qs
                return qs["state"][0]

            credencial = main.Credentials(
                token="access-ficticio", refresh_token="refresh-ficticio", client_secret="segredo-ficticio",
                client_id="cliente-ficticio", token_uri=main.GOOGLE_TOKEN_URI,
                expiry=datetime.now(timezone.utc) - timedelta(hours=1),
            )
            estado = iniciar()
            fluxo = Mock(credentials=credencial)
            with patch.object(main, "fluxo_oauth_google", return_value=fluxo):
                assert cliente.get("/auth/google/callback", params={"state": "diferente", "code": "ficticio"}).status_code == 400
                with TestClient(main.app, base_url="https://testserver") as navegador_externo:
                    r = navegador_externo.get("/auth/google/callback", params={"state": estado, "code": "ficticio"})
                    assert r.status_code == 400
                params = {"state": estado, "code": "ficticio"}
                r = cliente.get("/auth/google/callback", params=params, follow_redirects=False)
                assert r.status_code == 307 and r.headers["location"] == "/app?google=conectado"
                assert cliente.get("/auth/google/callback", params=params).status_code == 400
                assert fluxo.fetch_token.call_count == 1
            with main.SessionLocal() as db:
                row = db.query(main.GoogleCalendarToken).filter_by(user_id=uid).one()
                protegida = main.credenciais_google_protegidas(db)
                if main.IS_SQLITE or main.CONVERTER_CREDENCIAIS_GOOGLE_POSTGRES:
                    assert protegida
                assert all(valor.startswith(main.PREFIXO_CIFRA_GOOGLE) == protegida
                           for valor in (row.access_token, row.refresh_token, row.client_secret))
                assert not db.query(main.GoogleCalendarToken).filter_by(user_id=outro_id).count()

            def renovar(self, _request):
                self.token = "renovado-ficticio"
                self.expiry = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1)

            with main.SessionLocal() as db, patch.object(main.Credentials, "refresh", autospec=True, side_effect=renovar) as refresh:
                assert main.get_google_credentials(db, db.get(main.User, uid)).token == "renovado-ficticio"
                assert main.get_google_credentials(db, db.get(main.User, uid)).token == "renovado-ficticio"
                assert refresh.call_count == 1
            for rota in ("/google/status", "/backup"):
                r = cliente.get(rota, headers=cabecalho(atual))
                assert r.is_success
                assert all(v not in r.text for v in ("access-ficticio", "refresh-ficticio", "segredo-ficticio", "fernet:v1:"))
            backup = cliente.get("/backup", headers=cabecalho(atual)).json()
            assert backup["versao"] == "2.5"
            assert cliente.post("/restaurar", headers=cabecalho(outro), json=backup).is_success

            local = cliente.post("/tarefas", headers=cabecalho(atual), params={
                "titulo": "Compromisso local", "data": "2026-12-20", "all_day": True,
            })
            assert local.is_success
            with patch.object(main.requests, "post", side_effect=main.requests.Timeout) as revogar:
                r = cliente.post("/google/disconnect", headers=cabecalho(atual))
                assert r.status_code == 200 and not r.json()["revogacao_confirmada"]
                assert revogar.call_args.args == (main.GOOGLE_REVOGAR_URI,)
                assert revogar.call_args.kwargs["data"] == {"token": "refresh-ficticio"}
            assert cliente.get("/google/calendar/events", headers=cabecalho(atual)).status_code == 404
            assert cliente.get("/tarefas", headers=cabecalho(atual)).json()[0]["id"] == local.json()["id"]

            estado = iniciar()
            with patch.object(main, "fluxo_oauth_google", return_value=fluxo):
                assert cliente.get("/auth/google/callback", params={"state": estado, "code": "ficticio"},
                                   follow_redirects=False).status_code == 307
            with patch.object(main.requests, "post", return_value=Mock(status_code=200)):
                assert cliente.post("/google/disconnect", headers=cabecalho(outro)).json()["revogacao_confirmada"] is None
                assert cliente.get("/google/status", headers=cabecalho(atual)).json()["conectado"]
                assert cliente.post("/google/disconnect", headers=cabecalho(atual)).json()["revogacao_confirmada"]

            estado = iniciar()
            assert cliente.post("/auth/logout", headers=cabecalho(atual)).status_code == 200
            assert cliente.get("/auth/google/callback", params={"state": estado, "code": "ficticio"}).status_code == 400
            atual = login(email, alteracao["nova_senha"])
            token_extra = login(email, alteracao["nova_senha"])
            assert cliente.request("DELETE", "/auth/account", headers=cabecalho(atual), json={
                "senha": alteracao["nova_senha"], "confirmacao": "EXCLUIR",
            }).status_code == 200
            assert autenticado(atual) == autenticado(token_extra) == 401 and autenticado(outro) == 200
            print("OAuth, formato esperado, revogação, reconexão, backup e exclusão aprovados (Google simulado).")


if __name__ == "__main__":
    with TemporaryDirectory(prefix="prioriza-sessoes-") as tmp:
        url = os.environ.get("PRIORIZA_TEST_DATABASE_URL", "")
        if url:
            parsed = urlsplit(url)
            assert parsed.hostname in {"127.0.0.1", "::1", "localhost"} and parsed.path.startswith("/pri078_")
        os.environ["DATABASE_URL"] = url or f"sqlite:///{tmp}/sessoes.sqlite"
        os.environ["GOOGLE_CREDENTIALS_KEY"] = Fernet.generate_key().decode()
        executar()
