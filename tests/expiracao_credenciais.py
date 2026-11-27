"""Run with PYTHONPATH=. python tests/expiracao_credenciais.py on an isolated database."""

import os
from datetime import datetime, timedelta, timezone
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient


def executar():
    import main

    email = f"{uuid4()}@example.invalid"
    senha = "Teste-local-075!"
    with TestClient(main.app) as cliente:
        conta = cliente.post("/auth/register", json={"nome": "Teste", "email": email, "senha": senha})
        assert conta.status_code == 200
        user_id = conta.json()["user"]["id"]
        with patch.object(main, "enviar_email_recuperacao_senha", return_value=True) as enviar:
            assert cliente.post("/auth/forgot-password", json={"email": email}).status_code == 200
            assert enviar.call_count == 1
        token = enviar.call_args.args[-1]
        redefinicao = {"token": token, "senha": "Nova-senha-075!"}
        assert cliente.post("/auth/reset-password", json=redefinicao).status_code == 200
        assert cliente.post("/auth/reset-password", json=redefinicao).status_code == 400
        assert cliente.post("/auth/login", json={"email": email, "senha": senha}).status_code == 401
        assert cliente.post("/auth/login", json={"email": email, "senha": redefinicao["senha"]}).status_code == 200

        with main.SessionLocal() as db:
            usuario = db.get(main.User, user_id)
            expirada = main.Credentials(
                token="token-ficticio",
                refresh_token="refresh-ficticio",
                token_uri="https://oauth2.googleapis.com/token",
                client_id="id-ficticio",
                client_secret="secret-ficticio",
                expiry=datetime.now(timezone.utc) - timedelta(minutes=1),
            )
            main.salvar_google_credentials(db, usuario, expirada)

            def renovar(credencial, _request):
                credencial.token = "renovado-ficticio"
                credencial.expiry = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1)

            with patch.object(main.Credentials, "refresh", autospec=True, side_effect=renovar) as refresh:
                assert main.get_google_credentials(db, usuario).token == "renovado-ficticio"
                assert main.get_google_credentials(db, usuario).token == "renovado-ficticio"
                assert refresh.call_count == 1

    print("Redefinição de uso único e renovação Google simulada aprovadas.")


if __name__ == "__main__":
    with TemporaryDirectory() as temporario:
        banco = os.environ.get("PRIORIZA_TEST_DATABASE_URL", "")
        if banco and (urlsplit(banco).hostname not in {"127.0.0.1", "::1", "localhost"}
                      or not urlsplit(banco).path.startswith("/pri075_")):
            raise ValueError("Use um banco descartável pri075_ em loopback.")
        os.environ["DATABASE_URL"] = banco or f"sqlite:///{temporario}/expiracao.sqlite"
        os.environ["GOOGLE_CREDENTIALS_KEY"] = Fernet.generate_key().decode()
        executar()
