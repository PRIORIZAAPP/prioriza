import json
import os
import threading
import unicodedata
import base64
import hashlib
import hmac
import re
import secrets
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, Form, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, create_engine, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from starlette.middleware.sessions import SessionMiddleware

try:
    from passlib.context import CryptContext
except Exception:
    CryptContext = None

# ============================================================
# CONFIG GERAL
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
TIMEZONE_PADRAO = "America/Sao_Paulo"
UTC = timezone.utc
CHECKLIST_HORA_LIBERACAO = int(os.environ.get("CHECKLIST_HORA_LIBERACAO", "5"))
JWT_SECRET = os.environ.get("JWT_SECRET", "prioriza_jwt_dev_only_change_me").strip()
JWT_EXP_HOURS = int(os.environ.get("JWT_EXP_HOURS", "168"))
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ADMIN_EMAIL = (os.environ.get("ADMIN_EMAIL", "").strip().lower())

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if not DATABASE_URL:
    sqlite_path = BASE_DIR / "prioriza.db"
    DATABASE_URL = f"sqlite:///{sqlite_path}"
    print(f"[DB] DATABASE_URL não definida. Usando SQLite local: {sqlite_path}")
else:
    print(f"[DB] DATABASE_URL encontrada: {DATABASE_URL[:60]}")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    print("[DB] URL ajustada de postgres:// para postgresql://")

IS_SQLITE = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if IS_SQLITE else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

app = FastAPI(title="PRIORIZA API")

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REDIRECT_URI = os.environ.get(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/auth/google/callback",
).strip()
GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar"]
SESSION_SECRET = os.environ.get(
    "SESSION_SECRET",
    "prioriza_google_session_secret_trocar_em_producao",
).strip()

usa_https_only = not (
    "localhost" in GOOGLE_REDIRECT_URI.lower() or "127.0.0.1" in GOOGLE_REDIRECT_URI.lower()
)

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="lax",
    https_only=usa_https_only,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# MODELOS
# ============================================================

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True, index=True)
    senha_hash = Column(Text, nullable=False)
    ativo = Column(Boolean, default=True)
    criado_em = Column(DateTime, default=lambda: datetime.now(UTC))
    ultimo_acesso = Column(DateTime, nullable=True)
    total_acessos = Column(Integer, default=0, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "nome": self.nome,
            "email": self.email,
            "ativo": self.ativo,
            "criado_em": self.criado_em.isoformat() if self.criado_em else None,
            "ultimo_acesso": self.ultimo_acesso.isoformat() if self.ultimo_acesso else None,
            "total_acessos": int(self.total_acessos or 0),
            "is_admin": bool(self.is_admin),
        }


class Tarefa(Base):
    __tablename__ = "tarefas"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    titulo = Column(String, nullable=False)
    descricao = Column(String, default="")
    origem = Column(String, default="")
    local = Column(String, default="")
    data = Column(String, nullable=False)  # YYYY-MM-DD
    hora_inicio = Column(String, default="")  # HH:MM
    hora_fim = Column(String, default="")  # HH:MM
    duracao_min = Column(Integer, default=30)
    prioridade = Column(Integer, default=2)
    status = Column(String, default="pendente")
    tipo_evento = Column(String, default="prioriza")
    origem_evento = Column(String, default="prioriza")
    google_event_id = Column(String, nullable=True, index=True)
    google_html_link = Column(Text, nullable=True)
    sincronizado_google = Column(Boolean, default=False)
    ultima_sync_google = Column(DateTime, nullable=True)
    all_day = Column(Boolean, default=False)
    ativo = Column(Boolean, default=True)
    criado_em = Column(DateTime, default=lambda: datetime.now(UTC))

    def to_dict(self):
        hora_fim = self.hora_fim or calcular_hora_fim(self.hora_inicio, self.duracao_min)
        return {
            "id": self.id,
            "titulo": self.titulo,
            "descricao": self.descricao or "",
            "origem": self.origem or "",
            "local": self.local or "",
            "data": self.data,
            "hora_inicio": self.hora_inicio or "",
            "hora_fim": hora_fim or "",
            "duracao_min": self.duracao_min or 0,
            "prioridade": self.prioridade,
            "status": self.status,
            "tipo_evento": self.tipo_evento or "prioriza",
            "origem_evento": self.origem_evento or "prioriza",
            "google_event_id": self.google_event_id,
            "google_html_link": self.google_html_link,
            "link": self.google_html_link,
            "sincronizado_google": bool(self.sincronizado_google),
            "ultima_sync_google": self.ultima_sync_google.isoformat() if self.ultima_sync_google else None,
            "all_day": bool(self.all_day),
            "ativo": self.ativo,
            "criado_em": self.criado_em.isoformat() if self.criado_em else None,
        }


class ChecklistItem(Base):
    __tablename__ = "checklist"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    titulo = Column(String, nullable=False)
    origem = Column(String, default="")
    frequencia = Column(String, default="Semanal")
    frequencia_interna = Column(String, default="SEMANAL")
    status = Column(String, default="pendente")
    ativo = Column(Boolean, default=True)
    ultimo_exec = Column(DateTime, nullable=True)
    criado_em = Column(DateTime, default=lambda: datetime.now(UTC))

    def to_dict(self, incluir_pode_hoje: bool = False):
        frequencia_corrigida = frequencia_interna_efetiva(self.frequencia, self.frequencia_interna)
        proxima = calcular_proxima_execucao(self)
        dias = calcular_dias_para_proxima(self)
        atraso = dias < 0
        status_exibicao = self.status
        if atraso and self.status != "feito":
            status_exibicao = "atrasado"

        d = {
            "id": self.id,
            "titulo": self.titulo,
            "origem": self.origem,
            "frequencia": self.frequencia,
            "frequencia_interna": frequencia_corrigida,
            "status": self.status,
            "status_exibicao": status_exibicao,
            "ativo": self.ativo,
            "ultimo_exec": self.ultimo_exec.isoformat() if self.ultimo_exec else None,
            "criado_em": self.criado_em.isoformat() if self.criado_em else None,
        }
        if incluir_pode_hoje:
            d["pode_mostrar_hoje"] = calcular_pode_mostrar_hoje(self)
            d["proxima_execucao"] = proxima
            d["dias_para_proxima"] = dias
            d["atrasado"] = atraso
            d["mensagem_status"] = calcular_mensagem_status_checklist(self)
        return d


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    texto = Column(String, nullable=False)
    data = Column(String, default="")
    tipo = Column(String, default="GERAL")
    status = Column(String, default="pendente")
    ativo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    def to_dict(self):
        return {
            "id": self.id,
            "texto": self.texto,
            "data": self.data,
            "tipo": self.tipo,
            "status": self.status,
            "ativo": self.ativo,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    ativo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    def to_dict(self):
        return {
            "id": self.id,
            "endpoint": self.endpoint,
            "ativo": self.ativo,
        }


class GoogleCalendarToken(Base):
    __tablename__ = "google_calendar_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    provider = Column(String, default="google", nullable=False)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=True)
    token_uri = Column(String, default="https://oauth2.googleapis.com/token")
    client_id = Column(Text, nullable=False)
    client_secret = Column(Text, nullable=False)
    scopes = Column(Text, default="")
    expiry = Column(DateTime, nullable=True)
    ativo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "provider": self.provider,
            "expiry": self.expiry.isoformat() if self.expiry else None,
            "ativo": self.ativo,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class UserAccessLog(Base):
    __tablename__ = "user_access_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    acessado_em = Column(DateTime, default=lambda: datetime.now(UTC), nullable=False)


# ============================================================
# DB / MIGRAÇÕES
# ============================================================

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto") if CryptContext else None


def _b64url_encode(valor: bytes) -> str:
    return base64.urlsafe_b64encode(valor).rstrip(b"=").decode("utf-8")


def _b64url_decode(valor: str) -> bytes:
    padding = "=" * (-len(valor) % 4)
    return base64.urlsafe_b64decode((valor + padding).encode("utf-8"))


def hash_senha(senha: str) -> str:
    senha = (senha or "").strip()
    if pwd_context:
        return pwd_context.hash(senha)
    salt = secrets.token_bytes(16)
    iteracoes = 200_000
    derivado = hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), salt, iteracoes)
    return f"pbkdf2_sha256${iteracoes}${_b64url_encode(salt)}${_b64url_encode(derivado)}"


def verificar_senha(senha: str, senha_hash: str) -> bool:
    senha = senha or ""
    senha_hash = senha_hash or ""
    if pwd_context and not senha_hash.startswith("pbkdf2_sha256$"):
        try:
            return pwd_context.verify(senha, senha_hash)
        except Exception:
            return False
    try:
        algoritmo, iteracoes, salt_b64, hash_b64 = senha_hash.split("$", 3)
        if algoritmo != "pbkdf2_sha256":
            return False
        salt = _b64url_decode(salt_b64)
        esperado = _b64url_decode(hash_b64)
        derivado = hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), salt, int(iteracoes))
        return hmac.compare_digest(esperado, derivado)
    except Exception:
        return False


def criar_token_acesso(user: User) -> str:
    agora = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "nome": user.nome,
        "iat": int(agora.timestamp()),
        "exp": int((agora + timedelta(hours=JWT_EXP_HOURS)).timestamp()),
    }
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    assinatura = hmac.new(
        JWT_SECRET.encode("utf-8"),
        f"{header_b64}.{payload_b64}".encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(assinatura)}"


def decodificar_token(token: str) -> dict[str, Any]:
    try:
        header_b64, payload_b64, assinatura_b64 = token.split(".")
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Token inválido.") from e

    assinatura_esperada = hmac.new(
        JWT_SECRET.encode("utf-8"),
        f"{header_b64}.{payload_b64}".encode("utf-8"),
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(_b64url_encode(assinatura_esperada), assinatura_b64):
        raise HTTPException(status_code=401, detail="Token inválido.")

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=401, detail="Token inválido.") from e

    if int(payload.get("exp", 0)) < int(datetime.now(UTC).timestamp()):
        raise HTTPException(status_code=401, detail="Sessão expirada.")
    return payload


def normalizar_email(email: str) -> str:
    return (email or "").strip().lower()


def validar_email(email: str) -> bool:
    return bool(EMAIL_RE.match(normalizar_email(email)))


def buscar_usuario_por_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == normalizar_email(email)).first()


def email_admin_configurado(email: str) -> bool:
    email_normalizado = normalizar_email(email)
    return bool(ADMIN_EMAIL) and email_normalizado == ADMIN_EMAIL


def init_db():
    Base.metadata.create_all(bind=engine)
    print("[DB] Tabelas criadas/verificadas com sucesso.")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_token_from_request(request: Request) -> str:
    auth = (request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return (request.query_params.get("token") or request.query_params.get("access_token") or "").strip()


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = get_token_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado.")
    payload = decodificar_token(token)
    try:
        user_id = int(payload.get("sub"))
    except Exception as e:
        raise HTTPException(status_code=401, detail="Token inválido.") from e
    user = db.query(User).filter(User.id == user_id, User.ativo == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado.")
    return user


def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if not bool(getattr(current_user, "is_admin", False)):
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador.")
    return current_user


def garantir_user_id(user_id: Optional[int], entidade: str = "registro") -> int:
    try:
        valor = int(user_id or 0)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Usuário inválido para {entidade}.") from e
    if valor <= 0:
        raise HTTPException(status_code=401, detail=f"Usuário inválido para {entidade}.")
    return valor


def registrar_acesso_usuario(db: Session, user: User):
    agora = datetime.now(UTC)
    user.ultimo_acesso = agora
    user.total_acessos = int(user.total_acessos or 0) + 1
    db.add(UserAccessLog(user_id=garantir_user_id(user.id, "acesso de usuário"), acessado_em=agora))


def executar_sql_seguro(sql: str):
    try:
        with engine.connect() as conn:
            conn.execute(text(sql))
            conn.commit()
        return True, None
    except Exception as e:
        return False, str(e)


def _sql_tipo_coluna(nome_coluna: str) -> str:
    if nome_coluna == "user_id":
        return "INTEGER"
    if nome_coluna == "total_acessos":
        return "INTEGER"
    if nome_coluna in ("ativo", "is_admin", "sincronizado_google", "all_day"):
        return "BOOLEAN"
    if nome_coluna in ("criado_em", "ultimo_acesso", "ultima_sync_google"):
        return "TIMESTAMP" if not IS_SQLITE else "DATETIME"
    if nome_coluna in ("descricao", "local", "hora_fim", "tipo_evento", "origem_evento", "google_event_id"):
        return "VARCHAR"
    if nome_coluna == "google_html_link":
        return "TEXT"
    return "VARCHAR"


def _sql_default_coluna(nome_coluna: str) -> str:
    if nome_coluna == "user_id":
        return ""
    if nome_coluna == "total_acessos":
        return " DEFAULT 0"
    if nome_coluna == "is_admin":
        return " DEFAULT false" if not IS_SQLITE else " DEFAULT 0"
    if nome_coluna in ("descricao", "local", "hora_fim"):
        return " DEFAULT ''"
    if nome_coluna in ("tipo_evento", "origem_evento"):
        return " DEFAULT 'prioriza'"
    if nome_coluna in ("ativo", "sincronizado_google", "all_day"):
        return " DEFAULT false" if not IS_SQLITE else " DEFAULT 0"
    return ""


def garantir_coluna_tabela(nome_tabela: str, nome_coluna: str):
    try:
        insp = inspect(engine)
        colunas_existentes = {c["name"] for c in insp.get_columns(nome_tabela)}
    except Exception as e:
        print(f"[MIGRAÇÃO] Não foi possível inspecionar {nome_tabela}: {e}")
        return

    if nome_coluna in colunas_existentes:
        return

    sql = (
        f"ALTER TABLE {nome_tabela} ADD COLUMN {nome_coluna} "
        f"{_sql_tipo_coluna(nome_coluna)}{_sql_default_coluna(nome_coluna)}"
    )
    ok, erro = executar_sql_seguro(sql)
    if ok:
        print(f"[MIGRAÇÃO] Coluna criada: {nome_tabela}.{nome_coluna}")
    else:
        print(f"[MIGRAÇÃO] Falha ao criar {nome_tabela}.{nome_coluna}: {erro}")


def preencher_nulos_coluna(nome_tabela: str, nome_coluna: str, valor_sql: str):
    sql = f"UPDATE {nome_tabela} SET {nome_coluna} = {valor_sql} WHERE {nome_coluna} IS NULL"
    ok, erro = executar_sql_seguro(sql)
    if ok:
        print(f"[MIGRAÇÃO] Nulos preenchidos: {nome_tabela}.{nome_coluna}")
    else:
        print(f"[MIGRAÇÃO] Falha ao preencher nulos em {nome_tabela}.{nome_coluna}: {erro}")


def rodar_migracoes_automaticas():
    init_db()

    for coluna in ("ultimo_acesso", "total_acessos", "is_admin"):
        garantir_coluna_tabela("users", coluna)

    preencher_nulos_coluna("users", "total_acessos", "0")
    preencher_nulos_coluna("users", "is_admin", "false" if not IS_SQLITE else "0")

    colunas_tarefas = [
        "user_id",
        "descricao",
        "local",
        "hora_fim",
        "tipo_evento",
        "origem_evento",
        "google_event_id",
        "google_html_link",
        "sincronizado_google",
        "ultima_sync_google",
        "all_day",
    ]
    for coluna in colunas_tarefas:
        garantir_coluna_tabela("tarefas", coluna)

    for tabela in ("checklist", "notes", "push_subscriptions", "google_calendar_tokens"):
        garantir_coluna_tabela(tabela, "user_id")

    try:
        PushSubscription.__table__.create(bind=engine, checkfirst=True)
    except Exception as e:
        print(f"[MIGRAÇÃO] Aviso ao criar push_subscriptions: {e}")

    try:
        UserAccessLog.__table__.create(bind=engine, checkfirst=True)
    except Exception as e:
        print(f"[MIGRAÇÃO] Aviso ao criar user_access_logs: {e}")

    for tabela in ("tarefas", "checklist", "notes", "push_subscriptions", "google_calendar_tokens"):
        try:
            with engine.connect() as conn:
                total_orfaos = conn.execute(text(f"SELECT COUNT(*) FROM {tabela} WHERE user_id IS NULL")).scalar() or 0
            if total_orfaos:
                print(f"[MIGRAÇÃO] Aviso: {tabela} possui {int(total_orfaos)} registro(s) antigo(s) sem user_id. Eles não serão vinculados automaticamente.")
        except Exception as e:
            print(f"[MIGRAÇÃO] Aviso ao verificar órfãos em {tabela}: {e}")


rodar_migracoes_automaticas()


# ============================================================
# HELPERS
# ============================================================

def validar_data_iso(data_str: str) -> bool:
    try:
        datetime.strptime(data_str.strip(), "%Y-%m-%d")
        return True
    except Exception:
        return False


def validar_hora(hora_str: str) -> bool:
    if not hora_str:
        return True
    try:
        datetime.strptime(hora_str.strip(), "%H:%M")
        return True
    except Exception:
        return False


def hora_para_minutos(hora_str: str) -> int:
    hh, mm = map(int, hora_str.split(":"))
    return hh * 60 + mm


def minutos_para_hora(total_min: int) -> str:
    total_min = max(0, min(total_min, 23 * 60 + 59))
    hh = total_min // 60
    mm = total_min % 60
    return f"{hh:02d}:{mm:02d}"


def calcular_hora_fim(hora_inicio: str, duracao_min: Optional[int]) -> str:
    if not hora_inicio or not validar_hora(hora_inicio):
        return ""
    duracao = int(duracao_min or 0)
    return minutos_para_hora(hora_para_minutos(hora_inicio) + duracao)


def normalizar_status(status: Optional[str]) -> str:
    s = (status or "pendente").strip().lower()
    if s in {"concluida", "concluído", "concluido"}:
        return "feito"
    if s in {"cancelado", "cancelada"}:
        return "cancelada"
    if s not in {"pendente", "em_andamento", "feito", "cancelada", "atrasado", "reagendamento_sugerido", "reagendada_confirmada", "reagendada_manual", "pendente_ajuste"}:
        return "pendente"
    return s

def status_nao_concluido(status: Optional[str]) -> bool:
    return normalizar_status(status) in {"pendente", "em_andamento", "atrasado", "reagendamento_sugerido", "pendente_ajuste"}


def _agora_minutos() -> int:
    agora = _agora_local()
    return agora.hour * 60 + agora.minute


def _duracao_tarefa_minutos(tarefa: Tarefa) -> int:
    try:
        return max(1, int(tarefa.duracao_min or 30))
    except Exception:
        return 30


def _faixa_tarefa_minutos(tarefa: Tarefa) -> tuple[Optional[int], Optional[int]]:
    hora_inicio = (tarefa.hora_inicio or "").strip()
    if not hora_inicio or not validar_hora(hora_inicio):
        return None, None
    inicio = hora_para_minutos(hora_inicio)
    fim = inicio + _duracao_tarefa_minutos(tarefa)
    return inicio, fim


def _resumo_texto_inteligencia(total_tarefas: int, pendentes: int, atrasadas: list[dict[str, Any]], conflitos: list[dict[str, Any]]) -> str:
    peso = total_tarefas + pendentes + (len(atrasadas) * 2) + (len(conflitos) * 2)
    if peso >= 10:
        return "Dia pesado"
    if peso >= 5:
        return "Dia moderado"
    return "Dia tranquilo"


def frequencia_interna_efetiva(freq_label: Optional[str], freq_interna: Optional[str]) -> str:
    """
    Usa primeiro a frequência textual exibida ao usuário.
    Se ela vier vazia, cai para a frequência interna já salva.
    Isso evita divergência do tipo:
    frequencia='Diária' + frequencia_interna='SEMANAL'
    """
    freq_label = (freq_label or "").strip()
    if freq_label:
        return normalizar_frequencia_interna(freq_label)

    freq_interna = (freq_interna or "").strip().upper()
    if freq_interna in {"DIARIA", "SEMANAL", "MENSAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL", "UNICO"}:
        return freq_interna
    return "SEMANAL"


def _texto_sem_acentos(valor: str) -> str:
    valor = (valor or "").strip().lower()
    return "".join(
        ch for ch in unicodedata.normalize("NFD", valor)
        if unicodedata.category(ch) != "Mn"
    )


def _texto_sync_chave(valor: Optional[str]) -> str:
    base = _texto_sem_acentos(valor or "")
    return " ".join(base.split())


def _bool_from_value(valor: Any) -> bool:
    return str(valor).strip().lower() in {"1", "true", "sim", "yes", "on"}


def _parse_datetime_sync(valor: Any) -> Optional[datetime]:
    if not valor:
        return None
    if isinstance(valor, datetime):
        return valor if valor.tzinfo else valor.replace(tzinfo=UTC)
    try:
        texto = str(valor).strip().replace("Z", "+00:00")
        parsed = datetime.fromisoformat(texto)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except Exception:
        return None


def _hora_sync_normalizada(valor: Optional[str], all_day: bool = False) -> str:
    if all_day:
        return ""
    hora = (valor or "").strip()
    if hora.lower() == "dia todo":
        return ""
    return hora


def _contexto_match_tarefa(tarefa: Tarefa) -> str:
    return _texto_sync_chave(tarefa.local or tarefa.origem or "")


def _buscar_tarefa_por_google_event_id(db: Session, user_id: int, google_event_id: Optional[str]) -> Optional[Tarefa]:
    event_id = (google_event_id or "").strip()
    if not event_id:
        return None
    return db.query(Tarefa).filter(
        Tarefa.ativo == True,
        Tarefa.user_id == user_id,
        Tarefa.google_event_id == event_id,
    ).order_by(Tarefa.id.asc()).first()


def _buscar_tarefa_aproximada_google(
    db: Session,
    user_id: int,
    titulo: str,
    data_ref: str,
    hora_inicio: str,
    origem: str = "",
    local: str = "",
) -> Optional[Tarefa]:
    titulo_ref = _texto_sync_chave(titulo)
    hora_ref = _hora_sync_normalizada(hora_inicio)
    contexto_ref = _texto_sync_chave(local or origem)
    candidatas = db.query(Tarefa).filter(
        Tarefa.ativo == True,
        Tarefa.user_id == user_id,
        Tarefa.data == data_ref,
    ).all()

    for tarefa in candidatas:
        if _texto_sync_chave(tarefa.titulo) != titulo_ref:
            continue
        if _hora_sync_normalizada(tarefa.hora_inicio, bool(tarefa.all_day)) != hora_ref:
            continue
        if contexto_ref and _contexto_match_tarefa(tarefa) != contexto_ref:
            continue
        return tarefa
    return None


def _aplicar_payload_google_em_tarefa(tarefa: Tarefa, payload: dict[str, Any]) -> Tarefa:
    preservar_origem_prioriza = (tarefa.origem_evento or "").strip().lower() == "prioriza" or (tarefa.tipo_evento or "").strip().lower() == "prioriza"
    titulo = (payload.get("titulo") or tarefa.titulo or "").strip()
    descricao = payload.get("descricao")
    origem = payload.get("origem")
    local = payload.get("local")
    data_ref = (payload.get("data") or tarefa.data or "").strip()
    all_day = _bool_from_value(payload.get("all_day"))
    hora_inicio = _hora_sync_normalizada(payload.get("hora_inicio"), all_day)
    hora_fim = _hora_sync_normalizada(payload.get("hora_fim"), all_day)

    tarefa.titulo = titulo or tarefa.titulo
    if descricao is not None:
        descricao_limpa = str(descricao).strip()
        if descricao_limpa or not preservar_origem_prioriza:
            tarefa.descricao = descricao_limpa
    origem_limpa = str(origem or "").strip()
    local_limpo = str(local or "").strip()
    if preservar_origem_prioriza:
        if local_limpo and not (tarefa.local or "").strip():
            tarefa.local = local_limpo
    else:
        tarefa.origem = origem_limpa
        tarefa.local = local_limpo
    if data_ref:
        tarefa.data = data_ref
    tarefa.all_day = all_day
    tarefa.hora_inicio = "" if all_day else hora_inicio
    tarefa.hora_fim = "" if all_day else hora_fim

    try:
        tarefa.duracao_min = int(payload.get("duracao_min") or tarefa.duracao_min or 30)
    except Exception:
        tarefa.duracao_min = tarefa.duracao_min or 30

    try:
        prioridade = int(payload.get("prioridade") or tarefa.prioridade or 2)
        tarefa.prioridade = prioridade if prioridade in (1, 2, 3) else 2
    except Exception:
        tarefa.prioridade = tarefa.prioridade or 2

    tarefa.status = normalizar_status(payload.get("status") or tarefa.status or "pendente")
    tarefa.tipo_evento = "prioriza" if preservar_origem_prioriza else "google"
    tarefa.origem_evento = "prioriza" if preservar_origem_prioriza else "google"
    tarefa.google_event_id = (payload.get("google_event_id") or tarefa.google_event_id or "").strip() or None
    tarefa.google_html_link = (payload.get("google_html_link") or payload.get("link") or tarefa.google_html_link or "").strip() or None
    tarefa.sincronizado_google = True
    tarefa.ultima_sync_google = _parse_datetime_sync(payload.get("ultima_sync_google")) or datetime.now(UTC)
    tarefa.ativo = bool(payload.get("ativo", True))

    if not tarefa.all_day and tarefa.hora_inicio and not tarefa.hora_fim:
        tarefa.hora_fim = calcular_hora_fim(tarefa.hora_inicio, tarefa.duracao_min)
    return tarefa


def criar_ou_atualizar_tarefa_importada_google(db: Session, user_id: int, payload: dict[str, Any]) -> Tarefa:
    google_event_id = (payload.get("google_event_id") or "").strip()
    existente = _buscar_tarefa_por_google_event_id(db, user_id, google_event_id)
    if not existente:
        existente = _buscar_tarefa_aproximada_google(
            db,
            user_id,
            titulo=(payload.get("titulo") or "").strip(),
            data_ref=(payload.get("data") or "").strip(),
            hora_inicio=(payload.get("hora_inicio") or "").strip(),
            origem=(payload.get("origem") or "").strip(),
            local=(payload.get("local") or "").strip(),
        )

    if existente:
        tarefa = _aplicar_payload_google_em_tarefa(existente, payload)
    else:
        tarefa = _aplicar_payload_google_em_tarefa(
            Tarefa(
                user_id=user_id,
                titulo=(payload.get("titulo") or "").strip() or "(Sem título)",
                data=(payload.get("data") or "").strip(),
                ativo=True,
            ),
            payload,
        )
        db.add(tarefa)

    db.commit()
    db.refresh(tarefa)
    return tarefa


def normalizar_frequencia_interna(freq: str) -> str:
    if not freq:
        return "SEMANAL"

    f = _texto_sem_acentos(freq)

    if any(x in f for x in ["unico", "pontual", "esporadico"]):
        return "UNICO"
    if "diari" in f or "todo dia" in f or "todos os dias" in f:
        return "DIARIA"
    if "seman" in f:
        return "SEMANAL"
    if "bimes" in f:
        return "BIMESTRAL"
    if "trimes" in f:
        return "TRIMESTRAL"
    if "semes" in f:
        return "SEMESTRAL"
    if "anual" in f or f == "ano":
        return "ANUAL"
    if "mens" in f:
        return "MENSAL"
    return "SEMANAL"


def _intervalo_dias(freq_interna: str) -> int:
    return {
        "DIARIA": 1,
        "SEMANAL": 7,
        "MENSAL": 30,
        "BIMESTRAL": 60,
        "TRIMESTRAL": 90,
        "SEMESTRAL": 180,
        "ANUAL": 365,
        "UNICO": 999999,
    }.get((freq_interna or "SEMANAL").upper(), 7)


def _eh_domingo(data_ref: date) -> bool:
    return data_ref.weekday() == 6


def _proxima_data_diaria_visivel(data_ref: date) -> date:
    if _eh_domingo(data_ref):
        return data_ref + timedelta(days=1)
    return data_ref


def _agora_local() -> datetime:
    return datetime.now()


def _data_operacional_atual() -> date:
    agora = _agora_local()
    hoje = agora.date()
    if agora.hour < CHECKLIST_HORA_LIBERACAO:
        return hoje - timedelta(days=1)
    return hoje


def _inicio_do_dia_operacional() -> datetime:
    agora = _agora_local()
    return datetime.combine(agora.date(), time(hour=CHECKLIST_HORA_LIBERACAO))


def _dia_operacional_liberado() -> bool:
    return _agora_local() >= _inicio_do_dia_operacional()


def _data_base_proxima_execucao(item: ChecklistItem) -> Optional[date]:
    freq = frequencia_interna_efetiva(item.frequencia, item.frequencia_interna)

    if freq == "UNICO":
        return None if item.ultimo_exec else _data_operacional_atual()

    ultimo = _ultima_execucao_ajustada(item)
    if ultimo is None:
        base = _data_operacional_atual()
    else:
        base = ultimo + timedelta(days=_intervalo_dias(freq))

    if freq == "DIARIA":
        return _proxima_data_diaria_visivel(base)

    return base


def calcular_mensagem_status_checklist(item: ChecklistItem) -> str:
    if not item.ativo:
        return ""

    hoje = _data_operacional_atual()
    if _eh_domingo(hoje):
        return "Folga de domingo"

    if not _dia_operacional_liberado():
        return f"Disponível às {CHECKLIST_HORA_LIBERACAO:02d}:00"

    dias = calcular_dias_para_proxima(item)
    if item.status == "feito" and dias >= 0:
        if dias == 0:
            return "Disponível hoje"
        if dias == 1:
            return "Próxima em 1 dia"
        return f"Próxima em {dias} dia(s)"

    if dias == -1:
        return "Vencido ontem"
    if dias < -1:
        return f"Vencido há {abs(dias)} dia(s)"
    if dias == 0:
        return "Disponível hoje"
    if dias == 1:
        return "Próxima em 1 dia"
    return f"Próxima em {dias} dia(s)"


def _ultima_execucao_ajustada(item: ChecklistItem) -> Optional[date]:
    if not item.ultimo_exec:
        return None

    freq = frequencia_interna_efetiva(item.frequencia, item.frequencia_interna)
    ultimo = item.ultimo_exec

    if ultimo.tzinfo is not None:
        try:
            ultimo = ultimo.astimezone()
        except Exception:
            pass

    ultimo_date = ultimo.date()
    hoje = _data_operacional_atual()
    intervalo = _intervalo_dias(freq)

    # Corrige registros antigos/inconsistentes que ficaram com ultimo_exec no futuro
    # e acabavam escondendo itens diários por vários dias.
    if ultimo_date > hoje:
        if freq == "DIARIA":
            return hoje - timedelta(days=1)
        return hoje

    # Se o item já venceu o próximo ciclo, mantém a última execução ajustada para
    # o ciclo imediatamente anterior, evitando contagens estouradas.
    if freq != "UNICO":
        dias_passados = (hoje - ultimo_date).days
        if dias_passados > intervalo:
            return hoje - timedelta(days=intervalo)

    return ultimo_date


def sincronizar_frequencia_checklist_existente(db: Session, user_id: Optional[int] = None):
    query = db.query(ChecklistItem).filter(ChecklistItem.ativo == True)
    if user_id is not None:
        query = query.filter(ChecklistItem.user_id == user_id)
    itens = query.all()
    alterou = False

    for item in itens:
        freq_corrigida = frequencia_interna_efetiva(item.frequencia, item.frequencia_interna)
        if (item.frequencia_interna or "").strip().upper() != freq_corrigida:
            item.frequencia_interna = freq_corrigida
            alterou = True

    if alterou:
        db.commit()


def calcular_pode_mostrar_hoje(item: ChecklistItem) -> bool:
    if not item.ativo:
        return False

    hoje = _data_operacional_atual()
    if _eh_domingo(hoje):
        return False

    if not _dia_operacional_liberado():
        return False

    freq = frequencia_interna_efetiva(item.frequencia, item.frequencia_interna)

    if freq == "UNICO":
        return item.ultimo_exec is None and item.status != "feito"

    proxima_data = _data_base_proxima_execucao(item)
    if proxima_data is None:
        return False

    return hoje >= proxima_data


def calcular_proxima_execucao(item: ChecklistItem) -> Optional[str]:
    proxima_data = _data_base_proxima_execucao(item)
    if proxima_data is None:
        return None
    return proxima_data.isoformat()


def calcular_dias_para_proxima(item: ChecklistItem) -> int:
    proxima = calcular_proxima_execucao(item)
    if not proxima:
        return 0
    return (date.fromisoformat(proxima) - _data_operacional_atual()).days


def google_configurado() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI)


def salvar_google_credentials(db: Session, user: User, credentials: Credentials):
    user_id = garantir_user_id(user.id, "token Google")
    token_row = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.provider == "google",
        GoogleCalendarToken.user_id == user_id,
    ).first()
    scopes_str = ",".join(credentials.scopes or GOOGLE_SCOPES)
    expiry = credentials.expiry
    if expiry and expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=UTC)

    if not token_row:
        token_row = GoogleCalendarToken(
            user_id=user_id,
            provider="google",
            access_token=credentials.token,
            refresh_token=credentials.refresh_token,
            token_uri=credentials.token_uri or "https://oauth2.googleapis.com/token",
            client_id=credentials.client_id or GOOGLE_CLIENT_ID,
            client_secret=credentials.client_secret or GOOGLE_CLIENT_SECRET,
            scopes=scopes_str,
            expiry=expiry,
            ativo=True,
        )
        db.add(token_row)
    else:
        token_row.access_token = credentials.token
        if credentials.refresh_token:
            token_row.refresh_token = credentials.refresh_token
        token_row.token_uri = credentials.token_uri or "https://oauth2.googleapis.com/token"
        token_row.client_id = credentials.client_id or GOOGLE_CLIENT_ID
        token_row.client_secret = credentials.client_secret or GOOGLE_CLIENT_SECRET
        token_row.scopes = scopes_str
        token_row.expiry = expiry
        token_row.ativo = True
        token_row.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(token_row)
    return token_row


def get_google_credentials(db: Session, user: User) -> Credentials:
    user_id = garantir_user_id(user.id, "token Google")
    token_row = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.provider == "google",
        GoogleCalendarToken.user_id == user_id,
        GoogleCalendarToken.ativo == True,
    ).first()
    if not token_row:
        raise HTTPException(status_code=404, detail="Google Agenda ainda não foi conectado.")

    scopes = [s for s in (token_row.scopes or "").split(",") if s] or GOOGLE_SCOPES
    credentials = Credentials(
        token=token_row.access_token,
        refresh_token=token_row.refresh_token,
        token_uri=token_row.token_uri or "https://oauth2.googleapis.com/token",
        client_id=token_row.client_id,
        client_secret=token_row.client_secret,
        scopes=scopes,
    )

    if credentials.expired and credentials.refresh_token:
        credentials.refresh(GoogleAuthRequest())
        salvar_google_credentials(db, user, credentials)
        return credentials

    return credentials


def google_service(db: Session, user: User):
    credentials = get_google_credentials(db, user)
    return build("calendar", "v3", credentials=credentials)


def normalizar_evento_google(event: dict[str, Any]) -> dict[str, Any]:
    start = event.get("start") or {}
    end = event.get("end") or {}
    start_dt = start.get("dateTime")
    start_date = start.get("date")
    end_dt = end.get("dateTime")
    end_date = end.get("date")
    all_day = bool(start_date and not start_dt)

    data_iso = ""
    hora_inicio = "Dia todo" if all_day else ""
    hora_fim = ""

    if start_dt:
        inicio = datetime.fromisoformat(start_dt.replace("Z", "+00:00"))
        data_iso = inicio.date().isoformat()
        hora_inicio = inicio.astimezone().strftime("%H:%M")
    elif start_date:
        data_iso = start_date

    if end_dt:
        fim = datetime.fromisoformat(end_dt.replace("Z", "+00:00"))
        hora_fim = fim.astimezone().strftime("%H:%M")
    elif end_date and all_day:
        hora_fim = ""

    return {
        "id": event.get("id"),
        "titulo": event.get("summary") or "(Sem título)",
        "descricao": event.get("description") or "",
        "local": event.get("location") or "",
        "origem": "GOOGLE",
        "data": data_iso,
        "hora_inicio": hora_inicio,
        "hora_fim": hora_fim,
        "duracao_min": 0,
        "prioridade": 2,
        "status": event.get("status") or "confirmed",
        "tipo_evento": "google",
        "origem_evento": "google",
        "link": event.get("htmlLink"),
        "google_event_id": event.get("id"),
        "google_html_link": event.get("htmlLink"),
        "sincronizado_google": True,
        "ultima_sync_google": datetime.now(UTC).isoformat(),
        "all_day": all_day,
        "ativo": event.get("status") != "cancelled",
    }


def montar_evento_google_body(
    titulo: str,
    data_iso: str,
    hora_inicio: str,
    hora_fim: str,
    descricao: str = "",
    local: str = "",
    all_day: bool = False,
) -> dict[str, Any]:
    if all_day:
        data_inicio = date.fromisoformat(data_iso)
        data_fim = data_inicio + timedelta(days=1)
        return {
            "summary": titulo,
            "description": descricao,
            "location": local,
            "start": {"date": data_inicio.isoformat()},
            "end": {"date": data_fim.isoformat()},
        }

    inicio_dt = datetime.fromisoformat(f"{data_iso}T{hora_inicio}:00")
    fim_dt = datetime.fromisoformat(f"{data_iso}T{hora_fim}:00")
    return {
        "summary": titulo,
        "description": descricao,
        "location": local,
        "start": {
            "dateTime": inicio_dt.isoformat(),
            "timeZone": TIMEZONE_PADRAO,
        },
        "end": {
            "dateTime": fim_dt.isoformat(),
            "timeZone": TIMEZONE_PADRAO,
        },
    }


def sincronizar_tarefa_no_google(db: Session, tarefa: Tarefa, user: User):
    if not google_configurado():
        raise HTTPException(status_code=500, detail="Google não configurado no backend.")

    if not tarefa.data or not validar_data_iso(tarefa.data):
        raise HTTPException(status_code=400, detail="Tarefa sem data válida para sincronizar no Google.")

    all_day = bool(tarefa.all_day or not tarefa.hora_inicio)
    if not all_day and not validar_hora(tarefa.hora_inicio or ""):
        raise HTTPException(status_code=400, detail="Hora inicial inválida para sincronizar no Google.")

    hora_fim = tarefa.hora_fim or calcular_hora_fim(tarefa.hora_inicio, tarefa.duracao_min)
    if not all_day and not hora_fim:
        raise HTTPException(status_code=400, detail="Não foi possível calcular a hora final para sincronizar no Google.")

    service = google_service(db, user)
    body = montar_evento_google_body(
        titulo=tarefa.titulo,
        data_iso=tarefa.data,
        hora_inicio=tarefa.hora_inicio or "00:00",
        hora_fim=hora_fim or "23:59",
        descricao=tarefa.descricao or "",
        local=tarefa.local or tarefa.origem or "",
        all_day=all_day,
    )

    if tarefa.google_event_id:
        evento = service.events().update(
            calendarId="primary",
            eventId=tarefa.google_event_id,
            body=body,
        ).execute()
    else:
        evento = service.events().insert(calendarId="primary", body=body).execute()

    tarefa.google_event_id = evento.get("id")
    tarefa.google_html_link = evento.get("htmlLink")
    tarefa.sincronizado_google = True
    tarefa.origem_evento = "prioriza"
    tarefa.tipo_evento = "prioriza"
    tarefa.ultima_sync_google = datetime.now(UTC)
    db.commit()
    db.refresh(tarefa)
    return tarefa


def excluir_tarefa_no_google(db: Session, tarefa: Tarefa, user: User):
    if not tarefa.google_event_id:
        return
    try:
        service = google_service(db, user)
        service.events().delete(calendarId="primary", eventId=tarefa.google_event_id).execute()
    except Exception as e:
        print(f"[GOOGLE] Aviso ao excluir evento {tarefa.google_event_id}: {e}")


# ============================================================
# STATIC / FRONT
# ============================================================

static_dir = BASE_DIR / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/favicon.ico")
def favicon():
    for nome in ["favicon.ico", "icon-48x48.png", "ícone-48x48.png"]:
        p = BASE_DIR / nome
        if p.exists():
            return FileResponse(str(p))
    return Response(status_code=404)


@app.get("/sw.js")
def service_worker():
    p = BASE_DIR / "sw.js"
    if not p.exists():
        raise HTTPException(status_code=404, detail="sw.js não encontrado")
    return FileResponse(str(p), media_type="application/javascript")


@app.get("/site.webmanifest")
def webmanifest():
    p = BASE_DIR / "site.webmanifest"
    if not p.exists():
        raise HTTPException(status_code=404, detail="site.webmanifest não encontrado")
    return FileResponse(str(p), media_type="application/manifest+json")


@app.get("/icon-{filename}")
def icone(filename: str):
    for nome in [f"icon-{filename}", f"ícone-{filename}"]:
        p = BASE_DIR / nome
        if p.exists():
            return FileResponse(str(p))
    return Response(status_code=404)


@app.get("/health")
@app.head("/health")
def health():
    return {
        "status": "ok",
        "build": "checklist-hora-liberacao-v1",
        "checklist_hora_liberacao": CHECKLIST_HORA_LIBERACAO
    }


@app.get("/debug")
def debug_info(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    info = {
        "database_url_tipo": "postgresql" if DATABASE_URL.startswith("postgresql") else "sqlite",
        "database_url_prefixo": DATABASE_URL[:50] + "..." if len(DATABASE_URL) > 50 else DATABASE_URL,
        "base_dir": str(BASE_DIR),
        "env_vars": {
            "DATABASE_URL": "✅ definida" if os.environ.get("DATABASE_URL") else "❌ NÃO definida (usando SQLite local)",
            "VAPID_PRIVATE_KEY": "✅ definida" if os.environ.get("VAPID_PRIVATE_KEY") else "❌ não definida",
            "GOOGLE_CLIENT_ID": "✅ definida" if os.environ.get("GOOGLE_CLIENT_ID") else "❌ não definida",
            "GOOGLE_CLIENT_SECRET": "✅ definida" if os.environ.get("GOOGLE_CLIENT_SECRET") else "❌ não definida",
            "GOOGLE_REDIRECT_URI": GOOGLE_REDIRECT_URI,
        },
        "tabelas": {},
        "erro": None,
    }
    try:
        info["usuario"] = current_user.to_dict()
        info["tabelas"]["tarefas"] = db.query(Tarefa).filter(Tarefa.user_id == current_user.id).count()
        info["tabelas"]["checklist"] = db.query(ChecklistItem).filter(ChecklistItem.user_id == current_user.id).count()
        info["tabelas"]["notas"] = db.query(Note).filter(Note.user_id == current_user.id).count()
        info["tabelas"]["push_subscriptions"] = db.query(PushSubscription).filter(PushSubscription.user_id == current_user.id).count()
        info["tabelas"]["google_calendar_tokens"] = db.query(GoogleCalendarToken).filter(GoogleCalendarToken.user_id == current_user.id).count()
        info["banco_ok"] = True
    except Exception as e:
        info["banco_ok"] = False
        info["erro"] = str(e)
    return info


@app.get("/")
def root():
    return RedirectResponse(url="/app")


@app.get("/app")
def serve_app():
    return FileResponse(str(BASE_DIR / "index.html"))


# ============================================================
# AUTH
# ============================================================

def usuario_admin_dict(usuario: User) -> dict[str, Any]:
    return {
        "id": usuario.id,
        "nome": usuario.nome,
        "email": usuario.email,
        "criado_em": usuario.criado_em.isoformat() if usuario.criado_em else None,
        "ultimo_acesso": usuario.ultimo_acesso.isoformat() if usuario.ultimo_acesso else None,
        "total_acessos": int(usuario.total_acessos or 0),
        "ativo": bool(usuario.ativo),
    }

@app.post("/auth/register")
async def auth_register(request: Request, db: Session = Depends(get_db)):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido.")

    nome = (payload.get("nome") or "").strip()
    email = normalizar_email(payload.get("email") or "")
    senha = str(payload.get("senha") or "")

    if not nome:
        raise HTTPException(status_code=400, detail="Informe seu nome.")
    if not validar_email(email):
        raise HTTPException(status_code=400, detail="E-mail inválido.")
    if len(senha) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos 6 caracteres.")
    if buscar_usuario_por_email(db, email):
        raise HTTPException(status_code=400, detail="Já existe uma conta com esse e-mail.")

    usuario = User(nome=nome, email=email, senha_hash=hash_senha(senha), ativo=True)
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return {"ok": True, "token": criar_token_acesso(usuario), "user": usuario.to_dict()}


@app.post("/auth/login")
async def auth_login(request: Request, db: Session = Depends(get_db)):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido.")

    email = normalizar_email(payload.get("email") or "")
    senha = str(payload.get("senha") or "")
    usuario = buscar_usuario_por_email(db, email)

    if not usuario or not usuario.ativo or not verificar_senha(senha, usuario.senha_hash):
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos.")

    if email_admin_configurado(usuario.email) and not bool(usuario.is_admin):
        usuario.is_admin = True

    registrar_acesso_usuario(db, usuario)
    db.commit()
    db.refresh(usuario)

    return {"ok": True, "token": criar_token_acesso(usuario), "user": usuario.to_dict()}


@app.get("/auth/me")
def auth_me(current_user: User = Depends(get_current_user)):
    return {"ok": True, "user": current_user.to_dict()}


@app.post("/auth/logout")
def auth_logout():
    return {"ok": True}


@app.get("/admin/usuarios")
def admin_listar_usuarios(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    usuarios = db.query(User).order_by(User.criado_em.desc(), User.id.desc()).all()
    return {
        "ok": True,
        "usuarios": [usuario_admin_dict(usuario) for usuario in usuarios],
        "admin": {"id": current_user.id, "email": current_user.email},
    }


@app.get("/admin/resumo")
def admin_resumo(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    agora = datetime.now(UTC)
    inicio_hoje = datetime(agora.year, agora.month, agora.day, tzinfo=UTC)
    inicio_7d = agora - timedelta(days=7)

    total_usuarios = db.query(User).count()
    usuarios_ativos = db.query(User).filter(User.ativo == True).count()
    usuarios_criados_hoje = db.query(User).filter(User.criado_em >= inicio_hoje).count()
    usuarios_criados_ultimos_7_dias = db.query(User).filter(User.criado_em >= inicio_7d).count()
    acessos_ultimos_7_dias = db.query(UserAccessLog).filter(UserAccessLog.acessado_em >= inicio_7d).count()

    return {
        "ok": True,
        "resumo": {
            "total_usuarios": total_usuarios,
            "usuarios_ativos": usuarios_ativos,
            "usuarios_criados_hoje": usuarios_criados_hoje,
            "usuarios_criados_ultimos_7_dias": usuarios_criados_ultimos_7_dias,
            "acessos_ultimos_7_dias": acessos_ultimos_7_dias,
        },
        "admin": {"id": current_user.id, "email": current_user.email},
    }


# ============================================================
# GOOGLE AGENDA
# ============================================================

@app.get("/google/status")
def google_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    token_row = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.provider == "google",
        GoogleCalendarToken.user_id == current_user.id,
        GoogleCalendarToken.ativo == True,
    ).first()
    return {
        "configurado": google_configurado(),
        "conectado": token_row is not None,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "token": token_row.to_dict() if token_row else None,
    }


@app.get("/auth/google")
def auth_google(request: Request, db: Session = Depends(get_db)):
    current_user = get_current_user(request, db)
    if not google_configurado():
        raise HTTPException(
            status_code=500,
            detail="Google não configurado. Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI.",
        )

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=GOOGLE_SCOPES,
    )
    flow.redirect_uri = GOOGLE_REDIRECT_URI
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    request.session["google_oauth_state"] = state
    request.session["google_code_verifier"] = flow.code_verifier
    request.session["google_auth_user_id"] = current_user.id
    return RedirectResponse(auth_url)


@app.get("/auth/google/callback")
def auth_google_callback(request: Request, db: Session = Depends(get_db)):
    if not google_configurado():
        raise HTTPException(status_code=500, detail="Google não configurado no backend.")

    error = request.query_params.get("error")
    if error:
        raise HTTPException(status_code=400, detail=f"Falha na autorização Google: {error}")

    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Código de autorização não recebido.")

    saved_state = request.session.get("google_oauth_state")
    saved_code_verifier = request.session.get("google_code_verifier")
    saved_user_id = request.session.get("google_auth_user_id")
    returned_state = request.query_params.get("state")

    if not saved_state or not saved_code_verifier or not saved_user_id:
        raise HTTPException(status_code=400, detail="Sessão OAuth do Google não encontrada. Conecte novamente.")
    if returned_state != saved_state:
        raise HTTPException(status_code=400, detail="State OAuth inválido. Conecte novamente.")

    try:
        usuario = db.query(User).filter(User.id == int(saved_user_id), User.ativo == True).first()
        if not usuario:
            raise HTTPException(status_code=401, detail="Usuário da sessão Google não encontrado.")
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            },
            scopes=GOOGLE_SCOPES,
            state=saved_state,
        )
        flow.redirect_uri = GOOGLE_REDIRECT_URI
        flow.code_verifier = saved_code_verifier
        flow.fetch_token(code=code)
        salvar_google_credentials(db, usuario, flow.credentials)
        request.session.pop("google_oauth_state", None)
        request.session.pop("google_code_verifier", None)
        request.session.pop("google_auth_user_id", None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao concluir login Google: {str(e)}")

    return RedirectResponse(url="/app?google=conectado")


@app.get("/google/calendar/events")
def listar_eventos_google(
    date_from: str = Query(None, description="Data inicial YYYY-MM-DD"),
    date_to: str = Query(None, description="Data final YYYY-MM-DD"),
    max_results: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = google_service(db, current_user)
    tarefas_vinculadas = {
        (row[0] or "").strip()
        for row in db.query(Tarefa.google_event_id)
        .filter(Tarefa.ativo == True, Tarefa.user_id == current_user.id, Tarefa.google_event_id.isnot(None))
        .all()
        if (row[0] or "").strip()
    }

    if date_from and not validar_data_iso(date_from):
        raise HTTPException(status_code=400, detail="date_from inválida. Use YYYY-MM-DD.")
    if date_to and not validar_data_iso(date_to):
        raise HTTPException(status_code=400, detail="date_to inválida. Use YYYY-MM-DD.")

    if date_from:
        time_min = f"{date_from}T00:00:00Z"
    else:
        time_min = datetime.now(UTC).isoformat()

    time_max = f"{date_to}T23:59:59Z" if date_to else None

    eventos = service.events().list(
        calendarId="primary",
        timeMin=time_min,
        timeMax=time_max,
        maxResults=max_results,
        singleEvents=True,
        orderBy="startTime",
    ).execute()

    eventos_filtrados = []
    for event in eventos.get("items", []):
        event_id = (event.get("id") or "").strip()
        if event_id and event_id in tarefas_vinculadas:
            continue
        eventos_filtrados.append(normalizar_evento_google(event))

    return eventos_filtrados


@app.post("/google/calendar/sync")
def sincronizar_eventos_google_para_prioriza(
    date_from: str = Query(None, description="Data inicial YYYY-MM-DD"),
    date_to: str = Query(None, description="Data final YYYY-MM-DD"),
    max_results: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = google_service(db, current_user)

    if date_from and not validar_data_iso(date_from):
        raise HTTPException(status_code=400, detail="date_from inválida. Use YYYY-MM-DD.")
    if date_to and not validar_data_iso(date_to):
        raise HTTPException(status_code=400, detail="date_to inválida. Use YYYY-MM-DD.")

    if date_from:
        time_min = f"{date_from}T00:00:00Z"
    else:
        time_min = datetime.now(UTC).date().isoformat() + "T00:00:00Z"

    time_max = f"{date_to}T23:59:59Z" if date_to else None
    eventos = service.events().list(
        calendarId="primary",
        timeMin=time_min,
        timeMax=time_max,
        maxResults=max_results,
        singleEvents=True,
        orderBy="startTime",
    ).execute()

    sincronizados: list[dict[str, Any]] = []
    for event in eventos.get("items", []):
        payload = normalizar_evento_google(event)
        tarefa = criar_ou_atualizar_tarefa_importada_google(db, current_user.id, payload)
        sincronizados.append(tarefa.to_dict())

    return {
        "ok": True,
        "total": len(sincronizados),
        "tarefas": sincronizados,
    }


@app.post("/google/calendar/events")
def criar_evento_google(
    titulo: str = Query(...),
    data: str = Query(..., description="YYYY-MM-DD"),
    hora_inicio: str = Query("08:00", description="HH:MM"),
    hora_fim: str = Query("09:00", description="HH:MM"),
    descricao: str = Query(""),
    local: str = Query(""),
    all_day: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not validar_data_iso(data):
        raise HTTPException(status_code=400, detail="Data inválida. Use YYYY-MM-DD.")
    if not all_day and (not validar_hora(hora_inicio) or not validar_hora(hora_fim)):
        raise HTTPException(status_code=400, detail="Hora inválida. Use HH:MM.")
    if not all_day and hora_para_minutos(hora_fim) <= hora_para_minutos(hora_inicio):
        raise HTTPException(status_code=400, detail="Hora final deve ser maior que a inicial.")

    service = google_service(db, current_user)
    body = montar_evento_google_body(
        titulo=titulo.strip(),
        data_iso=data,
        hora_inicio=hora_inicio,
        hora_fim=hora_fim,
        descricao=(descricao or "").strip(),
        local=(local or "").strip(),
        all_day=all_day,
    )
    criado = service.events().insert(calendarId="primary", body=body).execute()
    normalizado = normalizar_evento_google(criado)
    return {
        "ok": True,
        "evento_id": criado.get("id"),
        "link": criado.get("htmlLink"),
        "titulo": normalizado["titulo"],
        "inicio": (criado.get("start") or {}).get("dateTime") or (criado.get("start") or {}).get("date"),
        "fim": (criado.get("end") or {}).get("dateTime") or (criado.get("end") or {}).get("date"),
        "evento": normalizado,
    }


@app.put("/google/calendar/events/{event_id}")
def editar_evento_google(
    event_id: str,
    titulo: str = Query(...),
    data: str = Query(...),
    hora_inicio: str = Query("08:00"),
    hora_fim: str = Query("09:00"),
    descricao: str = Query(""),
    local: str = Query(""),
    all_day: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not validar_data_iso(data):
        raise HTTPException(status_code=400, detail="Data inválida. Use YYYY-MM-DD.")
    if not all_day and (not validar_hora(hora_inicio) or not validar_hora(hora_fim)):
        raise HTTPException(status_code=400, detail="Hora inválida. Use HH:MM.")

    service = google_service(db, current_user)
    body = montar_evento_google_body(titulo, data, hora_inicio, hora_fim, descricao, local, all_day)
    evento = service.events().update(calendarId="primary", eventId=event_id, body=body).execute()
    return {"ok": True, "evento": normalizar_evento_google(evento)}


@app.delete("/google/calendar/events/{event_id}")
def excluir_evento_google(event_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = google_service(db, current_user)
    service.events().delete(calendarId="primary", eventId=event_id).execute()
    return {"ok": True}


@app.post("/google/disconnect")
def desconectar_google(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    token_row = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.provider == "google",
        GoogleCalendarToken.user_id == current_user.id,
    ).first()
    if not token_row:
        return {"ok": True, "mensagem": "Google já estava desconectado."}
    token_row.ativo = False
    token_row.updated_at = datetime.now(UTC)
    db.commit()
    return {"ok": True, "mensagem": "Google Agenda desconectado com sucesso."}


# ============================================================
# RESUMO
# ============================================================

@app.get("/resumo")
def resumo(data_ref: str = Query(None, description="Data de referência YYYY-MM-DD"), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sincronizar_frequencia_checklist_existente(db, current_user.id)
    hoje = data_ref.strip() if data_ref and validar_data_iso(data_ref) else date.today().isoformat()

    tarefas_hoje = db.query(Tarefa).filter(Tarefa.ativo == True, Tarefa.user_id == current_user.id, Tarefa.data == hoje).all()
    total_hoje = len(tarefas_hoje)
    feitas_hoje = sum(1 for t in tarefas_hoje if normalizar_status(t.status) == "feito")
    andamento_hoje = sum(1 for t in tarefas_hoje if normalizar_status(t.status) == "em_andamento")
    pendentes_hoje = total_hoje - feitas_hoje - andamento_hoje

    checklist_itens = db.query(ChecklistItem).filter(ChecklistItem.ativo == True, ChecklistItem.user_id == current_user.id).all()
    chk_disponiveis = [i for i in checklist_itens if calcular_pode_mostrar_hoje(i)]
    chk_feitos = [i for i in chk_disponiveis if i.status == "feito"]

    notas_pendentes = db.query(Note).filter(Note.ativo == True, Note.user_id == current_user.id, Note.status == "pendente").count()

    return {
        "tarefas_hoje": total_hoje,
        "feitas_hoje": feitas_hoje,
        "andamento_hoje": andamento_hoje,
        "pendentes_hoje": pendentes_hoje,
        "chk_disponiveis": len(chk_disponiveis),
        "chk_feitos": len(chk_feitos),
        "notas_pendentes": notas_pendentes,
    }


# ============================================================
# TAREFAS / EVENTOS LOCAIS
# ============================================================

@app.get("/tarefas")
def listar_tarefas(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tarefas = db.query(Tarefa).filter(Tarefa.ativo == True, Tarefa.user_id == current_user.id).order_by(Tarefa.data, Tarefa.hora_inicio, Tarefa.id).all()
    return [t.to_dict() for t in tarefas]


@app.get("/agenda/hoje")
def tarefas_hoje(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    hoje = date.today().isoformat()
    tarefas = db.query(Tarefa).filter(Tarefa.ativo == True, Tarefa.user_id == current_user.id, Tarefa.data == hoje).order_by(Tarefa.hora_inicio, Tarefa.id).all()
    return [t.to_dict() for t in tarefas]


@app.get("/agenda/inteligencia")
def agenda_inteligencia(data_ref: str = Query(None, description="Data de referência YYYY-MM-DD"), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    hoje = data_ref.strip() if data_ref and validar_data_iso(data_ref) else _agora_local().date().isoformat()
    agora_min = _agora_minutos()

    tarefas = db.query(Tarefa).filter(Tarefa.ativo == True, Tarefa.user_id == current_user.id, Tarefa.data == hoje).order_by(Tarefa.hora_inicio, Tarefa.id).all()
    tarefas_ativas = [t for t in tarefas if normalizar_status(t.status) != "cancelada"]

    total_tarefas = len(tarefas_ativas)
    pendentes = sum(1 for t in tarefas_ativas if normalizar_status(t.status) == "pendente")
    em_andamento = sum(1 for t in tarefas_ativas if normalizar_status(t.status) == "em_andamento")
    concluidas = sum(1 for t in tarefas_ativas if normalizar_status(t.status) == "feito")

    atrasadas: list[dict[str, Any]] = []
    alta_prioridade_pendente: list[dict[str, Any]] = []
    conflitos: list[dict[str, Any]] = []

    tarefas_com_horario: list[tuple[Tarefa, int, int]] = []
    for tarefa in tarefas_ativas:
        status = normalizar_status(tarefa.status)
        inicio_min, fim_min = _faixa_tarefa_minutos(tarefa)

        if status_nao_concluido(tarefa.status) and inicio_min is not None and inicio_min < agora_min:
            atrasadas.append(
                {
                    "id": tarefa.id,
                    "titulo": tarefa.titulo,
                    "hora_inicio": tarefa.hora_inicio or "",
                }
            )

        if status_nao_concluido(tarefa.status) and int(tarefa.prioridade or 2) == 1:
            alta_prioridade_pendente.append(
                {
                    "id": tarefa.id,
                    "titulo": tarefa.titulo,
                    "hora_inicio": tarefa.hora_inicio or "",
                }
            )

        if inicio_min is not None and fim_min is not None:
            tarefas_com_horario.append((tarefa, inicio_min, fim_min))

    for i, (tarefa_atual, inicio_atual, fim_atual) in enumerate(tarefas_com_horario):
        for tarefa_proxima, inicio_proximo, fim_proximo in tarefas_com_horario[i + 1:]:
            if inicio_proximo >= fim_atual:
                break
            if inicio_atual < fim_proximo and inicio_proximo < fim_atual:
                conflitos.append(
                    {
                        "inicio": minutos_para_hora(max(inicio_atual, inicio_proximo)),
                        "fim": minutos_para_hora(min(fim_atual, fim_proximo)),
                        "tarefas": [tarefa_atual.titulo, tarefa_proxima.titulo],
                    }
                )

    sugestoes: list[str] = []
    if conflitos:
        primeiro = conflitos[0]
        sugestoes.append(f"Revisar conflito entre {primeiro['inicio']} e {primeiro['fim']}")
    if atrasadas:
        sugestoes.append(f"Reagendar ou concluir \"{atrasadas[0]['titulo']}\"")
    if alta_prioridade_pendente:
        sugestoes.append(f"Priorizar \"{alta_prioridade_pendente[0]['titulo']}\"")
    if not sugestoes:
        sugestoes.append("Agenda equilibrada. Siga no foco principal do dia.")

    return {
        "status": "ok",
        "data": hoje,
        "resumo_texto": _resumo_texto_inteligencia(total_tarefas, pendentes + em_andamento, atrasadas, conflitos),
        "total_tarefas": total_tarefas,
        "pendentes": pendentes,
        "em_andamento": em_andamento,
        "concluidas": concluidas,
        "atrasadas": atrasadas,
        "alta_prioridade_pendente": alta_prioridade_pendente,
        "conflitos": conflitos,
        "sugestoes": sugestoes,
    }


@app.post("/tarefas")
async def criar_tarefa(request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = garantir_user_id(current_user.id, "tarefa")
    q = request.query_params

    titulo = q.get("titulo")
    descricao = q.get("descricao")
    origem = q.get("origem")
    local = q.get("local")
    data_str = q.get("data")
    hora_inicio = q.get("hora_inicio")
    hora_fim = q.get("hora_fim")
    duracao_min = q.get("duracao_min")
    prioridade = q.get("prioridade")
    status = q.get("status")
    sincronizar_google = q.get("sincronizar_google")
    all_day = q.get("all_day")
    tipo_evento = q.get("tipo_evento")
    origem_evento = q.get("origem_evento")
    google_event_id = q.get("google_event_id")
    google_html_link = q.get("google_html_link") or q.get("link")
    sincronizado_google = q.get("sincronizado_google")
    ultima_sync_google = q.get("ultima_sync_google")

    if not titulo:
        try:
            form = await request.form()
            titulo = form.get("titulo")
            descricao = form.get("descricao")
            origem = form.get("origem")
            local = form.get("local")
            data_str = form.get("data")
            hora_inicio = form.get("hora_inicio")
            hora_fim = form.get("hora_fim")
            duracao_min = form.get("duracao_min")
            prioridade = form.get("prioridade")
            status = form.get("status")
            sincronizar_google = form.get("sincronizar_google")
            all_day = form.get("all_day")
            tipo_evento = form.get("tipo_evento")
            origem_evento = form.get("origem_evento")
            google_event_id = form.get("google_event_id")
            google_html_link = form.get("google_html_link") or form.get("link")
            sincronizado_google = form.get("sincronizado_google")
            ultima_sync_google = form.get("ultima_sync_google")
        except Exception:
            pass

    if not titulo or not data_str:
        raise HTTPException(status_code=400, detail="É obrigatório informar pelo menos título e data.")
    if not validar_data_iso(data_str.strip()):
        raise HTTPException(status_code=400, detail="Formato de data inválido. Use YYYY-MM-DD.")

    hora_inicio = (hora_inicio or "").strip()
    hora_fim = (hora_fim or "").strip()
    eh_all_day = str(all_day).lower() in {"1", "true", "sim", "yes"}

    if not eh_all_day and hora_inicio and not validar_hora(hora_inicio):
        raise HTTPException(status_code=400, detail="Hora inicial inválida. Use HH:MM.")
    if not eh_all_day and hora_fim and not validar_hora(hora_fim):
        raise HTTPException(status_code=400, detail="Hora final inválida. Use HH:MM.")

    try:
        duracao_val = int(duracao_min) if duracao_min else 60
    except ValueError:
        duracao_val = 60

    if not hora_fim and hora_inicio and not eh_all_day:
        hora_fim = calcular_hora_fim(hora_inicio, duracao_val)
    if hora_inicio and hora_fim and hora_para_minutos(hora_fim) <= hora_para_minutos(hora_inicio):
        raise HTTPException(status_code=400, detail="Hora final deve ser maior que a inicial.")

    try:
        prioridade_val = int(prioridade) if prioridade else 2
        if prioridade_val not in (1, 2, 3):
            prioridade_val = 2
    except ValueError:
        prioridade_val = 2

    origem_evento_val = (origem_evento or "").strip().lower()
    tipo_evento_val = (tipo_evento or "").strip().lower()
    google_event_id_val = (google_event_id or "").strip()
    eh_importacao_google = bool(
        google_event_id_val
        or origem_evento_val == "google"
        or tipo_evento_val == "google"
        or _bool_from_value(sincronizado_google)
    )

    if eh_importacao_google:
        payload_google = {
            "titulo": titulo.strip(),
            "descricao": (descricao or "").strip(),
            "origem": (origem or "").strip(),
            "local": (local or "").strip(),
            "data": data_str.strip(),
            "hora_inicio": "" if eh_all_day else hora_inicio,
            "hora_fim": "" if eh_all_day else hora_fim,
            "duracao_min": duracao_val,
            "prioridade": prioridade_val,
            "status": status or "pendente",
            "tipo_evento": "google",
            "origem_evento": "google",
            "google_event_id": google_event_id_val,
            "google_html_link": (google_html_link or "").strip(),
            "sincronizado_google": True,
            "ultima_sync_google": ultima_sync_google,
            "all_day": eh_all_day,
            "ativo": True,
        }
        tarefa_google = criar_ou_atualizar_tarefa_importada_google(db, user_id, payload_google)
        return tarefa_google.to_dict()

    tarefa = Tarefa(
        user_id=user_id,
        titulo=titulo.strip(),
        descricao=(descricao or "").strip(),
        origem=(origem or "").strip(),
        local=(local or "").strip(),
        data=data_str.strip(),
        hora_inicio="" if eh_all_day else hora_inicio,
        hora_fim="" if eh_all_day else hora_fim,
        duracao_min=duracao_val,
        prioridade=prioridade_val,
        status=normalizar_status(status or "pendente"),
        tipo_evento="prioriza",
        origem_evento="prioriza",
        sincronizado_google=False,
        all_day=eh_all_day,
        ativo=True,
    )
    db.add(tarefa)
    db.commit()
    db.refresh(tarefa)

    if str(sincronizar_google).lower() in {"1", "true", "sim", "yes"}:
        try:
            tarefa = sincronizar_tarefa_no_google(db, tarefa, current_user)
        except Exception as e:
            print(f"[GOOGLE] Falha ao sincronizar tarefa recém-criada: {e}")

    return tarefa.to_dict()


@app.put("/tarefas/{tarefa_id}")
async def editar_tarefa(tarefa_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tarefa = db.query(Tarefa).filter(Tarefa.id == tarefa_id, Tarefa.user_id == current_user.id, Tarefa.ativo == True).first()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")

    q = request.query_params
    try:
        form = await request.form()
    except Exception:
        form = {}

    def pegar(campo: str):
        return q.get(campo) or (form.get(campo) if hasattr(form, "get") else None)

    titulo = pegar("titulo")
    descricao = pegar("descricao")
    origem = pegar("origem")
    local = pegar("local")
    data_str = pegar("data")
    hora_inicio = pegar("hora_inicio")
    hora_fim = pegar("hora_fim")
    duracao_min = pegar("duracao_min")
    prioridade = pegar("prioridade")
    status = pegar("status")
    sincronizar_google = pegar("sincronizar_google")
    all_day = pegar("all_day")

    if titulo is not None:
        tarefa.titulo = titulo.strip()
    if descricao is not None:
        tarefa.descricao = descricao.strip()
    if origem is not None:
        tarefa.origem = origem.strip()
    if local is not None:
        tarefa.local = local.strip()
    if data_str is not None:
        data_str = data_str.strip()
        if data_str and not validar_data_iso(data_str):
            raise HTTPException(status_code=400, detail="Formato de data inválido. Use YYYY-MM-DD.")
        if data_str:
            tarefa.data = data_str
    if hora_inicio is not None:
        hora_inicio = hora_inicio.strip()
        if hora_inicio and not validar_hora(hora_inicio):
            raise HTTPException(status_code=400, detail="Hora inicial inválida. Use HH:MM.")
        tarefa.hora_inicio = hora_inicio
    if hora_fim is not None:
        hora_fim = hora_fim.strip()
        if hora_fim and not validar_hora(hora_fim):
            raise HTTPException(status_code=400, detail="Hora final inválida. Use HH:MM.")
        tarefa.hora_fim = hora_fim
    if duracao_min is not None and str(duracao_min).strip() != "":
        try:
            tarefa.duracao_min = int(duracao_min)
        except ValueError:
            pass
    if prioridade is not None and str(prioridade).strip() != "":
        try:
            p = int(prioridade)
            tarefa.prioridade = p if p in (1, 2, 3) else 2
        except ValueError:
            pass
    if status is not None:
        tarefa.status = normalizar_status(status)
    if all_day is not None:
        tarefa.all_day = str(all_day).lower() in {"1", "true", "sim", "yes"}
        if tarefa.all_day:
            tarefa.hora_inicio = ""
            tarefa.hora_fim = ""

    if tarefa.hora_inicio and not tarefa.hora_fim and not tarefa.all_day:
        tarefa.hora_fim = calcular_hora_fim(tarefa.hora_inicio, tarefa.duracao_min)
    if tarefa.hora_inicio and tarefa.hora_fim and hora_para_minutos(tarefa.hora_fim) <= hora_para_minutos(tarefa.hora_inicio):
        raise HTTPException(status_code=400, detail="Hora final deve ser maior que a inicial.")

    db.commit()
    db.refresh(tarefa)

    precisa_sync = str(sincronizar_google).lower() in {"1", "true", "sim", "yes"} or bool(tarefa.google_event_id)
    if precisa_sync:
        try:
            tarefa = sincronizar_tarefa_no_google(db, tarefa, current_user)
        except Exception as e:
            print(f"[GOOGLE] Falha ao sincronizar edição da tarefa {tarefa.id}: {e}")

    return tarefa.to_dict()


@app.post("/tarefas_editar")
def editar_tarefa_legado(
    tarefa_id: int,
    titulo: str,
    origem: str = "",
    data: str = "",
    hora_inicio: str = "",
    duracao_min: int = 60,
    prioridade: int = 2,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tarefa = db.query(Tarefa).filter(Tarefa.id == tarefa_id, Tarefa.user_id == current_user.id, Tarefa.ativo == True).first()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    if data and not validar_data_iso(data):
        raise HTTPException(status_code=400, detail="Data inválida. Use YYYY-MM-DD.")
    if hora_inicio and not validar_hora(hora_inicio):
        raise HTTPException(status_code=400, detail="Hora inicial inválida. Use HH:MM.")

    tarefa.titulo = titulo.strip()
    tarefa.origem = origem.strip()
    if data:
        tarefa.data = data
    tarefa.hora_inicio = hora_inicio.strip()
    tarefa.duracao_min = duracao_min
    tarefa.hora_fim = calcular_hora_fim(tarefa.hora_inicio, tarefa.duracao_min)
    tarefa.prioridade = prioridade if prioridade in (1, 2, 3) else 2

    db.commit()
    db.refresh(tarefa)
    return {"ok": True, "mensagem": "Tarefa atualizada com sucesso", "tarefa": tarefa.to_dict()}


@app.post("/tarefas_excluir")
def excluir_tarefa(tarefa_id: int = Query(..., alias="tarefa_id"), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tarefa = db.query(Tarefa).filter(Tarefa.id == tarefa_id, Tarefa.user_id == current_user.id, Tarefa.ativo == True).first()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")

    if tarefa.google_event_id:
        excluir_tarefa_no_google(db, tarefa, current_user)

    tarefa.ativo = False
    tarefa.status = normalizar_status(tarefa.status)
    db.commit()
    return {"ok": True}


# ============================================================
# CHECKLIST
# ============================================================

@app.get("/checklist")
def listar_checklist(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sincronizar_frequencia_checklist_existente(db, current_user.id)
    itens = db.query(ChecklistItem).filter(ChecklistItem.user_id == current_user.id, ChecklistItem.ativo == True).order_by(ChecklistItem.criado_em, ChecklistItem.id).all()
    return [i.to_dict(incluir_pode_hoje=True) for i in itens]


@app.post("/checklist_criar")
def criar_checklist_item(
    titulo: str = Query(...),
    origem: str = Query(""),
    frequencia: str = Query("Semanal"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = garantir_user_id(current_user.id, "checklist")
    titulo = titulo.strip()
    item = ChecklistItem(
        user_id=user_id,
        titulo=titulo,
        origem=(origem or "").strip(),
        frequencia=(frequencia or "Semanal").strip(),
        frequencia_interna=normalizar_frequencia_interna(frequencia or "Semanal"),
        status="pendente",
        ativo=True,
        ultimo_exec=None,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item.to_dict(incluir_pode_hoje=True)


@app.put("/checklist/{item_id}")
def editar_checklist_item(
    item_id: int,
    titulo: str = Query(None),
    origem: str = Query(None),
    frequencia: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(ChecklistItem).filter(ChecklistItem.id == item_id, ChecklistItem.user_id == current_user.id, ChecklistItem.ativo == True).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado.")

    if titulo is not None:
        item.titulo = titulo.strip()
    if origem is not None:
        item.origem = origem.strip()
    if frequencia is not None:
        item.frequencia = frequencia.strip()
        item.frequencia_interna = normalizar_frequencia_interna(item.frequencia)

    db.commit()
    db.refresh(item)
    return item.to_dict(incluir_pode_hoje=True)


@app.post("/checklist_status")
def alterar_status_checklist(item_id: int = Query(...), status: str = Query(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sincronizar_frequencia_checklist_existente(db, current_user.id)
    item = db.query(ChecklistItem).filter(ChecklistItem.id == item_id, ChecklistItem.user_id == current_user.id, ChecklistItem.ativo == True).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado.")

    novo_status = normalizar_status(status)
    if novo_status not in ("pendente", "em_andamento", "feito"):
        novo_status = "pendente"

    item.status = novo_status
    item.frequencia_interna = frequencia_interna_efetiva(item.frequencia, item.frequencia_interna)

    if novo_status == "feito":
        item.ultimo_exec = datetime.now(UTC)
    elif novo_status == "pendente":
        if (item.frequencia_interna or "").upper() == "UNICO":
            item.ultimo_exec = None
        elif item.ultimo_exec and _ultima_execucao_ajustada(item) and _ultima_execucao_ajustada(item) < date.today():
            item.ultimo_exec = datetime.combine(_ultima_execucao_ajustada(item), datetime.min.time(), tzinfo=UTC)

    db.commit()
    db.refresh(item)
    return item.to_dict(incluir_pode_hoje=True)


@app.post("/checklist_reset")
def resetar_status_checklist(item_id: int = Query(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(ChecklistItem).filter(ChecklistItem.id == item_id, ChecklistItem.user_id == current_user.id, ChecklistItem.ativo == True).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado.")
    item.status = "pendente"
    db.commit()
    db.refresh(item)
    return item.to_dict(incluir_pode_hoje=True)


@app.post("/checklist_excluir")
def excluir_checklist_item(item_id: int = Query(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(ChecklistItem).filter(ChecklistItem.id == item_id, ChecklistItem.user_id == current_user.id, ChecklistItem.ativo == True).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado.")
    item.ativo = False
    db.commit()
    return {"ok": True}


# ============================================================
# NOTAS
# ============================================================

@app.get("/notes")
def listar_notas(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notas = db.query(Note).filter(Note.user_id == current_user.id, Note.ativo == True).order_by(Note.created_at, Note.id).all()
    return [n.to_dict() for n in notas]


@app.post("/notes")
def criar_nota(
    texto: str = Form(...),
    data: str = Form(""),
    tipo: str = Form("GERAL"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = garantir_user_id(current_user.id, "nota")
    data_str = (data or "").strip()
    if data_str and not validar_data_iso(data_str):
        raise HTTPException(status_code=400, detail="Formato de data inválido. Use YYYY-MM-DD.")

    nota = Note(
        user_id=user_id,
        texto=texto.strip(),
        data=data_str,
        tipo=(tipo or "GERAL").strip().upper(),
        status="pendente",
        ativo=True,
    )
    db.add(nota)
    db.commit()
    db.refresh(nota)
    return nota.to_dict()


@app.put("/notes/{note_id}")
def editar_nota(
    note_id: int,
    texto: str = Query(None),
    data: str = Query(None),
    tipo: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    nota = db.query(Note).filter(Note.id == note_id, Note.user_id == current_user.id, Note.ativo == True).first()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota não encontrada.")

    if texto is not None:
        nota.texto = texto.strip()
    if data is not None:
        data = data.strip()
        if data and not validar_data_iso(data):
            raise HTTPException(status_code=400, detail="Formato de data inválido. Use YYYY-MM-DD.")
        nota.data = data
    if tipo is not None:
        nota.tipo = tipo.strip().upper()

    db.commit()
    db.refresh(nota)
    return nota.to_dict()


@app.post("/notes_status")
def alterar_status_nota(note_id: int = Query(...), status: str = Query(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    nota = db.query(Note).filter(Note.id == note_id, Note.user_id == current_user.id, Note.ativo == True).first()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota não encontrada.")

    novo = (status or "").strip().lower()
    if novo not in ("pendente", "feito"):
        novo = "pendente"
    nota.status = novo
    db.commit()
    db.refresh(nota)
    return nota.to_dict()


@app.post("/notes_delete")
def excluir_nota(note_id: int = Query(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    nota = db.query(Note).filter(Note.id == note_id, Note.user_id == current_user.id, Note.ativo == True).first()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota não encontrada.")
    nota.ativo = False
    db.commit()
    return {"ok": True}


# ============================================================
# BACKUP E RESTAURAÇÃO
# ============================================================

@app.get("/backup")
def exportar_backup(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tarefas = db.query(Tarefa).filter(Tarefa.user_id == current_user.id, Tarefa.ativo == True).all()
    checklist = db.query(ChecklistItem).filter(ChecklistItem.user_id == current_user.id, ChecklistItem.ativo == True).all()
    notas = db.query(Note).filter(Note.user_id == current_user.id, Note.ativo == True).all()
    return {
        "versao": "2.0",
        "exportado_em": datetime.now(UTC).isoformat(),
        "tarefas": [t.to_dict() for t in tarefas],
        "checklist": [c.to_dict(incluir_pode_hoje=True) for c in checklist],
        "notas": [n.to_dict() for n in notas],
    }


@app.post("/restaurar")
async def importar_backup(request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = garantir_user_id(current_user.id, "restauração")
    try:
        dados = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido.")

    tarefas_raw = dados.get("tarefas", [])
    checklist_raw = dados.get("checklist", [])
    notas_raw = dados.get("notas", [])
    importadas = {"tarefas": 0, "checklist": 0, "notas": 0, "erros": []}

    for t in tarefas_raw:
        try:
            titulo = (t.get("titulo") or "").strip()
            data_str = (t.get("data") or "").strip()
            if not titulo or not data_str or not validar_data_iso(data_str):
                continue
            hora_inicio = (t.get("hora_inicio") or "").strip()
            hora_fim = (t.get("hora_fim") or "").strip()
            duracao_val = int(t.get("duracao_min") or 60)
            if hora_inicio and not hora_fim:
                hora_fim = calcular_hora_fim(hora_inicio, duracao_val)
            nova = Tarefa(
                user_id=user_id,
                titulo=titulo,
                descricao=(t.get("descricao") or "").strip(),
                origem=(t.get("origem") or "").strip(),
                local=(t.get("local") or "").strip(),
                data=data_str,
                hora_inicio=hora_inicio,
                hora_fim=hora_fim,
                duracao_min=duracao_val,
                prioridade=int(t.get("prioridade") or 2),
                status=normalizar_status(t.get("status") or "pendente"),
                tipo_evento=t.get("tipo_evento") or "prioriza",
                origem_evento=t.get("origem_evento") or "prioriza",
                google_event_id=t.get("google_event_id"),
                google_html_link=t.get("google_html_link") or t.get("link"),
                sincronizado_google=bool(t.get("sincronizado_google")),
                all_day=bool(t.get("all_day")),
                ativo=True,
            )
            db.add(nova)
            importadas["tarefas"] += 1
        except Exception as e:
            importadas["erros"].append(f"Tarefa '{t.get('titulo', '?')}': {e}")

    for c in checklist_raw:
        try:
            titulo = (c.get("titulo") or "").strip()
            if not titulo:
                continue
            novo = ChecklistItem(
                user_id=user_id,
                titulo=titulo,
                origem=(c.get("origem") or "").strip(),
                frequencia=c.get("frequencia") or "Semanal",
                frequencia_interna=c.get("frequencia_interna") or normalizar_frequencia_interna(c.get("frequencia") or "Semanal"),
                status=normalizar_status(c.get("status") or "pendente"),
                ativo=True,
            )
            db.add(novo)
            importadas["checklist"] += 1
        except Exception as e:
            importadas["erros"].append(f"Checklist '{c.get('titulo', '?')}': {e}")

    for n in notas_raw:
        try:
            texto = (n.get("texto") or "").strip()
            if not texto:
                continue
            nova_nota = Note(
                user_id=user_id,
                texto=texto,
                data=n.get("data") or "",
                tipo=n.get("tipo") or "GERAL",
                status=n.get("status") or "pendente",
                ativo=True,
            )
            db.add(nova_nota)
            importadas["notas"] += 1
        except Exception as e:
            importadas["erros"].append(f"Nota '{(n.get('texto') or '?')[:30]}': {e}")

    db.commit()
    return {
        "ok": True,
        "importadas": importadas,
        "mensagem": f"Restauração concluída: {importadas['tarefas']} tarefas, {importadas['checklist']} rotinas, {importadas['notas']} notas importadas.",
    }


# ============================================================
# PUSH NOTIFICATIONS
# ============================================================

VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY = os.environ.get(
    "VAPID_PUBLIC_KEY",
    "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBkYIRPqbb5ZfElDa1Ew",
)
VAPID_CLAIMS = {"sub": "mailto:contato@prioriza.onrender.com"}


def _enviar_push(sub: PushSubscription, titulo: str, corpo: str, url: str = "/app"):
    try:
        from pywebpush import webpush

        dados = json.dumps({
            "titulo": titulo,
            "corpo": corpo,
            "url": url,
            "icone": "/icon-180x180.png",
        })
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=dados,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS,
        )
    except Exception as e:
        print(f"[PUSH] Erro ao enviar para {sub.endpoint[:40]}...: {e}")


def _enviar_push_todos(titulo: str, corpo: str, url: str = "/app", user_id: Optional[int] = None):
    if not VAPID_PRIVATE_KEY:
        return
    db = SessionLocal()
    try:
        query = db.query(PushSubscription).filter(PushSubscription.ativo == True)
        if user_id is not None:
            query = query.filter(PushSubscription.user_id == user_id)
        subs = query.all()
        for sub in subs:
            _enviar_push(sub, titulo, corpo, url)
    finally:
        db.close()


@app.post("/push/subscribe")
async def push_subscribe(request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = garantir_user_id(current_user.id, "push")
    try:
        dados = await request.json()
        endpoint = dados.get("endpoint", "")
        keys = dados.get("keys", {})
        p256dh = keys.get("p256dh", "")
        auth = keys.get("auth", "")

        if not endpoint or not p256dh or not auth:
            raise HTTPException(status_code=400, detail="Dados de inscrição inválidos.")

        sub = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint, PushSubscription.user_id == user_id).first()
        if sub:
            sub.p256dh = p256dh
            sub.auth = auth
            sub.ativo = True
        else:
            sub_existente = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).first()
            if sub_existente and sub_existente.user_id not in (None, user_id):
                sub_existente.user_id = user_id
                sub_existente.p256dh = p256dh
                sub_existente.auth = auth
                sub_existente.ativo = True
                sub = sub_existente
            else:
                sub = PushSubscription(user_id=user_id, endpoint=endpoint, p256dh=p256dh, auth=auth, ativo=True)
                db.add(sub)

        db.commit()
        db.refresh(sub)
        return {"ok": True, "id": sub.id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar inscrição: {str(e)}")


@app.delete("/push/subscribe")
async def push_unsubscribe(request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        dados = await request.json()
        endpoint = dados.get("endpoint", "")
        sub = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint, PushSubscription.user_id == current_user.id).first()
        if sub:
            sub.ativo = False
            db.commit()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/push/status")
async def push_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        total = db.query(PushSubscription).filter(PushSubscription.user_id == current_user.id, PushSubscription.ativo == True).count()
    except Exception as e:
        return {
            "vapid_configurado": bool(VAPID_PRIVATE_KEY),
            "assinantes": -1,
            "erro_tabela": str(e),
            "solucao": "Redeploy ou migração necessária",
        }
    return {
        "vapid_configurado": bool(VAPID_PRIVATE_KEY),
        "assinantes": total,
        "public_key": VAPID_PUBLIC_KEY,
    }


@app.get("/push/teste")
async def push_teste(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not VAPID_PRIVATE_KEY:
        raise HTTPException(status_code=503, detail="VAPID_PRIVATE_KEY não configurada no servidor.")
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == current_user.id, PushSubscription.ativo == True).all()
    if not subs:
        raise HTTPException(status_code=404, detail="Nenhum dispositivo inscrito. Abra o app primeiro.")
    for sub in subs:
        _enviar_push(sub, "Teste PRIORIZA", "Push funcionando com app fechado.", "/app")
    return {"ok": True, "enviado_para": len(subs)}


@app.get("/push/limpar")
async def push_limpar(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    count = db.query(PushSubscription).filter(PushSubscription.user_id == current_user.id).count()
    db.query(PushSubscription).filter(PushSubscription.user_id == current_user.id).delete()
    db.commit()
    return {
        "ok": True,
        "removidas": count,
        "mensagem": "Todas as inscrições foram removidas. Recarregue o app para criar nova inscrição.",
    }


FERIADOS_BR = [
    (1, 1, "Ano Novo"),
    (21, 4, "Tiradentes"),
    (1, 5, "Dia do Trabalho"),
    (7, 9, "Independência"),
    (12, 10, "N.S. Aparecida"),
    (2, 11, "Finados"),
    (15, 11, "Proclamação da República"),
    (20, 11, "Consciência Negra"),
    (25, 12, "Natal"),
]


def _feriado_hoje_ou_amanha():
    hoje = date.today()
    amanha = hoje + timedelta(days=1)
    for d, m, nome in FERIADOS_BR:
        if hoje.day == d and hoje.month == m:
            return ("hoje", nome)
        if amanha.day == d and amanha.month == m:
            return ("amanha", nome)
    return None


_push_thread_started = False


def _loop_notificacoes_push():
    import time as time_module

    while True:
        try:
            agora = datetime.now()
            hora = agora.hour
            minuto = agora.minute
            dia_semana = agora.weekday()
            db = SessionLocal()
            try:
                hoje_iso = date.today().isoformat()
                amanha_iso = (date.today() + timedelta(days=1)).isoformat()
                usuarios = db.query(User).filter(User.ativo == True).all()
                minutos_agora = hora * 60 + minuto

                for usuario in usuarios:
                    tarefas_hoje = (
                        db.query(Tarefa)
                        .filter(Tarefa.ativo == True, Tarefa.user_id == usuario.id, Tarefa.data == hoje_iso)
                        .order_by(Tarefa.hora_inicio)
                        .all()
                    )
                    tarefas_amanha = db.query(Tarefa).filter(
                        Tarefa.ativo == True,
                        Tarefa.user_id == usuario.id,
                        Tarefa.data == amanha_iso,
                    ).all()
                    checklist = db.query(ChecklistItem).filter(
                        ChecklistItem.ativo == True,
                        ChecklistItem.user_id == usuario.id,
                    ).all()
                    chk_hoje = [i for i in checklist if calcular_pode_mostrar_hoje(i)]

                    for t in tarefas_hoje:
                        if not t.hora_inicio or not status_nao_concluido(t.status):
                            continue
                        try:
                            diff = hora_para_minutos(t.hora_inicio) - minutos_agora
                            origem = f" · {t.origem}" if t.origem else ""
                            if diff == 60:
                                _enviar_push_todos("Em 1 hora", f"{t.titulo}{origem} às {t.hora_inicio}", user_id=usuario.id)
                            elif diff == 15:
                                _enviar_push_todos("Em 15 minutos", f"{t.titulo}{origem} começa às {t.hora_inicio}", user_id=usuario.id)
                            elif diff == 5:
                                _enviar_push_todos("Em 5 minutos", f"{t.titulo}{origem} começa às {t.hora_inicio}", user_id=usuario.id)
                            elif diff == 0:
                                _enviar_push_todos("Agora", f"{t.titulo}{origem} está começando", user_id=usuario.id)
                        except Exception:
                            pass

                    if hora == 6 and minuto == 0:
                        total = len([t for t in tarefas_hoje if normalizar_status(t.status) != "cancelada"])
                        chk_total = len(chk_hoje)
                        alta_prio = [t for t in tarefas_hoje if t.prioridade == 1 and status_nao_concluido(t.status)]
                        if total == 0 and chk_total == 0:
                            _enviar_push_todos("Bom dia", "Agenda livre hoje. Aproveite o dia.", user_id=usuario.id)
                        elif alta_prio:
                            _enviar_push_todos(
                                "Bom dia",
                                f"{len(alta_prio)} tarefa(s) de alta prioridade hoje. Primeira: {alta_prio[0].titulo}",
                                user_id=usuario.id,
                            )
                        else:
                            _enviar_push_todos(
                                "Bom dia",
                                f"Hoje: {total} compromisso(s) e {chk_total} rotina(s) no checklist.",
                                user_id=usuario.id,
                            )

                    if hora == 9 and minuto == 0:
                        alta = [t for t in tarefas_hoje if t.prioridade == 1 and status_nao_concluido(t.status)]
                        if alta:
                            _enviar_push_todos("Tarefa prioritária", f"{len(alta)} tarefa(s) de alta prioridade hoje.", user_id=usuario.id)

                    if hora == 11 and minuto == 0:
                        pendentes = [i for i in chk_hoje if i.status == "pendente"]
                        feitos = [i for i in chk_hoje if i.status == "feito"]
                        if pendentes and not feitos:
                            _enviar_push_todos(
                                "Checklist do dia",
                                f"Você ainda não iniciou nenhuma rotina. {len(pendentes)} pendente(s).",
                                user_id=usuario.id,
                            )
                        elif pendentes:
                            _enviar_push_todos(
                                "Checklist em andamento",
                                f"{len(feitos)} feita(s), faltam {len(pendentes)}.",
                                user_id=usuario.id,
                            )

                    if hora == 20 and minuto == 0:
                        feitas = len([t for t in tarefas_hoje if normalizar_status(t.status) == "feito"])
                        total = len([t for t in tarefas_hoje if normalizar_status(t.status) != "cancelada"])
                        amanha_count = len(tarefas_amanha)
                        if total == 0:
                            _enviar_push_todos("Encerrando o dia", "Nenhum compromisso hoje. Descanse bem.", user_id=usuario.id)
                        elif feitas == total:
                            _enviar_push_todos("Parabéns", f"Todas as {total} tarefa(s) concluídas hoje.", user_id=usuario.id)
                        else:
                            extra = f" Amanhã: {amanha_count} compromisso(s)." if amanha_count else ""
                            _enviar_push_todos("Fim do dia", f"{feitas}/{total} tarefas concluídas.{extra}", user_id=usuario.id)

                    if dia_semana == 0 and hora == 8 and minuto == 0:
                        semana_total = db.query(Tarefa).filter(
                            Tarefa.ativo == True,
                            Tarefa.user_id == usuario.id,
                            Tarefa.data >= hoje_iso,
                            Tarefa.data <= (date.today() + timedelta(days=4)).isoformat(),
                        ).count()
                        _enviar_push_todos("Semana começando", f"Você tem {semana_total} compromisso(s) essa semana.", user_id=usuario.id)

                    if dia_semana == 4 and hora == 17 and minuto == 0:
                        pendentes_sexta = [t for t in tarefas_hoje if status_nao_concluido(t.status)]
                        if not pendentes_sexta:
                            _enviar_push_todos("Sexta-feira", "Você zerou todas as tarefas. Bom descanso.", user_id=usuario.id)
                        else:
                            _enviar_push_todos("Sexta-feira", f"Faltam {len(pendentes_sexta)} tarefa(s) para fechar a semana.", user_id=usuario.id)

                    if hora == 7 and minuto == 0:
                        feriado = _feriado_hoje_ou_amanha()
                        if feriado:
                            quando, nome = feriado
                            tarefas_feriado = tarefas_hoje if quando == "hoje" else tarefas_amanha
                            n = len(tarefas_feriado)
                            if quando == "hoje":
                                msg = f"Você tem {n} tarefa(s) mesmo assim." if n else "Aproveite o dia de folga."
                                _enviar_push_todos(f"Hoje é feriado — {nome}", msg, user_id=usuario.id)
                            else:
                                msg = f"Você tem {n} tarefa(s) no dia do feriado. Considere adiantar." if n else "Amanhã é folga."
                                _enviar_push_todos(f"Feriado amanhã — {nome}", msg, user_id=usuario.id)
            finally:
                db.close()
        except Exception as e:
            print(f"[PUSH LOOP] Erro: {e}")

        time_module.sleep(60)


@app.on_event("startup")
def iniciar_thread_push():
    global _push_thread_started
    if _push_thread_started:
        return
    _push_thread_started = True
    thread = threading.Thread(target=_loop_notificacoes_push, daemon=True)
    thread.start()
    print("[PUSH] Thread de notificações iniciada.")


# ============================================================
# RODAR LOCALMENTE
# ============================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 5000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
