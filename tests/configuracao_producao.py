"""Validate startup with fictitious configuration, without contacting production."""

import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

BASE = Path(__file__).resolve().parents[1]
JWT = "chave-ficticia-jwt-exclusiva-do-teste"
SESSAO = "chave-ficticia-sessao-exclusiva-do-teste"


def importar(ambiente, codigo="import main"):
    variaveis = {k: v for k, v in os.environ.items() if k in {"PATH", "LANG", "SYSTEMROOT", "TMPDIR"}}
    return subprocess.run(
        [sys.executable, "-c", codigo], cwd=BASE, env={**variaveis, **ambiente},
        capture_output=True, text=True, timeout=30,
    )


def exige(ambiente, nome):
    resultado = importar(ambiente)
    assert resultado.returncode != 0 and f"[CONFIG] {nome}" in resultado.stderr, resultado.stderr
    assert JWT not in resultado.stderr and SESSAO not in resultado.stderr


def executar():
    producao = {"APP_ENV": "production", "JWT_SECRET": JWT, "SESSION_SECRET": SESSAO}
    exige({"APP_ENV": "production"}, "JWT_SECRET")
    exige({"RENDER": "true", "APP_ENV": "development", "JWT_SECRET": JWT}, "SESSION_SECRET")
    exige({"RENDER_SERVICE_ID": "srv-teste"}, "JWT_SECRET")
    exige({**producao, "JWT_SECRET": "prioriza_jwt_dev_only_change_me"}, "JWT_SECRET")
    exige({**producao, "SESSION_SECRET": "prioriza_google_session_secret_trocar_em_producao"}, "SESSION_SECRET")
    exige(producao, "DATABASE_URL")
    exige({**producao, "DATABASE_URL": "sqlite:///:memory:"}, "DATABASE_URL")
    marcador = "confidencial-ficticio-na-url"
    invalido = importar({**producao, "DATABASE_URL": marcador})
    assert invalido.returncode != 0 and marcador not in invalido.stderr

    with TemporaryDirectory() as pasta:
        dev = importar({"DATABASE_URL": f"sqlite:///{pasta}/teste.sqlite"}, """
import contextlib
import io
import logging
from unittest.mock import Mock, patch
import main

assert not main.AMBIENTE_PRODUCAO
filtro = main.OcultarQueryNoLogDeAcesso()
args = ("localhost", "GET", "/reset-password?token=privado-ficticio", "1.1", 200)
registro = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, "%s %s %s %s %s", args, None)
assert filtro.filter(registro)
assert "/reset-password" in registro.getMessage()
assert "privado-ficticio" not in registro.getMessage()
saida = io.StringIO()
with patch.multiple(main, RESEND_API_KEY="ficticio", EMAIL_FROM="teste@example.invalid"):
    with patch.object(main.requests, "post", return_value=Mock(ok=False, status_code=400, text="corpo-privado-ficticio")):
        with contextlib.redirect_stdout(saida):
            assert not main.enviar_email_recuperacao_senha("teste@example.invalid", "Teste", "ficticio")
assert "400" in saida.getvalue()
assert "corpo-privado-ficticio" not in saida.getvalue()
""")
        assert dev.returncode == 0, dev.stderr

    banco = os.environ.get("PRIORIZA_TEST_DATABASE_URL", "")
    if banco:
        url = urlsplit(banco)
        if url.scheme != "postgresql" or url.hostname not in {"localhost", "127.0.0.1", "::1"} or not url.path.startswith("/pri076_"):
            raise ValueError("Use um banco PostgreSQL descartável pri076_ em loopback.")
        resultado = importar({**producao, "DATABASE_URL": banco}, """
from fastapi.testclient import TestClient
import main

assert main.AMBIENTE_PRODUCAO
assert main.usa_https_only
assert not main.google_configurado()
assert not main.enviar_email_recuperacao_senha("teste@example.invalid", "Teste", "ficticio")
with TestClient(main.app) as cliente:
    assert cliente.get("/health").status_code == 200
    assert cliente.get("/auth/me").status_code == 401
""")
        assert resultado.returncode == 0, resultado.stderr
        print("Produção simulada com PostgreSQL e serviços opcionais ausentes aprovada.")

    print("Startup local, rejeição de configuração insegura e sanitização de logs aprovados.")


if __name__ == "__main__":
    executar()
