"""Executable integration test. Requires an empty local PostgreSQL 18 database."""
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit

from cryptography.fernet import Fernet


ROOT = Path(__file__).resolve().parents[1]
URL = os.environ["PRIORIZA_TEST_DATABASE_URL"]
parsed = urlsplit(URL)
assert parsed.scheme == "postgresql" and parsed.hostname in ("127.0.0.1", "localhost")
assert parsed.path.startswith("/pri0781_")
KEY = Fernet.generate_key().decode()


def processo(pasta, codigo, chave=KEY):
    env = {**os.environ, "DATABASE_URL": URL, "APP_ENV": "development"}
    for nome in ("RENDER", "RENDER_SERVICE_ID", "GOOGLE_CREDENTIALS_KEY"):
        env.pop(nome, None)
    if chave is not None:
        env["GOOGLE_CREDENTIALS_KEY"] = chave
    return subprocess.Popen(
        [sys.executable, "-c", codigo], cwd=pasta, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )


def executar(pasta, codigo, chave=KEY, erro=None):
    p = processo(pasta, codigo, chave)
    saida, stderr = p.communicate(timeout=35)
    if erro:
        assert p.returncode != 0 and erro in stderr, stderr
    else:
        assert p.returncode == 0, stderr
    return saida


def validar(legado, ponte, final):
    preparar = '''
from datetime import UTC, datetime, timedelta
from unittest.mock import patch
from fastapi.testclient import TestClient
from google.oauth2.credentials import Credentials
import main as m
api = TestClient(m.app)
def cred(token):
    return Credentials(token, refresh_token="refresh-ficticio", client_secret="segredo-ficticio",
                       client_id="cliente-ficticio", token_uri=m.GOOGLE_TOKEN_URI if hasattr(m, "GOOGLE_TOKEN_URI")
                       else "https://oauth2.googleapis.com/token")
def renovacao(credencial, request):
    credencial.token = "renovado-ficticio"
    credencial.expiry = datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1)
'''
    executar(legado, preparar + '''
resp = api.post("/auth/register", json={"nome":"Fictícia", "email":"transicao@example.invalid", "senha":"Teste-078.1!"})
assert resp.is_success, resp.text
with m.SessionLocal() as b:
    user = b.get(m.User, resp.json()["user"]["id"])
    m.salvar_google_credentials(b, user, cred("legado-ficticio"))
''')
    executar(final, "import main", erro="Implante primeiro")
    executar(ponte, "import main", chave=None, erro="GOOGLE_CREDENTIALS_KEY")
    executar(ponte, "import main", chave="ficticia", erro="GOOGLE_CREDENTIALS_KEY")
    executar(ponte, "import main")
    executar(legado, preparar + '''
with m.SessionLocal() as b:
    user = b.query(m.User).one()
    row = b.query(m.GoogleCalendarToken).one()
    assert row.access_token == "legado-ficticio"
    row.expiry = datetime.now(UTC)-timedelta(hours=1)
    b.commit()
    with patch.object(Credentials, "refresh", renovacao):
        assert m.get_google_credentials(b, user).token == "renovado-ficticio"
    assert api.post("/google/disconnect", headers={"Authorization":"Bearer "+api.post("/auth/login",
        json={"email":user.email,"senha":"Teste-078.1!"}).json()["token"]}).is_success
    m.salvar_google_credentials(b, user, cred("reconectado-ficticio"))
    assert b.query(m.GoogleCalendarToken).one().access_token == "reconectado-ficticio"
''')
    print("077 e preparação no mesmo banco: renovação, desconexão e reconexão da 077.", flush=True)
    hold = processo(ponte, preparar + '''
with m.SessionLocal() as b:
    user = b.query(m.User).one()
    assert not m.credenciais_google_protegidas(b)
    print("bloqueio obtido", flush=True)
    import time
    time.sleep(8)
    m.salvar_google_credentials(b, user, cred("ultima-gravacao-ficticia"))
''')
    for linha in hold.stdout:
        if "bloqueio obtido" in linha:
            break
    executar(final, "import main", erro="Não foi possível proteger")
    _, erro = hold.communicate(timeout=15)
    assert hold.returncode == 0, erro
    executar(ponte, preparar + '''
with m.SessionLocal() as b:
    assert not m.credenciais_google_protegidas(b)
    assert b.query(m.GoogleCalendarToken).one().access_token == "ultima-gravacao-ficticia"
''')
    executar(final, """
import os
from sqlalchemy import event
from sqlalchemy.engine import Engine
@event.listens_for(Engine, "after_cursor_execute")
def interromper(conn, cursor, statement, parameters, context, executemany):
    if "ADD CONSTRAINT google_credenciais_formato_protegido" in statement:
        print("interrupção controlada", file=__import__("sys").stderr, flush=True)
        os._exit(71)
import main
""", erro="interrupção controlada")
    executar(ponte, preparar + '''
with m.SessionLocal() as b:
    assert not m.credenciais_google_protegidas(b)
    assert b.query(m.GoogleCalendarToken).one().access_token == "ultima-gravacao-ficticia"
''')
    executar(final, "import main")
    executar(final, "import main")
    executar(final, "import main", chave=Fernet.generate_key().decode(), erro="não corresponde")
    executar(ponte, preparar + '''
with m.SessionLocal() as b:
    user = b.query(m.User).one()
    assert m.credenciais_google_protegidas(b)
    assert m.get_google_credentials(b, user).token == "ultima-gravacao-ficticia"
    assert b.query(m.GoogleCalendarToken).one().access_token.startswith("fernet:v1:")
    m.salvar_google_credentials(b, user, cred("ponte-cifrada"))
    assert m.get_google_credentials(b, user).token == "ponte-cifrada"
resp = api.post("/auth/login", json={"email":"transicao@example.invalid","senha":"Teste-078.1!"})
assert resp.is_success
assert api.post("/auth/logout", headers={"Authorization":"Bearer "+resp.json()["token"]}).is_success
print(resp.json()["token"])
''')
    executar(legado, preparar + '''
from sqlalchemy.exc import IntegrityError
with m.SessionLocal() as b:
    user = b.query(m.User).one()
    try:
        m.salvar_google_credentials(b, user, cred("texto-bloqueado-ficticio"))
    except IntegrityError as erro:
        assert erro.orig.diag.constraint_name == "google_credenciais_formato_protegido"
    else:
        raise AssertionError("Gravação legada aceita após conversão")
''')
    token = executar(final, preparar + '''
resp = api.post("/auth/login", json={"email":"transicao@example.invalid","senha":"Teste-078.1!"})
assert resp.is_success
token = resp.json()["token"]
assert api.post("/auth/logout", headers={"Authorization":"Bearer "+token}).is_success
print(token)
''').splitlines()[-1]
    executar(ponte, preparar + f'''
headers = {{"Authorization":"Bearer {token}"}}
assert api.get("/auth/me", headers=headers).status_code == 401
with m.SessionLocal() as b:
    user = b.query(m.User).one()
    assert m.get_google_credentials(b, user).token == "ponte-cifrada"
    with patch.object(m.requests, "post", return_value=type("Resposta", (), {{"status_code":200}})()):
        assert m.desconectar_google(b, user)["revogacao_confirmada"]
    assert b.query(m.GoogleCalendarToken).count() == 0
''')
    print("Timeout, retomada, reinício, cifra, gravações da ponte e rollback seguro verificados.", flush=True)


if __name__ == "__main__":
    validar(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve())
