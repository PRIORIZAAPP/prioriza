"""Valida a pré-verificação em um PostgreSQL local descartável, com papéis próprios."""
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ["PRIORIZA_TEST_DATABASE_URL"]
parsed = urlsplit(URL)
assert parsed.scheme == "postgresql" and parsed.hostname in {"127.0.0.1", "localhost"}
assert parsed.path.startswith("/pri0781_") and parsed.password is None


def iniciar(pasta, papel):
    url = make_url(URL).set(username=papel).render_as_string(hide_password=False)
    env = {**os.environ, "DATABASE_URL": url, "APP_ENV": "development"}
    for nome in ("RENDER", "RENDER_SERVICE_ID", "GOOGLE_CREDENTIALS_KEY"):
        env.pop(nome, None)
    return subprocess.run([sys.executable, "-c", "import main"], cwd=pasta, env=env,
                          capture_output=True, text=True, timeout=30)


def validar(preparacao, conversao):
    sufixo = uuid4().hex[:10]
    proprietario = f"pri0781_dono_{sufixo}"
    herdado = f"pri0781_herda_{sufixo}"
    restrito = f"pri0781_dml_{sufixo}"
    engine = create_engine(URL)
    tabela_fase = "google_credenciais_migracao"

    def estado():
        with engine.connect() as conn:
            if conn.execute(text(f"SELECT to_regclass('{tabela_fase}')")).scalar_one() is None:
                return None
            return conn.execute(text(f"SELECT convertida FROM {tabela_fase} WHERE id = 1")).scalar_one()

    def falha(pasta, papel, motivo, estado_esperado):
        res = iniciar(pasta, papel)
        assert res.returncode != 0 and motivo in res.stderr, res.stderr
        assert "Pré-verificação PostgreSQL: FALHA" in res.stderr
        assert "[MIGRAÇÃO]" not in res.stdout
        assert "Tabelas criadas" not in res.stdout
        assert "postgresql://" not in res.stderr and papel not in res.stderr
        assert estado() == estado_esperado

    with engine.begin() as conn:
        assert conn.execute(text("SELECT to_regclass('users')")).scalar_one() is None
        for papel in (proprietario, herdado, restrito):
            conn.execute(text(f"CREATE ROLE {papel} LOGIN"))
        conn.execute(text(f"GRANT USAGE, CREATE ON SCHEMA public TO {proprietario}, {restrito}"))
        conn.execute(text(f"GRANT {proprietario} TO {herdado} WITH INHERIT TRUE"))
        conn.execute(text(f"GRANT {proprietario} TO {restrito} WITH INHERIT FALSE"))
        conn.execute(text("CREATE TABLE google_calendar_tokens (id SERIAL PRIMARY KEY)"))
        conn.execute(text(f"ALTER TABLE google_calendar_tokens OWNER TO {proprietario}"))
        conn.execute(text(f"GRANT SELECT, INSERT, UPDATE, DELETE ON google_calendar_tokens TO {restrito}"))
        conn.execute(text(f"GRANT USAGE ON SEQUENCE google_calendar_tokens_id_seq TO {restrito}"))

    falha(preparacao, restrito, "propriedade efetiva", None)
    with engine.begin() as conn:
        # Apenas a tabela sintética deste teste é removida.
        conn.execute(text("DROP TABLE google_calendar_tokens"))
        conn.execute(text(f"REVOKE CREATE ON SCHEMA public FROM {proprietario}"))
    falha(preparacao, herdado, "CREATE no esquema", None)
    with engine.begin() as conn:
        conn.execute(text(f"GRANT CREATE ON SCHEMA public TO {proprietario}"))
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
    falha(preparacao, herdado, "REFERENCES em users.id", None)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE users"))
    res = iniciar(preparacao, herdado)
    assert res.returncode == 0 and "Pré-verificação PostgreSQL: APROVADA" in res.stdout, res.stderr
    assert res.stdout.index("Pré-verificação") < res.stdout.index("Tabelas criadas")
    assert estado() is False

    with engine.begin() as conn:
        conn.execute(text(f"GRANT SELECT, INSERT, DELETE ON auth_sessoes TO {restrito}"))
        conn.execute(text(f"GRANT SELECT, INSERT, UPDATE, DELETE ON google_autorizacoes, google_calendar_tokens TO {restrito}"))
        conn.execute(text(f"GRANT SELECT, INSERT, UPDATE ON {tabela_fase} TO {restrito}"))
    falha(conversao, restrito, "propriedade efetiva", False)
    with engine.begin() as conn:
        conn.execute(text(f"REVOKE UPDATE ON google_calendar_tokens FROM {herdado}"))
    falha(conversao, herdado, "UPDATE em google_calendar_tokens", False)
    with engine.begin() as conn:
        conn.execute(text(f"GRANT UPDATE ON google_calendar_tokens TO {herdado}"))
        conn.execute(text(f"ALTER ROLE {herdado} SET default_transaction_read_only = on"))
    falha(conversao, herdado, "conexão PostgreSQL gravável", False)
    with engine.begin() as conn:
        conn.execute(text(f"ALTER ROLE {herdado} RESET default_transaction_read_only"))

    res = iniciar(conversao, herdado)
    assert res.returncode == 0 and "Pré-verificação PostgreSQL: APROVADA" in res.stdout, res.stderr
    assert estado() is True
    falha(conversao, "papel_inexistente_" + sufixo, "Não foi possível verificar", True)
    print("PostgreSQL 18: propriedade herdada aprovada nas duas etapas, DML sem propriedade efetiva, CREATE e REFERENCES ausentes e conexão indisponível rejeitados antes da migração.")


if __name__ == "__main__":
    validar(ROOT, Path(sys.argv[1]).resolve())
