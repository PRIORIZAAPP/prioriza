import json
import logging
import os
import requests
import threading
import unicodedata
import base64
import hashlib
import hmac
import html
import re
import secrets
import calendar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4
from pathlib import Path
from urllib.parse import urlsplit
from typing import Annotated, Any, Literal, Optional
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, ForeignKeyConstraint, Integer, Numeric, String, Text, UniqueConstraint, cast, column, create_engine, inspect, table, text
from sqlalchemy.engine import make_url
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from starlette.middleware.sessions import SessionMiddleware
from starlette.concurrency import run_in_threadpool

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
CHECKLIST_HORA_LIBERACAO = 0
FUSO_OPERACIONAL = ZoneInfo(TIMEZONE_PADRAO)
AMBIENTE_PRODUCAO = (
    os.environ.get("RENDER", "").strip().lower() == "true"
    or bool(os.environ.get("RENDER_SERVICE_ID", "").strip())
    or os.environ.get("APP_ENV", "").strip().lower() == "production"
)
SEGREDOS_DESENVOLVIMENTO = {
    "JWT_SECRET": "prioriza_jwt_dev_only_change_me",
    "SESSION_SECRET": "prioriza_google_session_secret_trocar_em_producao",
}


def ler_segredo(nome: str) -> str:
    valor = os.environ.get(nome, "").strip()
    if AMBIENTE_PRODUCAO and (not valor or valor.lower() in SEGREDOS_DESENVOLVIMENTO.values()):
        raise RuntimeError(f"[CONFIG] {nome} requer um segredo próprio de produção.")
    return valor or SEGREDOS_DESENVOLVIMENTO[nome]


def url_publica_https(valor: str) -> bool:
    try:
        url = urlsplit(valor)
        return (
            url.scheme == "https" and bool(url.hostname)
            and url.hostname not in {"localhost", "127.0.0.1", "::1"}
            and url.username is None and url.password is None
        )
    except ValueError:
        return False


JWT_SECRET = ler_segredo("JWT_SECRET")
SESSION_SECRET = ler_segredo("SESSION_SECRET")
JWT_EXP_HOURS = int(os.environ.get("JWT_EXP_HOURS", "168"))
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ADMIN_EMAIL = (os.environ.get("ADMIN_EMAIL", "").strip().lower())
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
EMAIL_FROM = os.environ.get("EMAIL_FROM", "").strip()
APP_URL = os.environ.get("APP_URL", "").strip()
PASSWORD_RESET_EXP_MINUTES = int(os.environ.get("PASSWORD_RESET_EXP_MINUTES", "30"))
AVATAR_MAX_BYTES = int(os.environ.get("AVATAR_MAX_BYTES", str(5 * 1024 * 1024)))
FEEDBACK_TO = os.environ.get("FEEDBACK_TO", "").strip()

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if AMBIENTE_PRODUCAO:
    try:
        endereco_banco = make_url(DATABASE_URL)
        valido = endereco_banco.get_backend_name() in {"postgres", "postgresql"} and endereco_banco.host and endereco_banco.database
    except Exception:
        valido = False
    if not valido:
        raise RuntimeError("[CONFIG] DATABASE_URL deve apontar para o PostgreSQL de produção.") from None

if not DATABASE_URL:
    sqlite_path = BASE_DIR / "prioriza.db"
    DATABASE_URL = f"sqlite:///{sqlite_path}"
    print(f"[DB] DATABASE_URL não definida. Usando SQLite local: {sqlite_path}")
else:
    print("[DB] Banco de dados externo configurado.")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    print("[DB] URL ajustada de postgres:// para postgresql://")

IS_SQLITE = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if IS_SQLITE else {}
try:
    engine = create_engine(DATABASE_URL, connect_args=connect_args, hide_parameters=True)
except Exception:
    raise RuntimeError("[CONFIG] Não foi possível configurar o banco. Confira DATABASE_URL e o driver.") from None
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class OcultarQueryNoLogDeAcesso(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Uvicorn provides the request target as the third positional argument.
        argumentos = record.args
        if isinstance(argumentos, tuple) and len(argumentos) == 5 and isinstance(argumentos[2], str):
            record.args = (*argumentos[:2], argumentos[2].partition("?")[0], *argumentos[3:])
        return True


logging.getLogger("uvicorn.access").addFilter(OcultarQueryNoLogDeAcesso())

app = FastAPI(title="PRIORIZA API")

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REDIRECT_URI = os.environ.get(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/auth/google/callback",
).strip()
GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar"]
usa_https_only = AMBIENTE_PRODUCAO or not (
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


@app.middleware("http")
async def adicionar_cabecalhos_seguranca(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy",
        "camera=(), geolocation=(), microphone=(self)",
    )
    if request.headers.get("x-forwarded-proto", request.url.scheme) == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response

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
    avatar_url = Column(Text, nullable=True)
    avatar_updated_at = Column(DateTime, nullable=True)
    demo_data_created = Column(Boolean, default=False, nullable=False)
    demo_data_active = Column(Boolean, default=False, nullable=False)
    demo_welcome_seen = Column(Boolean, default=False, nullable=False)
    demo_removal_prompt_seen = Column(Boolean, default=False, nullable=False)
    onboarding_completed = Column(Boolean, default=False, nullable=False)
    onboarding_scenario = Column(String(80), nullable=True)
    demo_agenda_active = Column(Boolean, default=False, nullable=False)
    demo_checklist_active = Column(Boolean, default=False, nullable=False)
    demo_notes_active = Column(Boolean, default=False, nullable=False)
    demo_notice_seen = Column(Boolean, default=False, nullable=False)

    def to_dict(self):
        avatar_url = self.avatar_url
        if avatar_url and self.avatar_updated_at:
            avatar_url = f"{avatar_url}?v={int(self.avatar_updated_at.timestamp())}"
        return {
            "id": self.id,
            "nome": self.nome,
            "email": self.email,
            "ativo": self.ativo,
            "criado_em": self.criado_em.isoformat() if self.criado_em else None,
            "ultimo_acesso": self.ultimo_acesso.isoformat() if self.ultimo_acesso else None,
            "total_acessos": int(self.total_acessos or 0),
            "is_admin": bool(self.is_admin),
            "avatar_url": avatar_url,
            "avatar_updated_at": self.avatar_updated_at.isoformat() if self.avatar_updated_at else None,
            "demo_data_created": bool(self.demo_data_created),
            "demo_data_active": bool(self.demo_data_active),
            "demo_welcome_seen": bool(self.demo_welcome_seen),
            "demo_removal_prompt_seen": bool(self.demo_removal_prompt_seen),
            "onboarding_completed": bool(self.onboarding_completed),
            "onboarding_scenario": self.onboarding_scenario,
            "demo_agenda_active": bool(self.demo_agenda_active),
            "demo_checklist_active": bool(self.demo_checklist_active),
            "demo_notes_active": bool(self.demo_notes_active),
            "demo_notice_seen": bool(self.demo_notice_seen),
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
    blocked = Column(Boolean, default=False)
    ativo = Column(Boolean, default=True)
    is_demo = Column(Boolean, default=False, nullable=False)
    recurrence_type = Column(String, default="NENHUMA", nullable=False)
    recurrence_until = Column(String, default="")
    recurrence_started_at = Column(DateTime, nullable=True, index=True)
    recurrence_ended_at = Column(DateTime, nullable=True)
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
            "blocked": bool(self.blocked),
            "ativo": self.ativo,
            "is_demo": bool(self.is_demo),
            "recurrence_type": self.recurrence_type or "NENHUMA",
            "recurrence_until": self.recurrence_until or "",
            "recurrence_started_at": self.recurrence_started_at.isoformat() if self.recurrence_started_at else None,
            "recurrence_ended_at": self.recurrence_ended_at.isoformat() if self.recurrence_ended_at else None,
            "recorrente": (self.recurrence_type or "NENHUMA").upper() != "NENHUMA",
            "criado_em": self.criado_em.isoformat() if self.criado_em else None,
        }


class ReciboAgenda(Base):
    __tablename__ = "agenda_recibos"

    user_id = Column(Integer, primary_key=True)
    chave = Column(String(128), primary_key=True)
    requisicao = Column(String(64), nullable=False)
    resposta = Column(Text, nullable=False)
    expira_em = Column(Integer, nullable=False)


class MarcoOperacional(Base):
    __tablename__ = "marcos_operacionais"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    titulo = Column(String, nullable=False)
    data = Column(String, nullable=False, index=True)  # YYYY-MM-DD
    categoria = Column(String, nullable=False, index=True)
    severidade = Column(String, nullable=False, index=True)
    descricao = Column(Text, default="")
    ativo = Column(Boolean, default=True, nullable=False)
    criado_em = Column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    atualizado_em = Column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "titulo": self.titulo or "",
            "data": self.data,
            "categoria": self.categoria or "Outro",
            "severidade": self.severidade or "Baixa",
            "descricao": self.descricao or "",
            "ativo": bool(self.ativo),
            "criado_em": self.criado_em.isoformat() if self.criado_em else None,
            "atualizado_em": self.atualizado_em.isoformat() if self.atualizado_em else None,
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
    is_demo = Column(Boolean, default=False, nullable=False)
    recurrence_ended_at = Column(DateTime, nullable=True)
    criado_em = Column(DateTime, default=lambda: datetime.now(UTC))

    def to_dict(self, incluir_pode_hoje: bool = False, data_operacional: Optional[date] = None):
        hoje = data_operacional or _data_operacional_atual()
        frequencia_corrigida = frequencia_interna_efetiva(self.frequencia, self.frequencia_interna)
        proxima = calcular_proxima_execucao(self)
        dias = calcular_dias_para_proxima(self, hoje)
        atraso = dias is not None and dias < 0
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
            "is_demo": bool(self.is_demo),
            "recurrence_ended_at": self.recurrence_ended_at.isoformat() if self.recurrence_ended_at else None,
            "recorrente": frequencia_corrigida != "UNICO",
            "ultimo_exec": self.ultimo_exec.isoformat() if self.ultimo_exec else None,
            "criado_em": self.criado_em.isoformat() if self.criado_em else None,
        }
        if incluir_pode_hoje:
            d["pode_mostrar_hoje"] = calcular_pode_mostrar_hoje(self, hoje)
            d["concluido_hoje"] = checklist_concluido_no_dia(self, hoje)
            d["proxima_execucao"] = proxima
            d["dias_para_proxima"] = dias
            d["atrasado"] = atraso
            d["mensagem_status"] = calcular_mensagem_status_checklist(self, hoje)
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
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    def to_dict(self):
        return {
            "id": self.id,
            "texto": self.texto,
            "data": self.data,
            "tipo": self.tipo,
            "status": self.status,
            "ativo": self.ativo,
            "is_demo": bool(self.is_demo),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Meta(Base):
    __tablename__ = "metas"
    __table_args__ = (
        CheckConstraint("tipo IN ('quantidade', 'percentual', 'simples')", name="ck_metas_tipo"),
        CheckConstraint("objetivo > 0 AND progresso BETWEEN 0 AND objetivo", name="ck_metas_progresso"),
        CheckConstraint(
            "(tipo = 'quantidade' OR (tipo = 'percentual' AND objetivo = 100) "
            "OR (tipo = 'simples' AND objetivo = 1 AND progresso IN (0, 1)))",
            name="ck_metas_objetivo",
        ),
        CheckConstraint(
            "(progresso = objetivo AND concluida_em IS NOT NULL) "
            "OR (progresso < objetivo AND concluida_em IS NULL)",
            name="ck_metas_conclusao",
        ),
    )

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    titulo = Column(String(160), nullable=False)
    tipo = Column(String(12), nullable=False)
    objetivo = Column(Numeric(12, 3), nullable=False)
    progresso = Column(Numeric(12, 3), nullable=False, default=0)
    unidade = Column(String(32), nullable=True)
    prazo = Column(Date, nullable=True)
    criada_em = Column(DateTime(timezone=True), nullable=False)
    concluida_em = Column(DateTime(timezone=True), nullable=True)
    versao = Column(Integer, nullable=False, default=1)

    def to_dict(self):
        def instante_iso(valor):
            return (valor if valor.tzinfo else valor.replace(tzinfo=UTC)).isoformat() if valor else None

        return {
            "id": self.id, "titulo": self.titulo, "tipo": self.tipo, "objetivo": self.objetivo,
            "progresso": self.progresso, "unidade": self.unidade, "prazo": self.prazo,
            "criada_em": instante_iso(self.criada_em), "concluida_em": instante_iso(self.concluida_em),
            "versao": self.versao,
        }


class DataEspecial(Base):
    __tablename__ = "datas_especiais"
    __table_args__ = (
        CheckConstraint("repeticao IN ('nenhuma', 'mensal', 'anual')", name="ck_datas_especiais_repeticao"),
    )

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    titulo = Column(String(160), nullable=False)
    data_original = Column(Date, nullable=False)
    repeticao = Column(String(8), nullable=False)
    criada_em = Column(Date, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "titulo": self.titulo,
            "data_original": self.data_original,
            "repeticao": self.repeticao,
            "criada_em": self.criada_em,
        }


class Habito(Base):
    __tablename__ = "habitos"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    titulo = Column(String(160), nullable=False)
    criado_em = Column(Date, nullable=False)
    arquivado_em = Column(Date, nullable=True)


class HabitoFrequencia(Base):
    __tablename__ = "habitos_frequencias"
    __table_args__ = (
        ForeignKeyConstraint(("user_id", "habito_id"), ("habitos.user_id", "habitos.id"), ondelete="CASCADE"),
        CheckConstraint("frequencia BETWEEN 1 AND 7", name="ck_habitos_frequencia"),
    )

    user_id = Column(Integer, primary_key=True)
    habito_id = Column(String(36), primary_key=True)
    semana = Column(Date, primary_key=True)
    frequencia = Column(Integer, nullable=False)


class HabitoPeriodo(Base):
    __tablename__ = "habitos_periodos"
    __table_args__ = (
        ForeignKeyConstraint(("user_id", "habito_id"), ("habitos.user_id", "habitos.id"), ondelete="CASCADE"),
        CheckConstraint("fim IS NULL OR fim >= inicio", name="ck_habitos_periodo"),
    )

    user_id = Column(Integer, primary_key=True)
    habito_id = Column(String(36), primary_key=True)
    inicio = Column(Date, primary_key=True)
    fim = Column(Date, nullable=True)


class HabitoRealizacao(Base):
    __tablename__ = "habitos_realizacoes"
    __table_args__ = (
        ForeignKeyConstraint(("user_id", "habito_id"), ("habitos.user_id", "habitos.id"), ondelete="CASCADE"),
    )

    user_id = Column(Integer, primary_key=True)
    habito_id = Column(String(36), primary_key=True)
    dia = Column(Date, primary_key=True)


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


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    token_hash = Column(Text, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC), nullable=False)


# ============================================================
# SCHEMAS
# ============================================================

class MarcoOperacionalCreate(BaseModel):
    titulo: str = Field(..., min_length=1, max_length=180)
    data: str = Field(..., min_length=10, max_length=10)
    categoria: str = Field(..., min_length=1, max_length=40)
    severidade: str = Field(..., min_length=1, max_length=20)
    descricao: str = Field(default="", max_length=5000)


class MarcoOperacionalUpdate(BaseModel):
    titulo: Optional[str] = Field(default=None, min_length=1, max_length=180)
    data: Optional[str] = Field(default=None, min_length=10, max_length=10)
    categoria: Optional[str] = Field(default=None, min_length=1, max_length=40)
    severidade: Optional[str] = Field(default=None, min_length=1, max_length=20)
    descricao: Optional[str] = Field(default=None, max_length=5000)


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


def hash_token_recuperacao(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def gerar_token_recuperacao() -> str:
    return secrets.token_urlsafe(32)


def construir_link_reset_password(token: str) -> str:
    base = (APP_URL or "").strip().rstrip("/")
    if not base:
        base = "http://localhost:8000"
    return f"{base}/reset-password?token={token}"


def enviar_email_recuperacao_senha(email_destino: str, nome: str, token: str) -> bool:
    if not RESEND_API_KEY or not EMAIL_FROM or (AMBIENTE_PRODUCAO and not url_publica_https(APP_URL)):
        print("[AUTH] Envio de recuperação indisponível. Confira RESEND_API_KEY, EMAIL_FROM e APP_URL.")
        return False

    link = construir_link_reset_password(token)
    saudacao = (nome or "").strip() or "Olá"
    html = f"""
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin:0 0 12px 0;">Redefina sua senha no PRIORIZA</h2>
      <p style="margin:0 0 12px 0;">{saudacao}, recebemos uma solicitação para redefinir sua senha.</p>
      <p style="margin:0 0 18px 0;">Use o botão abaixo para criar uma nova senha. Este link expira em {PASSWORD_RESET_EXP_MINUTES} minutos.</p>
      <p style="margin:0 0 18px 0;">
        <a href="{link}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:600;">Redefinir senha</a>
      </p>
      <p style="margin:0 0 10px 0;font-size:14px;color:#475569;">Se o botão não funcionar, copie este link:</p>
      <p style="margin:0;font-size:13px;color:#2563eb;word-break:break-all;">{link}</p>
    </div>
    """.strip()
    payload = {
        "from": EMAIL_FROM,
        "to": [email_destino],
        "subject": "Redefinição de senha do PRIORIZA",
        "html": html,
    }
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        resposta = requests.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=20)
        if resposta.ok:
            return True
        print(f"[AUTH] Falha ao enviar e-mail de recuperação via Resend: HTTP {resposta.status_code}")
        return False
    except Exception as e:
        print(f"[AUTH] Erro ao enviar e-mail de recuperação: {type(e).__name__}")
        return False


def _nome_arquivo_avatar(user_id: int, extensao: str) -> str:
    ts = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    sufixo = secrets.token_hex(4)
    return f"user_{user_id}_{ts}_{sufixo}{extensao}"


def _extensao_avatar_segura(upload: UploadFile) -> str:
    nome = (upload.filename or "").lower().strip()
    if nome.endswith(".png"):
        return ".png"
    if nome.endswith(".webp"):
        return ".webp"
    if nome.endswith(".gif"):
        return ".gif"
    if nome.endswith(".jpeg") or nome.endswith(".jpg"):
        return ".jpg"

    content_type = (upload.content_type or "").lower().strip()
    if content_type == "image/png":
        return ".png"
    if content_type == "image/webp":
        return ".webp"
    if content_type == "image/gif":
        return ".gif"
    if content_type in ("image/jpeg", "image/jpg"):
        return ".jpg"
    raise HTTPException(status_code=400, detail="Formato de imagem não suportado. Use JPG, PNG, WebP ou GIF.")


def _apagar_avatar_local(avatar_url: Optional[str]):
    caminho = (avatar_url or "").strip()
    if not caminho.startswith("/static/avatars/"):
        return
    try:
        arquivo = static_dir / "avatars" / Path(caminho).name
        if arquivo.exists():
            arquivo.unlink()
    except Exception as e:
        print(f"[AVATAR] Aviso ao remover avatar antigo: {type(e).__name__}")


def _extrair_email_simples(valor: str) -> str:
    texto = (valor or "").strip()
    if not texto:
        return ""
    encontrado = re.search(r"([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})", texto, flags=re.I)
    return normalizar_email(encontrado.group(1)) if encontrado else ""


def _destino_feedback_email() -> str:
    for candidato in (FEEDBACK_TO, ADMIN_EMAIL, EMAIL_FROM):
        email = _extrair_email_simples(candidato)
        if validar_email(email):
            return email
    return ""


def enviar_email_feedback(usuario: User, categoria: str, mensagem: str) -> bool:
    destino = _destino_feedback_email()
    if not destino or not RESEND_API_KEY or not EMAIL_FROM:
        print("[FEEDBACK] Envio por e-mail indisponível: FEEDBACK_TO/ADMIN_EMAIL/EMAIL_FROM/RESEND_API_KEY ausente.")
        return False

    categoria_limpa = (categoria or "feedback").strip().capitalize()
    remetente_nome = (usuario.nome or "").strip() or "Usuário PRIORIZA"
    remetente_email = (usuario.email or "").strip() or "Sem e-mail"
    html = f"""
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin:0 0 12px 0;">Novo {categoria_limpa} enviado pelo PRIORIZA</h2>
      <p style="margin:0 0 6px 0;"><strong>Usuário:</strong> {remetente_nome}</p>
      <p style="margin:0 0 14px 0;"><strong>E-mail:</strong> {remetente_email}</p>
      <div style="padding:14px 16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;white-space:pre-wrap;">{mensagem}</div>
    </div>
    """.strip()
    payload = {
        "from": EMAIL_FROM,
        "to": [destino],
        "subject": f"PRIORIZA · {categoria_limpa}",
        "html": html,
    }
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        resposta = requests.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=20)
        if resposta.ok:
            return True
        print(f"[FEEDBACK] Falha ao enviar via Resend: HTTP {resposta.status_code}")
        return False
    except Exception as e:
        print(f"[FEEDBACK] Erro ao enviar feedback: {type(e).__name__}")
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
    with engine.begin() as conexao:
        if not IS_SQLITE:
            conexao.execute(text("SET LOCAL lock_timeout = '5s'"))
            conexao.execute(text("SELECT pg_advisory_xact_lock(71419220)"))
        Base.metadata.create_all(bind=conexao)
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
    if nome_coluna in (
        "ativo",
        "is_admin",
        "sincronizado_google",
        "all_day",
        "blocked",
        "is_demo",
        "demo_data_created",
        "demo_data_active",
        "demo_welcome_seen",
        "demo_removal_prompt_seen",
        "onboarding_completed",
        "demo_agenda_active",
        "demo_checklist_active",
        "demo_notes_active",
        "demo_notice_seen",
    ):
        return "BOOLEAN"
    if nome_coluna in ("criado_em", "ultimo_acesso", "ultima_sync_google", "avatar_updated_at", "recurrence_started_at", "recurrence_ended_at"):
        return "TIMESTAMP" if not IS_SQLITE else "DATETIME"
    if nome_coluna in ("descricao", "local", "hora_fim", "tipo_evento", "origem_evento", "google_event_id"):
        return "VARCHAR"
    if nome_coluna in ("google_html_link", "avatar_url"):
        return "TEXT"
    return "VARCHAR"


def _sql_default_coluna(nome_coluna: str) -> str:
    if nome_coluna == "user_id":
        return ""
    if nome_coluna == "total_acessos":
        return " DEFAULT 0"
    if nome_coluna in (
        "is_admin",
        "is_demo",
        "demo_data_created",
        "demo_data_active",
        "demo_welcome_seen",
        "demo_removal_prompt_seen",
        "onboarding_completed",
        "demo_agenda_active",
        "demo_checklist_active",
        "demo_notes_active",
        "demo_notice_seen",
    ):
        return " DEFAULT false" if not IS_SQLITE else " DEFAULT 0"
    if nome_coluna in ("descricao", "local", "hora_fim"):
        return " DEFAULT ''"
    if nome_coluna in ("tipo_evento", "origem_evento"):
        return " DEFAULT 'prioriza'"
    if nome_coluna in ("ativo", "sincronizado_google", "all_day", "blocked"):
        return " DEFAULT false" if not IS_SQLITE else " DEFAULT 0"
    return ""


def garantir_coluna_tabela(nome_tabela: str, nome_coluna: str) -> bool:
    try:
        insp = inspect(engine)
        colunas_existentes = {c["name"] for c in insp.get_columns(nome_tabela)}
    except Exception as e:
        print(f"[MIGRAÇÃO] Não foi possível inspecionar {nome_tabela}: {type(e).__name__}")
        return False

    if nome_coluna in colunas_existentes:
        return False

    sql = (
        f"ALTER TABLE {nome_tabela} ADD COLUMN {nome_coluna} "
        f"{_sql_tipo_coluna(nome_coluna)}{_sql_default_coluna(nome_coluna)}"
    )
    ok, erro = executar_sql_seguro(sql)
    if ok:
        print(f"[MIGRAÇÃO] Coluna criada: {nome_tabela}.{nome_coluna}")
        return True
    else:
        print(f"[MIGRAÇÃO] Falha ao criar {nome_tabela}.{nome_coluna}: {type(erro).__name__}")
        return False


def preencher_nulos_coluna(nome_tabela: str, nome_coluna: str, valor_sql: str):
    sql = f"UPDATE {nome_tabela} SET {nome_coluna} = {valor_sql} WHERE {nome_coluna} IS NULL"
    ok, erro = executar_sql_seguro(sql)
    if ok:
        print(f"[MIGRAÇÃO] Nulos preenchidos: {nome_tabela}.{nome_coluna}")
    else:
        print(f"[MIGRAÇÃO] Falha ao preencher nulos em {nome_tabela}.{nome_coluna}: {type(erro).__name__}")


def migrar_series_agenda_existentes():
    """Reconhece somente sequências antigas com intervalo regular, sem criar IDs de série."""
    db = SessionLocal()
    try:
        candidatos = db.query(Tarefa).filter(
            Tarefa.ativo == True,
            (Tarefa.recurrence_type == None) | (Tarefa.recurrence_type == "") | (Tarefa.recurrence_type == "NENHUMA"),
        ).all()
        grupos: dict[tuple, list[Tarefa]] = {}
        for tarefa in candidatos:
            chave = (
                tarefa.user_id,
                (tarefa.titulo or "").strip().casefold(),
                (tarefa.origem or "").strip().casefold(),
                (tarefa.local or "").strip().casefold(),
                tarefa.hora_inicio or "",
            )
            grupos.setdefault(chave, []).append(tarefa)

        alteradas = 0
        for itens in grupos.values():
            datas_validas = sorted(
                [(date.fromisoformat(item.data), item) for item in itens if validar_data_iso(item.data or "")],
                key=lambda par: par[0],
            )
            if len(datas_validas) < 2:
                continue
            intervalos = [(datas_validas[i][0] - datas_validas[i - 1][0]).days for i in range(1, len(datas_validas))]
            if intervalos and all(valor == 1 for valor in intervalos):
                frequencia = "DIARIA"
            elif intervalos and all(valor == 7 for valor in intervalos):
                frequencia = "SEMANAL"
            elif intervalos and all(28 <= valor <= 31 for valor in intervalos):
                frequencia = "MENSAL"
            else:
                continue
            inicio = min((item.criado_em for _, item in datas_validas if item.criado_em), default=datetime.now(UTC))
            limite = datas_validas[-1][0].isoformat()
            for _, item in datas_validas:
                item.recurrence_type = frequencia
                item.recurrence_until = limite
                item.recurrence_started_at = inicio
                alteradas += 1
        if alteradas:
            db.commit()
            print(f"[MIGRAÇÃO] {alteradas} compromisso(s) antigo(s) vinculados a séries regulares.")
    except Exception as e:
        db.rollback()
        print(f"[MIGRAÇÃO] Aviso ao reconhecer séries antigas da Agenda: {type(e).__name__}")
    finally:
        db.close()


def rodar_migracoes_automaticas():
    init_db()

    colunas_demo_usuario = (
        "demo_data_created",
        "demo_data_active",
        "demo_welcome_seen",
        "demo_removal_prompt_seen",
        "onboarding_completed",
        "onboarding_scenario",
        "demo_agenda_active",
        "demo_checklist_active",
        "demo_notes_active",
        "demo_notice_seen",
    )
    criou_coluna_demo_usuario = False

    for coluna in ("ultimo_acesso", "total_acessos", "is_admin", "avatar_url", "avatar_updated_at"):
        garantir_coluna_tabela("users", coluna)
    for coluna in colunas_demo_usuario:
        criou = garantir_coluna_tabela("users", coluna)
        if coluna == "demo_data_created" and criou:
            criou_coluna_demo_usuario = True

    for coluna in ("user_id", "token_hash", "expires_at", "used_at", "created_at"):
        garantir_coluna_tabela("password_reset_tokens", coluna)

    preencher_nulos_coluna("users", "total_acessos", "0")
    preencher_nulos_coluna("users", "is_admin", "false" if not IS_SQLITE else "0")
    if criou_coluna_demo_usuario:
        bool_true = "true" if not IS_SQLITE else "1"
        bool_false = "false" if not IS_SQLITE else "0"
        executar_sql_seguro(
            "UPDATE users SET "
            f"demo_data_created = {bool_true}, "
            f"demo_data_active = {bool_false}, "
            f"demo_welcome_seen = {bool_true}, "
            f"demo_removal_prompt_seen = {bool_true}, "
            f"onboarding_completed = {bool_true}"
        )
        print("[MIGRAÇÃO] Usuários existentes marcados sem dados de demonstração automática.")
    for coluna in colunas_demo_usuario:
        if coluna != "onboarding_scenario":
            preencher_nulos_coluna("users", coluna, "false" if not IS_SQLITE else "0")

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
        "blocked",
        "is_demo",
        "recurrence_type",
        "recurrence_until",
        "recurrence_started_at",
        "recurrence_ended_at",
    ]
    for coluna in colunas_tarefas:
        garantir_coluna_tabela("tarefas", coluna)

    for tabela in ("checklist", "notes", "push_subscriptions", "google_calendar_tokens"):
        garantir_coluna_tabela(tabela, "user_id")
    for tabela in ("checklist", "notes"):
        garantir_coluna_tabela(tabela, "is_demo")
    garantir_coluna_tabela("checklist", "recurrence_ended_at")

    try:
        PushSubscription.__table__.create(bind=engine, checkfirst=True)
    except Exception as e:
        print(f"[MIGRAÇÃO] Aviso ao criar push_subscriptions: {type(e).__name__}")

    try:
        UserAccessLog.__table__.create(bind=engine, checkfirst=True)
    except Exception as e:
        print(f"[MIGRAÇÃO] Aviso ao criar user_access_logs: {type(e).__name__}")

        print(f"[MIGRAÇÃO] Aviso ao criar contas_fixas_status_mensal: {type(e).__name__}")

    try:
        MarcoOperacional.__table__.create(bind=engine, checkfirst=True)
    except Exception as e:
        print(f"[MIGRAÇÃO] Aviso ao criar marcos_operacionais: {type(e).__name__}")

    for tabela in ("tarefas", "checklist", "notes", "push_subscriptions", "google_calendar_tokens"):
        try:
            with engine.connect() as conn:
                total_orfaos = conn.execute(text(f"SELECT COUNT(*) FROM {tabela} WHERE user_id IS NULL")).scalar() or 0
            if total_orfaos:
                print(f"[MIGRAÇÃO] Aviso: {tabela} possui {int(total_orfaos)} registro(s) antigo(s) sem user_id. Eles não serão vinculados automaticamente.")
        except Exception as e:
            print(f"[MIGRAÇÃO] Aviso ao verificar órfãos em {tabela}: {type(e).__name__}")


try:
    rodar_migracoes_automaticas()
except Exception:
    raise RuntimeError("[DB] Falha ao inicializar o banco. Confira conectividade e permissões.") from None


# ============================================================
# HELPERS
# ============================================================

def validar_data_iso(data_str: str) -> bool:
    try:
        datetime.strptime(data_str.strip(), "%Y-%m-%d")
        return True
    except Exception:
        return False


def _bool_sql(valor: bool) -> str:
    if IS_SQLITE:
        return "1" if valor else "0"
    return "true" if valor else "false"


def _proxima_data_weekday(base: date, weekday: int) -> date:
    delta = (weekday - base.weekday()) % 7
    if delta == 0:
        delta = 7
    return base + timedelta(days=delta)


def _contar_demo_ativos(db: Session, user_id: int) -> dict[str, int]:
    return {
        "tarefas": db.query(Tarefa).filter(Tarefa.user_id == user_id, Tarefa.ativo == True, Tarefa.is_demo == True).count(),
        "checklist": db.query(ChecklistItem).filter(ChecklistItem.user_id == user_id, ChecklistItem.ativo == True, ChecklistItem.is_demo == True).count(),
        "notas": db.query(Note).filter(Note.user_id == user_id, Note.ativo == True, Note.is_demo == True).count(),
    }


def _total_demo_ativo(db: Session, user_id: int) -> int:
    return sum(_contar_demo_ativos(db, user_id).values())


DEMO_SCENARIOS_PATH = BASE_DIR / "demo_scenarios.json"
DEMO_DAY_OFFSETS = {"Seg": 0, "Ter": 1, "Qua": 2, "Qui": 3, "Sex": 4, "Sáb": 5, "Sab": 5, "Dom": 6}


def carregar_cenarios_demo() -> list[dict[str, Any]]:
    try:
        dados = json.loads(DEMO_SCENARIOS_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cenários de demonstração indisponíveis: {exc}")
    if not isinstance(dados, list) or len(dados) != 11:
        raise HTTPException(status_code=500, detail="Arquivo oficial de cenários inválido.")
    return dados


def buscar_cenario_demo(cenario_id: str) -> dict[str, Any]:
    for cenario in carregar_cenarios_demo():
        if cenario.get("id") == cenario_id:
            return cenario
    raise HTTPException(status_code=400, detail="Selecione um cenário válido.")


def _desativar_demo_modulo(db: Session, user_id: int, modulo: str):
    if modulo == "agenda":
        db.query(Tarefa).filter(Tarefa.user_id == user_id, Tarefa.is_demo == True).update({"ativo": False}, synchronize_session=False)
    elif modulo == "checklist":
        db.query(ChecklistItem).filter(ChecklistItem.user_id == user_id, ChecklistItem.is_demo == True).update({"ativo": False}, synchronize_session=False)
    elif modulo == "notes":
        db.query(Note).filter(Note.user_id == user_id, Note.is_demo == True).update({"ativo": False}, synchronize_session=False)


def converter_modulo_demo_sem_commit(db: Session, user: User, modulo: str):
    user_id = garantir_user_id(user.id, "conversão da demonstração")
    if modulo == "agenda" and bool(user.demo_agenda_active):
        _desativar_demo_modulo(db, user_id, modulo)
        user.demo_agenda_active = False
    elif modulo == "checklist" and bool(user.demo_checklist_active):
        _desativar_demo_modulo(db, user_id, modulo)
        user.demo_checklist_active = False
    elif modulo == "notes" and bool(user.demo_notes_active):
        _desativar_demo_modulo(db, user_id, modulo)
        user.demo_notes_active = False
    user.demo_data_active = bool(user.demo_agenda_active or user.demo_checklist_active or user.demo_notes_active)


def importar_cenario_demo(db: Session, user: User, cenario_id: str) -> dict[str, Any]:
    cenario = buscar_cenario_demo(cenario_id)
    user_id = garantir_user_id(user.id, "importação do cenário")
    hoje = _agora_local().date()
    segunda = hoje - timedelta(days=hoje.weekday())

    _desativar_demo_modulo(db, user_id, "agenda")
    _desativar_demo_modulo(db, user_id, "checklist")
    _desativar_demo_modulo(db, user_id, "notes")

    for compromisso in cenario["agenda"]:
        hora = compromisso["time"]
        data_ref = segunda + timedelta(days=DEMO_DAY_OFFSETS.get(compromisso["day"], 0))
        db.add(Tarefa(
            user_id=user_id,
            titulo=compromisso["title"],
            origem=compromisso["categoria"],
            data=data_ref.isoformat(),
            hora_inicio=hora,
            hora_fim=calcular_hora_fim(hora, 60),
            duracao_min=60,
            prioridade=2,
            status="pendente",
            tipo_evento="prioriza",
            origem_evento="prioriza",
            ativo=True,
            is_demo=True,
        ))

    for titulo in cenario["checklist"]:
        db.add(ChecklistItem(
            user_id=user_id,
            titulo=titulo,
            origem="PROFISSIONAL",
            frequencia="Única",
            frequencia_interna="UNICO",
            status="pendente",
            ativo=True,
            is_demo=True,
        ))
    for texto_nota in cenario["notes"]:
        db.add(Note(user_id=user_id, texto=texto_nota, tipo="GERAL", status="pendente", ativo=True, is_demo=True))

    user.onboarding_scenario = cenario_id
    user.onboarding_completed = True
    user.demo_data_created = True
    user.demo_data_active = True
    user.demo_agenda_active = True
    user.demo_checklist_active = True
    user.demo_notes_active = True
    user.demo_notice_seen = False
    user.demo_welcome_seen = True
    db.commit()
    db.refresh(user)
    return cenario


def criar_dados_demo_primeiro_acesso(db: Session, user: User) -> bool:
    if bool(user.demo_data_created):
        return False

    user_id = garantir_user_id(user.id, "dados de demonstração")
    hoje = _agora_local().date()
    hoje_iso = hoje.isoformat()
    amanha_iso = (hoje + timedelta(days=1)).isoformat()
    quinta_iso = _proxima_data_weekday(hoje, 3).isoformat()
    sexta_iso = _proxima_data_weekday(hoje, 4).isoformat()

    tarefas_demo = [
        ("Conferir e-mails importantes", hoje_iso, "08:30", 30, 2),
        ("Reunião de alinhamento", hoje_iso, "10:00", 60, 2),
        ("Revisar indicadores da semana", hoje_iso, "14:00", 60, 2),
        ("Organizar pendências do dia", hoje_iso, "16:30", 30, 3),
        ("Revisão de resultados", amanha_iso, "09:30", 60, 2),
        ("Apresentação mensal", quinta_iso, "15:00", 60, 1),
        ("Planejamento da semana seguinte", sexta_iso, "11:00", 45, 2),
    ]
    for titulo, data_ref, hora, duracao, prioridade in tarefas_demo:
        db.add(Tarefa(
            user_id=user_id,
            titulo=titulo,
            descricao="Registro de demonstração para apresentar o funcionamento do Prioriza.",
            origem="Profissional",
            local="Demonstração",
            data=data_ref,
            hora_inicio=hora,
            hora_fim=calcular_hora_fim(hora, duracao),
            duracao_min=duracao,
            prioridade=prioridade,
            status="pendente",
            tipo_evento="prioriza",
            origem_evento="prioriza",
            ativo=True,
            is_demo=True,
        ))

    checklist_demo = [
        ("Planejar as prioridades do dia", "Diária", "feito"),
        ("Conferir a agenda da semana", "Semanal", "feito"),
        ("Responder mensagens pendentes", "Diária", "pendente"),
        ("Atualizar relatório mensal", "Mensal", "pendente"),
        ("Organizar as atividades de amanhã", "Diária", "pendente"),
    ]
    for titulo, frequencia, status in checklist_demo:
        db.add(ChecklistItem(
            user_id=user_id,
            titulo=titulo,
            origem="Profissional",
            frequencia=frequencia,
            frequencia_interna=normalizar_frequencia_interna(frequencia),
            status=status,
            ativo=True,
            ultimo_exec=datetime.now(UTC) if status == "feito" else None,
            is_demo=True,
        ))

    notas_demo = [
        ("Pendências da semana\n\nConfirmar a reunião de sexta-feira e revisar os documentos necessários.", "TRABALHO"),
        ("Ideias\n\nCriar um modelo padrão para reuniões e acompanhamento de atividades.", "GERAL"),
        ("Lembrete\n\nSolicitar o orçamento antes do fechamento do mês.", "GERAL"),
    ]
    for texto_nota, tipo in notas_demo:
        db.add(Note(user_id=user_id, texto=texto_nota, tipo=tipo, status="pendente", ativo=True, is_demo=True))

    user.demo_data_created = True
    user.demo_data_active = True
    user.demo_welcome_seen = False
    user.demo_removal_prompt_seen = False
    user.onboarding_completed = False
    db.commit()
    db.refresh(user)
    return True


def remover_dados_demo_usuario(db: Session, user: User) -> dict[str, Any]:
    user_id = garantir_user_id(user.id, "remoção de demonstração")
    contagem = _contar_demo_ativos(db, user_id)

    db.query(Tarefa).filter(Tarefa.user_id == user_id, Tarefa.is_demo == True).update({"ativo": False}, synchronize_session=False)
    db.query(ChecklistItem).filter(ChecklistItem.user_id == user_id, ChecklistItem.is_demo == True).update({"ativo": False}, synchronize_session=False)
    db.query(Note).filter(Note.user_id == user_id, Note.is_demo == True).update({"ativo": False}, synchronize_session=False)

    user.demo_data_active = False
    user.demo_agenda_active = False
    user.demo_checklist_active = False
    user.demo_notes_active = False
    user.demo_removal_prompt_seen = True
    user.demo_welcome_seen = True
    user.onboarding_completed = True
    db.commit()
    db.refresh(user)
    return {"removidos": contagem, "total": sum(contagem.values())}


def excluir_dados_legados_da_conta(db: Session, user_id: int) -> dict[str, int]:
    # Bancos novos não têm estas tabelas. Bancos antigos só são limpos
    # quando o próprio usuário confirma a exclusão da sua conta.
    tabelas_existentes = set(inspect(db.connection()).get_table_names())
    removidos = {}
    for nome in (
        "contas_fixas_status_mensal",
        "lancamentos_financeiros",
        "contas_fixas_financeiras",
        "fontes_renda_financeiras",
        "operacao_movimentos",
        "operacao_plantoes",
        "operacao_competencias",
        "operacao_unidades",
    ):
        if nome in tabelas_existentes:
            tabela = table(nome, column("user_id"))
            resultado = db.execute(tabela.delete().where(tabela.c.user_id == user_id))
            removidos[nome] = resultado.rowcount
    return removidos


def excluir_conta_usuario(db: Session, user: User) -> dict[str, int]:
    user_id = garantir_user_id(user.id, "exclusão de conta")
    avatar_anterior = user.avatar_url
    try:
        excluir_historico_habitos(db, user_id)
        removidos = {
            "datas_especiais": db.query(DataEspecial).filter_by(user_id=user_id).delete(synchronize_session=False),
            "habitos": db.query(Habito).filter_by(user_id=user_id).delete(synchronize_session=False),
            "marcos_operacionais": db.query(MarcoOperacional).filter(MarcoOperacional.user_id == user_id).delete(synchronize_session=False),
            "agenda_recibos": db.query(ReciboAgenda).filter(ReciboAgenda.user_id == user_id).delete(synchronize_session=False),
            "tarefas": db.query(Tarefa).filter(Tarefa.user_id == user_id).delete(synchronize_session=False),
            "checklist": db.query(ChecklistItem).filter(ChecklistItem.user_id == user_id).delete(synchronize_session=False),
            "metas": db.query(Meta).filter(Meta.user_id == user_id).delete(synchronize_session=False),
            "notes": db.query(Note).filter(Note.user_id == user_id).delete(synchronize_session=False),
            "push_subscriptions": db.query(PushSubscription).filter(PushSubscription.user_id == user_id).delete(synchronize_session=False),
            "google_calendar_tokens": db.query(GoogleCalendarToken).filter(GoogleCalendarToken.user_id == user_id).delete(synchronize_session=False),
            "password_reset_tokens": db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user_id).delete(synchronize_session=False),
            "user_access_logs": db.query(UserAccessLog).filter(UserAccessLog.user_id == user_id).delete(synchronize_session=False),
        }
        removidos.update(excluir_dados_legados_da_conta(db, user_id))
        db.delete(user)
        db.commit()
    except Exception:
        db.rollback()
        raise
    _apagar_avatar_local(avatar_anterior)
    return {chave: int(valor or 0) for chave, valor in removidos.items()}


def status_demo_usuario(db: Session, user: User) -> dict[str, Any]:
    user_id = garantir_user_id(user.id, "status de demonstração")
    contagem = _contar_demo_ativos(db, user_id)
    agenda_ativa = bool(user.demo_agenda_active) and contagem["tarefas"] > 0
    checklist_ativo = bool(user.demo_checklist_active) and contagem["checklist"] > 0
    notas_ativas = bool(user.demo_notes_active) and contagem["notas"] > 0
    legado_ativo = bool(user.demo_data_active) and not bool(user.onboarding_scenario) and sum(contagem.values()) > 0
    ativo = agenda_ativa or checklist_ativo or notas_ativas or legado_ativo
    if bool(user.demo_data_active) != ativo:
        user.demo_data_active = ativo
        db.commit()
        db.refresh(user)
    return {
        "demo_data_created": bool(user.demo_data_created),
        "demo_data_active": ativo,
        "demo_welcome_seen": bool(user.demo_welcome_seen),
        "demo_removal_prompt_seen": bool(user.demo_removal_prompt_seen),
        "onboarding_completed": bool(user.onboarding_completed),
        "onboarding_scenario": user.onboarding_scenario,
        "needs_onboarding": (not bool(user.onboarding_completed)) or legado_ativo,
        "demo_notice_seen": bool(user.demo_notice_seen),
        "modules": {
            "agenda": agenda_ativa,
            "checklist": checklist_ativo,
            "notes": notas_ativas,
        },
        "contagem": contagem,
        "total": sum(contagem.values()),
    }


MARCOS_CATEGORIAS = {
    "ti": "TI",
    "operacao": "Operação",
    "equipamento": "Equipamento",
    "gestao": "Gestão",
    "contrato": "Contrato",
    "auditoria": "Auditoria",
    "qualidade": "Qualidade",
    "incidente": "Incidente",
    "outro": "Outro",
}
MARCOS_SEVERIDADES = {
    "baixa": "Baixa",
    "media": "Média",
    "alta": "Alta",
    "critica": "Crítica",
}


def _chave_texto_marco(valor: str) -> str:
    return unicodedata.normalize("NFKD", (valor or "").strip()).encode("ascii", "ignore").decode("ascii").lower()


def normalizar_categoria_marco(valor: str) -> str:
    categoria = MARCOS_CATEGORIAS.get(_chave_texto_marco(valor))
    if not categoria:
        raise HTTPException(status_code=400, detail="Categoria de Marco Operacional inválida.")
    return categoria


def normalizar_severidade_marco(valor: str) -> str:
    severidade = MARCOS_SEVERIDADES.get(_chave_texto_marco(valor))
    if not severidade:
        raise HTTPException(status_code=400, detail="Severidade de Marco Operacional inválida.")
    return severidade


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
    if bool(getattr(tarefa, "blocked", False)) and bool(getattr(tarefa, "all_day", False)):
        return 0, 24 * 60
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
    blocked = _bool_from_value(payload.get("blocked"))
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
    tarefa.blocked = blocked
    tarefa.hora_inicio = "" if all_day else hora_inicio
    tarefa.hora_fim = "" if all_day else hora_fim

    try:
        tarefa.duracao_min = int(payload.get("duracao_min") or tarefa.duracao_min or 30)
    except Exception:
        tarefa.duracao_min = tarefa.duracao_min or 30
    if tarefa.all_day:
        tarefa.duracao_min = 24 * 60

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


def criar_ou_atualizar_tarefa_importada_google(db: Session, user_id: int, payload: dict[str, Any], *, commit=True) -> Tarefa:
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

    if commit:
        db.commit()
        db.refresh(tarefa)
    return tarefa


def normalizar_frequencia_interna(freq: str) -> str:
    if not freq:
        return "SEMANAL"

    f = _texto_sem_acentos(freq)

    if any(x in f for x in ["unico", "unica", "pontual", "esporadico"]):
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


def _proxima_data_recorrencia(data_atual: date, frequencia: str) -> date:
    freq = (frequencia or "SEMANAL").upper()
    meses = {"MENSAL": 1, "BIMESTRAL": 2, "TRIMESTRAL": 3, "SEMESTRAL": 6, "ANUAL": 12}.get(freq)
    if not meses:
        return data_atual + timedelta(days=_intervalo_dias(freq))
    indice_mes = (data_atual.year * 12 + data_atual.month - 1) + meses
    ano, mes_zero = divmod(indice_mes, 12)
    mes = mes_zero + 1
    dia = min(data_atual.day, calendar.monthrange(ano, mes)[1])
    return date(ano, mes, dia)


def _eh_domingo(data_ref: date) -> bool:
    return data_ref.weekday() == 6


def _proxima_data_diaria_visivel(data_ref: date) -> date:
    if _eh_domingo(data_ref):
        return data_ref + timedelta(days=1)
    return data_ref


def _agora_local() -> datetime:
    return datetime.now(FUSO_OPERACIONAL).replace(tzinfo=None)


def _data_operacional_atual() -> date:
    return _agora_local().date()


def checklist_concluido_no_dia(item: ChecklistItem, hoje: date) -> bool:
    if item.status != "feito" or not item.ultimo_exec:
        return False
    # A coluna sem fuso contém o instante UTC gravado na conclusão.
    execucao = item.ultimo_exec
    if execucao.tzinfo is None:
        execucao = execucao.replace(tzinfo=UTC)
    return execucao.astimezone(FUSO_OPERACIONAL).date() == hoje


def _data_base_proxima_execucao(item: ChecklistItem) -> Optional[date]:
    freq = frequencia_interna_efetiva(item.frequencia, item.frequencia_interna)

    if freq == "UNICO" and (item.ultimo_exec or item.status == "feito"):
        return None

    # O reagendamento legado gravava a data escolhida menos o intervalo.
    # Use o mesmo intervalo para recuperar a data sem alterar ultimo_exec.
    if item.ultimo_exec:
        base = item.ultimo_exec.date() + timedelta(days=_intervalo_dias(freq))
    elif item.criado_em and item.status != "feito":
        base = item.criado_em.date()
    else:
        return None

    return _proxima_data_diaria_visivel(base) if freq == "DIARIA" else base


def calcular_mensagem_status_checklist(item: ChecklistItem, hoje: Optional[date] = None) -> str:
    if not item.ativo:
        return ""

    hoje = hoje or _data_operacional_atual()
    if _eh_domingo(hoje):
        return "Folga de domingo"

    dias = calcular_dias_para_proxima(item, hoje)
    if dias is None:
        return ""
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


def calcular_pode_mostrar_hoje(item: ChecklistItem, hoje: Optional[date] = None) -> bool:
    if not item.ativo or item.recurrence_ended_at:
        return False

    hoje = hoje or _data_operacional_atual()
    if _eh_domingo(hoje):
        return False

    freq = frequencia_interna_efetiva(item.frequencia, item.frequencia_interna)

    if freq == "UNICO":
        return item.ultimo_exec is None and item.status != "feito"

    proxima_data = _data_base_proxima_execucao(item)
    if proxima_data is None:
        return item.status != "feito"

    return hoje >= proxima_data


def calcular_proxima_execucao(item: ChecklistItem) -> Optional[str]:
    if item.recurrence_ended_at:
        return None
    proxima_data = _data_base_proxima_execucao(item)
    if proxima_data is None:
        return None
    return proxima_data.isoformat()


def calcular_dias_para_proxima(item: ChecklistItem, hoje: Optional[date] = None) -> Optional[int]:
    proxima = calcular_proxima_execucao(item)
    if not proxima:
        return None
    return (date.fromisoformat(proxima) - (hoje or _data_operacional_atual())).days


def google_configurado() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI
                and (not AMBIENTE_PRODUCAO or url_publica_https(GOOGLE_REDIRECT_URI)))


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
    expiry = GoogleCalendarToken.expiry
    if not IS_SQLITE:
        # PostgreSQL stored this legacy column in the database session's time zone.
        expiry = cast(expiry, DateTime(timezone=True))
    registro = db.query(GoogleCalendarToken, expiry).filter(
        GoogleCalendarToken.provider == "google",
        GoogleCalendarToken.user_id == user_id,
        GoogleCalendarToken.ativo == True,
    ).first()
    if not registro:
        raise HTTPException(status_code=404, detail="Google Agenda ainda não foi conectado.")
    token_row, expira_em = registro

    scopes = [s for s in (token_row.scopes or "").split(",") if s] or GOOGLE_SCOPES
    credentials = Credentials(
        token=token_row.access_token,
        refresh_token=token_row.refresh_token,
        token_uri=token_row.token_uri or "https://oauth2.googleapis.com/token",
        client_id=token_row.client_id,
        client_secret=token_row.client_secret,
        scopes=scopes,
    )

    if expira_em:
        # google-auth compares expiration against naive UTC.
        credentials.expiry = _parse_datetime_sync(expira_em).astimezone(UTC).replace(tzinfo=None)

    if credentials.expired and credentials.refresh_token:
        credentials.refresh(GoogleAuthRequest())
        salvar_google_credentials(db, user, credentials)
        return credentials

    return credentials


def google_service(db: Session, user: User):
    credentials = get_google_credentials(db, user)
    return build("calendar", "v3", credentials=credentials)


def _obter_timezone_google(timezone_nome: Optional[str] = None):
    nome = (timezone_nome or TIMEZONE_PADRAO or "UTC").strip()
    try:
        return ZoneInfo(nome)
    except Exception:
        try:
            return ZoneInfo(TIMEZONE_PADRAO)
        except Exception:
            return UTC


def _converter_datetime_google(valor: Optional[str], timezone_nome: Optional[str] = None) -> Optional[datetime]:
    if not valor:
        return None
    try:
        parsed = datetime.fromisoformat(str(valor).strip().replace("Z", "+00:00"))
    except Exception:
        return None
    tz_alvo = _obter_timezone_google(timezone_nome)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=tz_alvo)
    return parsed.astimezone(tz_alvo)


def _descricao_google_para_texto(valor: Any) -> str:
    texto = str(valor or "").strip()
    if not texto:
        return ""

    texto = re.sub(r"(?i)<br\s*/?>", "\n", texto)
    texto = re.sub(r"(?i)</p\s*>", "\n\n", texto)
    texto = re.sub(r"(?i)</div\s*>", "\n", texto)
    texto = re.sub(r"(?i)<li\s*>", "• ", texto)
    texto = re.sub(r"(?i)</li\s*>", "\n", texto)
    texto = re.sub(r"(?i)</ul\s*>|</ol\s*>", "\n", texto)
    texto = re.sub(r"<[^>]+>", "", texto)
    texto = html.unescape(texto)
    texto = texto.replace("\r\n", "\n").replace("\r", "\n")
    texto = re.sub(r"\n{3,}", "\n\n", texto)
    texto = re.sub(r"[ \t]+\n", "\n", texto)
    texto = re.sub(r"\n[ \t]+", "\n", texto)
    return texto.strip()


def normalizar_evento_google(event: dict[str, Any]) -> dict[str, Any]:
    start = event.get("start") or {}
    end = event.get("end") or {}
    start_dt = start.get("dateTime")
    start_date = start.get("date")
    end_dt = end.get("dateTime")
    end_date = end.get("date")
    start_tz = start.get("timeZone") or end.get("timeZone") or event.get("timeZone") or TIMEZONE_PADRAO
    all_day = bool(start_date and not start_dt)

    data_iso = ""
    hora_inicio = "Dia todo" if all_day else ""
    hora_fim = ""
    inicio_iso = start_dt or start_date or ""
    fim_iso = end_dt or end_date or ""

    if start_dt:
        inicio = _converter_datetime_google(start_dt, start_tz)
        if inicio:
            data_iso = inicio.date().isoformat()
            hora_inicio = inicio.strftime("%H:%M")
    elif start_date:
        data_iso = start_date

    if end_dt:
        fim = _converter_datetime_google(end_dt, start_tz)
        if fim:
            hora_fim = fim.strftime("%H:%M")
    elif end_date and all_day:
        hora_fim = ""

    return {
        "id": event.get("id"),
        "titulo": event.get("summary") or "(Sem título)",
        "descricao": _descricao_google_para_texto(event.get("description") or ""),
        "local": event.get("location") or "",
        "origem": "GOOGLE",
        "data": data_iso,
        "hora_inicio": hora_inicio,
        "hora_fim": hora_fim,
        "inicio": inicio_iso,
        "fim": fim_iso,
        "timezone": start_tz,
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
        "blocked": False,
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
    blocked: bool = False,
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
            "transparency": "opaque" if blocked else "transparent",
        }

    inicio_dt = datetime.fromisoformat(f"{data_iso}T{hora_inicio}:00")
    fim_dt = datetime.fromisoformat(f"{data_iso}T{hora_fim}:00")
    if fim_dt <= inicio_dt:
        fim_dt += timedelta(days=1)
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
        "transparency": "opaque" if blocked else "opaque",
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
        blocked=bool(getattr(tarefa, "blocked", False)),
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
        print(f"[GOOGLE] Aviso ao excluir evento: {type(e).__name__}")


# ============================================================
# STATIC / FRONT
# ============================================================

static_dir = BASE_DIR / "static"
static_dir.mkdir(exist_ok=True)
avatar_dir = static_dir / "avatars"
avatar_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

css_dir = BASE_DIR / "css"
js_dir = BASE_DIR / "js"

if css_dir.exists():
    app.mount("/css", StaticFiles(directory=str(css_dir)), name="css")

if js_dir.exists():
    app.mount("/js", StaticFiles(directory=str(js_dir)), name="js")


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
        "build": "sprint-050",
        "checklist_hora_liberacao": CHECKLIST_HORA_LIBERACAO
    }


@app.get("/debug")
def debug_info(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
    info = {
        "database_url_tipo": "postgresql" if DATABASE_URL.startswith("postgresql") else "sqlite",
        "env_vars": {
            "DATABASE_URL": "✅ definida" if os.environ.get("DATABASE_URL") else "❌ NÃO definida (usando SQLite local)",
            "VAPID_PRIVATE_KEY": "✅ definida" if os.environ.get("VAPID_PRIVATE_KEY") else "❌ não definida",
            "GOOGLE_CLIENT_ID": "✅ definida" if os.environ.get("GOOGLE_CLIENT_ID") else "❌ não definida",
            "GOOGLE_CLIENT_SECRET": "✅ definida" if os.environ.get("GOOGLE_CLIENT_SECRET") else "❌ não definida",
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
    except Exception:
        info["banco_ok"] = False
        info["erro"] = "Falha ao consultar os indicadores de diagnóstico."
    return info


@app.get("/")
def root():
    return RedirectResponse(url="/app")


@app.get("/app")
def serve_app():
    return FileResponse(str(BASE_DIR / "index.html"))


@app.get("/reset-password")
def serve_reset_password():
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
    db.flush()
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


@app.post("/auth/forgot-password")
async def auth_forgot_password(request: Request, db: Session = Depends(get_db)):
    mensagem = "Se este e-mail estiver cadastrado, enviaremos as instruções de recuperação."
    try:
        payload = await request.json()
    except Exception:
        return {"ok": True, "message": mensagem}

    email = normalizar_email(payload.get("email") or "")
    if not validar_email(email):
        return {"ok": True, "message": mensagem}

    usuario = buscar_usuario_por_email(db, email)
    if not usuario or not usuario.ativo:
        return {"ok": True, "message": mensagem}

    agora = datetime.now(UTC)
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == usuario.id,
        PasswordResetToken.used_at.is_(None),
    ).update({"used_at": agora}, synchronize_session=False)

    token = gerar_token_recuperacao()
    reset = PasswordResetToken(
        user_id=usuario.id,
        token_hash=hash_token_recuperacao(token),
        expires_at=agora + timedelta(minutes=PASSWORD_RESET_EXP_MINUTES),
    )
    db.add(reset)
    db.commit()

    enviado = enviar_email_recuperacao_senha(usuario.email, usuario.nome, token)
    if not enviado:
        print("[AUTH] Link de recuperação não enviado.")

    return {"ok": True, "message": mensagem}


@app.post("/auth/reset-password")
async def auth_reset_password(request: Request, db: Session = Depends(get_db)):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido.")

    token = (payload.get("token") or "").strip()
    senha = str(payload.get("senha") or "")
    confirmar = str(payload.get("confirmar_senha") or payload.get("confirmar") or "")

    if not token:
        raise HTTPException(status_code=400, detail="Token de recuperação inválido.")
    if len(senha) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos 6 caracteres.")
    if confirmar and senha != confirmar:
        raise HTTPException(status_code=400, detail="As senhas não coincidem.")

    agora = datetime.now(UTC)
    token_hash = hash_token_recuperacao(token)
    # Compare using the same database time zone as the stored legacy timestamp.
    agora_no_banco = agora.replace(tzinfo=None) if IS_SQLITE else cast(agora, DateTime())
    registro = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == token_hash,
        PasswordResetToken.expires_at > agora_no_banco,
        PasswordResetToken.used_at.is_(None),
    ).order_by(PasswordResetToken.id.desc()).first()

    if not registro:
        raise HTTPException(status_code=400, detail="Este link de recuperação é inválido ou expirou.")

    usuario = db.query(User).filter(User.id == registro.user_id, User.ativo == True).first()
    if not usuario:
        raise HTTPException(status_code=400, detail="Este link de recuperação é inválido ou expirou.")

    usuario.senha_hash = hash_senha(senha)
    registro.used_at = agora
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == usuario.id,
        PasswordResetToken.used_at.is_(None),
        PasswordResetToken.id != registro.id,
    ).update({"used_at": agora}, synchronize_session=False)
    db.commit()

    return {"ok": True, "message": "Senha atualizada com sucesso. Você já pode entrar com a nova senha."}


@app.get("/auth/me")
def auth_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"ok": True, "user": current_user.to_dict()}


@app.get("/demo/status")
def demo_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"ok": True, "demo": status_demo_usuario(db, current_user), "user": current_user.to_dict()}


@app.get("/demo/scenarios")
def demo_scenarios(current_user: User = Depends(get_current_user)):
    return [{"id": item["id"], "name": item["name"]} for item in carregar_cenarios_demo()]


@app.post("/demo/import")
async def demo_import(request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    cenario_id = str(payload.get("scenario_id") or "").strip()
    if bool(current_user.onboarding_completed) and current_user.onboarding_scenario:
        raise HTTPException(status_code=409, detail="A experiência inicial já foi preparada.")
    cenario = importar_cenario_demo(db, current_user, cenario_id)
    return {
        "ok": True,
        "scenario": {"id": cenario["id"], "name": cenario["name"]},
        "demo": status_demo_usuario(db, current_user),
        "user": current_user.to_dict(),
    }


@app.post("/demo/notice-seen")
def demo_notice_seen(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.demo_notice_seen = True
    db.commit()
    db.refresh(current_user)
    return {"ok": True, "demo": status_demo_usuario(db, current_user), "user": current_user.to_dict()}


@app.post("/demo/welcome-seen")
def demo_welcome_seen(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.demo_welcome_seen = True
    db.commit()
    db.refresh(current_user)
    return {"ok": True, "demo": status_demo_usuario(db, current_user), "user": current_user.to_dict()}


@app.post("/demo/removal-prompt-seen")
def demo_removal_prompt_seen(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.demo_removal_prompt_seen = True
    db.commit()
    db.refresh(current_user)
    return {"ok": True, "demo": status_demo_usuario(db, current_user), "user": current_user.to_dict()}


@app.post("/demo/remove")
def demo_remove(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    resultado = remover_dados_demo_usuario(db, current_user)
    return {"ok": True, **resultado, "demo": status_demo_usuario(db, current_user), "user": current_user.to_dict()}


@app.post("/auth/change-password")
async def auth_change_password(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido.")

    senha_atual = str(payload.get("senha_atual") or "")
    nova_senha = str(payload.get("nova_senha") or "")
    confirmar_senha = str(payload.get("confirmar_senha") or "")

    if not verificar_senha(senha_atual, current_user.senha_hash):
        raise HTTPException(status_code=400, detail="A senha atual informada não confere.")
    if len(nova_senha) < 6:
        raise HTTPException(status_code=400, detail="A nova senha deve ter pelo menos 6 caracteres.")
    if nova_senha != confirmar_senha:
        raise HTTPException(status_code=400, detail="As senhas não coincidem.")
    if verificar_senha(nova_senha, current_user.senha_hash):
        raise HTTPException(status_code=400, detail="A nova senha precisa ser diferente da atual.")

    current_user.senha_hash = hash_senha(nova_senha)
    db.commit()
    db.refresh(current_user)
    return {"ok": True, "message": "Senha atualizada com sucesso.", "user": current_user.to_dict()}


@app.get("/auth/sessions")
def auth_sessions(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = get_token_from_request(request)
    payload = decodificar_token(token) if token else {}
    exp = payload.get("exp")
    sessoes = db.query(UserAccessLog).filter(
        UserAccessLog.user_id == current_user.id
    ).order_by(UserAccessLog.acessado_em.desc(), UserAccessLog.id.desc()).limit(10).all()
    return {
        "ok": True,
        "sessao_atual": {
            "expira_em": datetime.fromtimestamp(exp, tz=UTC).isoformat() if exp else None,
        },
        "sessoes_recentes": [
            {
                "id": sessao.id,
                "acessado_em": sessao.acessado_em.isoformat() if sessao.acessado_em else None,
            }
            for sessao in sessoes
        ],
    }


@app.post("/auth/profile/avatar")
async def auth_upload_avatar(
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not arquivo:
        raise HTTPException(status_code=400, detail="Selecione uma imagem para continuar.")

    extensao = _extensao_avatar_segura(arquivo)
    conteudo = await arquivo.read()
    if not conteudo:
        raise HTTPException(status_code=400, detail="A imagem enviada está vazia.")
    if len(conteudo) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="A imagem excede o limite de 5 MB.")

    nome_arquivo = _nome_arquivo_avatar(current_user.id, extensao)
    destino = avatar_dir / nome_arquivo
    destino.write_bytes(conteudo)

    avatar_anterior = current_user.avatar_url
    current_user.avatar_url = f"/static/avatars/{nome_arquivo}"
    current_user.avatar_updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(current_user)

    _apagar_avatar_local(avatar_anterior)

    return {"ok": True, "message": "Foto de perfil atualizada com sucesso.", "user": current_user.to_dict()}


@app.delete("/auth/profile/avatar")
def auth_remover_avatar(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    avatar_anterior = current_user.avatar_url
    current_user.avatar_url = None
    current_user.avatar_updated_at = None
    db.commit()
    db.refresh(current_user)
    _apagar_avatar_local(avatar_anterior)
    return {"ok": True, "message": "Foto de perfil removida.", "user": current_user.to_dict()}


@app.delete("/auth/account")
async def auth_excluir_conta(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    senha = str(payload.get("senha") or "")
    confirmacao = str(payload.get("confirmacao") or "").strip().upper()
    if confirmacao != "EXCLUIR":
        raise HTTPException(status_code=400, detail="Digite EXCLUIR para confirmar.")
    if not senha:
        raise HTTPException(status_code=400, detail="Informe sua senha atual.")
    if not verificar_senha(senha, current_user.senha_hash):
        raise HTTPException(status_code=401, detail="Senha atual incorreta.")

    email = current_user.email
    try:
        removidos = excluir_conta_usuario(db, current_user)
    except Exception as e:
        print(f"[AUTH] Erro ao excluir conta: {type(e).__name__}")
        raise HTTPException(status_code=500, detail="Não foi possível excluir sua conta.")
    return {
        "ok": True,
        "message": "Conta excluída com sucesso.",
        "email": email,
        "removidos": removidos,
    }


@app.post("/feedback")
async def enviar_feedback_app(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido.")

    categoria = (payload.get("categoria") or "feedback").strip().lower()
    mensagem = str(payload.get("mensagem") or "").strip()
    if categoria not in ("feedback", "problema", "melhoria"):
        categoria = "feedback"
    if len(mensagem) < 8:
        raise HTTPException(status_code=400, detail="Escreva uma mensagem um pouco mais detalhada.")

    enviado = enviar_email_feedback(current_user, categoria, mensagem)
    if not enviado:
        print("[FEEDBACK] Não foi possível entregar o feedback por e-mail.")

    return {
        "ok": True,
        "message": "Recebemos sua mensagem. Obrigado por ajudar a evoluir o PRIORIZA.",
    }


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
        raise HTTPException(status_code=400, detail="A autorização do Google foi cancelada ou recusada.")

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
        print(f"[GOOGLE] Não foi possível concluir a autorização: {type(e).__name__}")
        raise HTTPException(status_code=500, detail="Erro ao concluir login Google. Tente conectar novamente.") from None

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
    request: Request,
    titulo: str = Query(...),
    data: str = Query(..., description="YYYY-MM-DD"),
    hora_inicio: str = Query("08:00", description="HH:MM"),
    hora_fim: str = Query("09:00", description="HH:MM"),
    descricao: str = Query(""),
    local: str = Query(""),
    all_day: bool = Query(False),
    blocked: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not validar_data_iso(data):
        raise HTTPException(status_code=400, detail="Data inválida. Use YYYY-MM-DD.")
    if not all_day and (not validar_hora(hora_inicio) or not validar_hora(hora_fim)):
        raise HTTPException(status_code=400, detail="Hora inválida. Use HH:MM.")
    if not all_day and hora_fim == hora_inicio:
        raise HTTPException(status_code=400, detail="Informe horários inicial e final distintos.")

    operacao = GravacaoAgenda(db, request, current_user.id)
    anterior = operacao.repeticao()
    if anterior is not None:
        return anterior
    candidato = Tarefa(titulo=titulo, data=data, hora_inicio=hora_inicio, hora_fim=hora_fim,
                        all_day=all_day, blocked=blocked, ativo=True)
    operacao.validar([candidato])
    service = google_service(db, current_user)
    body = montar_evento_google_body(
        titulo=titulo.strip(),
        data_iso=data,
        hora_inicio=hora_inicio,
        hora_fim=hora_fim,
        descricao=(descricao or "").strip(),
        local=(local or "").strip(),
        all_day=all_day,
        blocked=blocked,
    )
    id_google = hashlib.sha256(f"prioriza-agenda:{current_user.id}:{operacao.chave}".encode()).hexdigest()
    body["id"] = id_google
    try:
        criado = service.events().insert(calendarId="primary", body=body).execute()
    except HttpError as erro:
        if erro.resp.status != 409:
            raise
        criado = service.events().get(calendarId="primary", eventId=id_google).execute()
    normalizado = normalizar_evento_google(criado)
    return operacao.salvar({
        "ok": True,
        "evento_id": criado.get("id"),
        "link": criado.get("htmlLink"),
        "titulo": normalizado["titulo"],
        "inicio": (criado.get("start") or {}).get("dateTime") or (criado.get("start") or {}).get("date"),
        "fim": (criado.get("end") or {}).get("dateTime") or (criado.get("end") or {}).get("date"),
        "evento": normalizado,
    })


@app.put("/google/calendar/events/{event_id}")
def editar_evento_google(
    request: Request,
    event_id: str,
    titulo: str = Query(...),
    data: str = Query(...),
    hora_inicio: str = Query("08:00"),
    hora_fim: str = Query("09:00"),
    descricao: str = Query(""),
    local: str = Query(""),
    all_day: bool = Query(False),
    blocked: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not validar_data_iso(data):
        raise HTTPException(status_code=400, detail="Data inválida. Use YYYY-MM-DD.")
    if not all_day and (not validar_hora(hora_inicio) or not validar_hora(hora_fim)):
        raise HTTPException(status_code=400, detail="Hora inválida. Use HH:MM.")

    if not all_day and hora_fim == hora_inicio:
        raise HTTPException(status_code=400, detail="Informe horários inicial e final distintos.")
    operacao = GravacaoAgenda(db, request, current_user.id)
    anterior = operacao.repeticao()
    if anterior is not None:
        return anterior
    vinculado = _buscar_tarefa_por_google_event_id(db, current_user.id, event_id)
    candidato = Tarefa(titulo=titulo, data=data, hora_inicio=hora_inicio, hora_fim=hora_fim,
                        all_day=all_day, blocked=blocked, ativo=True)
    operacao.validar([candidato], ignorados={vinculado.id} if vinculado else ())
    service = google_service(db, current_user)
    body = montar_evento_google_body(titulo, data, hora_inicio, hora_fim, descricao, local, all_day, blocked)
    evento = service.events().update(calendarId="primary", eventId=event_id, body=body).execute()
    return operacao.salvar({"ok": True, "evento": normalizar_evento_google(evento)})


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
    dia_operacional = _data_operacional_atual()
    hoje = data_ref.strip() if data_ref and validar_data_iso(data_ref) else dia_operacional.isoformat()

    tarefas_hoje = db.query(Tarefa).filter(Tarefa.ativo == True, Tarefa.user_id == current_user.id, Tarefa.data == hoje).all()
    total_hoje = len(tarefas_hoje)
    feitas_hoje = sum(1 for t in tarefas_hoje if normalizar_status(t.status) == "feito")
    andamento_hoje = sum(1 for t in tarefas_hoje if normalizar_status(t.status) == "em_andamento")
    pendentes_hoje = total_hoje - feitas_hoje - andamento_hoje

    checklist_itens = db.query(ChecklistItem).filter(ChecklistItem.ativo == True, ChecklistItem.user_id == current_user.id).all()
    chk_disponiveis = [i for i in checklist_itens if calcular_pode_mostrar_hoje(i, dia_operacional)]
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

@app.get("/marcos-operacionais")
def listar_marcos_operacionais(
    data: Optional[str] = Query(default=None),
    data_from: Optional[str] = Query(default=None),
    data_to: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for valor in (data, data_from, data_to):
        if valor and not validar_data_iso(valor):
            raise HTTPException(status_code=400, detail="Data inválida. Use YYYY-MM-DD.")
    consulta = db.query(MarcoOperacional).filter(
        MarcoOperacional.user_id == current_user.id,
        MarcoOperacional.ativo == True,
    )
    if data:
        consulta = consulta.filter(MarcoOperacional.data == data)
    else:
        if data_from:
            consulta = consulta.filter(MarcoOperacional.data >= data_from)
        if data_to:
            consulta = consulta.filter(MarcoOperacional.data <= data_to)
    marcos = consulta.order_by(MarcoOperacional.data.desc(), MarcoOperacional.id.desc()).limit(500).all()
    return [marco.to_dict() for marco in marcos]


@app.get("/marcos-operacionais/buscar")
def buscar_marcos_operacionais(
    q: str = Query(..., min_length=2, max_length=120),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    termo = q.strip()
    if len(termo) < 2:
        raise HTTPException(status_code=400, detail="Digite pelo menos 2 caracteres para buscar.")
    padrao = f"%{termo}%"
    marcos = (
        db.query(MarcoOperacional)
        .filter(
            MarcoOperacional.user_id == current_user.id,
            MarcoOperacional.ativo == True,
            (
                MarcoOperacional.titulo.ilike(padrao)
                | MarcoOperacional.descricao.ilike(padrao)
                | MarcoOperacional.categoria.ilike(padrao)
                | MarcoOperacional.severidade.ilike(padrao)
            ),
        )
        .order_by(MarcoOperacional.data.desc(), MarcoOperacional.id.desc())
        .limit(100)
        .all()
    )
    return [marco.to_dict() for marco in marcos]


@app.post("/marcos-operacionais", status_code=201)
def criar_marco_operacional(
    payload: MarcoOperacionalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    titulo = payload.titulo.strip()
    data_marco = payload.data.strip()
    if not titulo:
        raise HTTPException(status_code=400, detail="Título obrigatório.")
    if not validar_data_iso(data_marco):
        raise HTTPException(status_code=400, detail="Data inválida. Use YYYY-MM-DD.")
    marco = MarcoOperacional(
        user_id=current_user.id,
        titulo=titulo,
        data=data_marco,
        categoria=normalizar_categoria_marco(payload.categoria),
        severidade=normalizar_severidade_marco(payload.severidade),
        descricao=(payload.descricao or "").strip(),
        ativo=True,
    )
    db.add(marco)
    db.commit()
    db.refresh(marco)
    return marco.to_dict()


@app.put("/marcos-operacionais/{marco_id}")
def editar_marco_operacional(
    marco_id: int,
    payload: MarcoOperacionalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    marco = db.query(MarcoOperacional).filter(
        MarcoOperacional.id == marco_id,
        MarcoOperacional.user_id == current_user.id,
        MarcoOperacional.ativo == True,
    ).first()
    if not marco:
        raise HTTPException(status_code=404, detail="Marco Operacional não encontrado.")
    if payload.titulo is not None:
        titulo = payload.titulo.strip()
        if not titulo:
            raise HTTPException(status_code=400, detail="Título obrigatório.")
        marco.titulo = titulo
    if payload.data is not None:
        data_marco = payload.data.strip()
        if not validar_data_iso(data_marco):
            raise HTTPException(status_code=400, detail="Data inválida. Use YYYY-MM-DD.")
        marco.data = data_marco
    if payload.categoria is not None:
        marco.categoria = normalizar_categoria_marco(payload.categoria)
    if payload.severidade is not None:
        marco.severidade = normalizar_severidade_marco(payload.severidade)
    if payload.descricao is not None:
        marco.descricao = payload.descricao.strip()
    marco.atualizado_em = datetime.now(UTC)
    db.commit()
    db.refresh(marco)
    return marco.to_dict()


@app.delete("/marcos-operacionais/{marco_id}")
def desativar_marco_operacional(
    marco_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    marco = db.query(MarcoOperacional).filter(
        MarcoOperacional.id == marco_id,
        MarcoOperacional.user_id == current_user.id,
        MarcoOperacional.ativo == True,
    ).first()
    if not marco:
        raise HTTPException(status_code=404, detail="Marco Operacional não encontrado.")
    marco.ativo = False
    marco.atualizado_em = datetime.now(UTC)
    db.commit()
    return {"ok": True, "id": marco.id}


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


def intervalo_agenda(tarefa: Tarefa):
    try:
        dia = date.fromisoformat(tarefa.data).toordinal() * 1440
    except (TypeError, ValueError):
        return None
    if tarefa.all_day or not tarefa.hora_inicio or not validar_hora(tarefa.hora_inicio):
        return dia, dia + 1440
    inicio = hora_para_minutos(tarefa.hora_inicio)
    duracao = max(1, tarefa.duracao_min or 60)
    if tarefa.hora_fim and validar_hora(tarefa.hora_fim):
        fim = hora_para_minutos(tarefa.hora_fim)
        # O cálculo antigo truncava o fim às 23h59, mesmo com duração remanescente.
        if fim != 1439 or inicio + duracao <= 1439:
            duracao = (fim - inicio) % 1440 or duracao
    return dia + inicio, dia + inicio + duracao


def fim_horario_agenda(inicio: str, duracao: int) -> str:
    if not inicio:
        return ""
    minutos = (hora_para_minutos(inicio) + duracao) % 1440
    return f"{minutos // 60:02d}:{minutos % 60:02d}"


def assinatura_periodo_agenda(tarefa: Tarefa):
    ativo = tarefa.ativo is not False and normalizar_status(tarefa.status) != "cancelada"
    return (intervalo_agenda(tarefa), bool(tarefa.blocked)) if ativo else None


def conflitos_de_agenda(db: Session, user_id: int, candidatos, ignorados=()):
    with db.no_autoflush:
        outros = db.query(Tarefa).filter(Tarefa.user_id == user_id, Tarefa.ativo.is_(True)).order_by(Tarefa.id).all()
    comparar = []
    for tarefa in outros:
        if tarefa.id in ignorados:
            continue
        periodo = assinatura_periodo_agenda(tarefa)
        if periodo and periodo[0]:
            comparar.append((tarefa, *periodo))

    conflitos = []
    for candidato in candidatos:
        periodo = assinatura_periodo_agenda(candidato)
        if not periodo or not periodo[0]:
            continue
        (inicio, fim), bloqueado = periodo
        for outro, (inicio_outro, fim_outro), bloqueio in comparar:
            if (bloqueado or bloqueio) and inicio < fim_outro and inicio_outro < fim:
                conflitos.append({
                    "id": outro.id,
                    "titulo": outro.titulo,
                    "data": outro.data,
                    "hora_inicio": outro.hora_inicio or "",
                    "hora_fim": f"{(fim_outro // 60) % 24:02d}:{fim_outro % 60:02d}",
                    "termina_em": date.fromordinal(fim_outro // 1440).isoformat(),
                    "all_day": bool(outro.all_day or not outro.hora_inicio or not validar_hora(outro.hora_inicio)),
                    "blocked": bloqueio,
                    "ocorrencia": candidato.data,
                    "inicio_civil": inicio_outro,
                    "fim_civil": fim_outro,
                })
        comparar.append((candidato, (inicio, fim), bloqueado))
    return conflitos


class GravacaoAgenda:
    """Serializa gravações da conta e vincula o aceite ao conteúdo e conflitos."""

    def __init__(self, db: Session, request: Request, user_id: int, form=None):
        self.db = db
        self.user_id = user_id
        self.confirmacao = request.headers.get("X-Agenda-Confirmacao", "")
        chave_cliente = request.headers.get("Idempotency-Key", "")
        chave_token = self.confirmacao.split(".", 1)[0]
        self.chave = chave_cliente or chave_token or secrets.token_hex(16)
        if not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", self.chave):
            raise HTTPException(status_code=400, detail="Chave de operação inválida.")
        self.registrar_recibo = bool(chave_cliente or self.confirmacao)
        self.agora = int(datetime.now(UTC).timestamp())
        credenciais = {"token", "access_token"}
        dados = [request.method, request.url.path,
                 sorted((k, v) for k, v in request.query_params.items() if k not in credenciais),
                 sorted((k, str(v)) for k, v in (form.items() if form else ()) if k not in credenciais)]
        self.impressao = hashlib.sha256(json.dumps(dados, ensure_ascii=False).encode()).hexdigest()

        if db.get_bind().dialect.name == "sqlite":
            db.execute(text("BEGIN IMMEDIATE"))
        else:
            db.query(User.id).filter(User.id == user_id).with_for_update().one()

    def repeticao(self):
        recibo = self.db.get(ReciboAgenda, (self.user_id, self.chave))
        if not recibo or recibo.expira_em <= self.agora:
            return None
        if recibo.requisicao != self.impressao:
            raise HTTPException(status_code=409, detail={"codigo": "agenda_chave_reutilizada"})
        return json.loads(recibo.resposta)

    def validar(self, candidatos, ignorados=(), alterados=True):
        conflitos = conflitos_de_agenda(self.db, self.user_id, candidatos, ignorados) if alterados else []
        if not conflitos and not self.confirmacao:
            return
        digest = hashlib.sha256(json.dumps(conflitos, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

        def assinar(expira):
            dados = f"agenda-v1:{self.user_id}:{self.chave}:{expira}:{self.impressao}:{digest}"
            return hmac.new(JWT_SECRET.encode(), dados.encode(), hashlib.sha256).hexdigest()

        partes = self.confirmacao.split(".")
        if (
            len(partes) == 3 and partes[0] == self.chave
            and partes[1].isascii() and partes[1].isdigit() and len(partes[1]) <= 12
            and int(partes[1]) >= self.agora
            and hmac.compare_digest(partes[2].encode(), assinar(partes[1]).encode())
        ):
            return
        if not conflitos:
            raise HTTPException(status_code=409, detail={"codigo": "agenda_confirmacao_expirada"})
        expira = self.agora + 600
        raise HTTPException(status_code=409, detail={
            "codigo": "agenda_conflito",
            "fuso": TIMEZONE_PADRAO,
            "conflitos": conflitos,
            "confirmacao": f"{self.chave}.{expira}.{assinar(expira)}",
        })

    def salvar(self, resposta):
        if self.registrar_recibo:
            self.db.query(ReciboAgenda).filter(
                ReciboAgenda.user_id == self.user_id, ReciboAgenda.expira_em <= self.agora
            ).delete(synchronize_session=False)
            self.db.add(ReciboAgenda(user_id=self.user_id, chave=self.chave, requisicao=self.impressao,
                                     resposta=json.dumps(resposta, ensure_ascii=False), expira_em=self.agora + 86400))
        self.db.commit()
        return resposta


@app.post("/tarefas")
async def criar_tarefa(request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        form = await request.form() if not request.query_params.get("titulo") else {}
    except Exception:
        form = {}
    return await run_in_threadpool(_criar_tarefa, request, form, db, current_user)


def _criar_tarefa(request: Request, form, db: Session, current_user: User):
    user_id = garantir_user_id(current_user.id, "tarefa")
    q = request.query_params
    converter_demo = str(q.get("convert_demo") or "").lower() in {"1", "true", "agenda"}

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
    blocked = q.get("blocked")
    tipo_evento = q.get("tipo_evento")
    origem_evento = q.get("origem_evento")
    google_event_id = q.get("google_event_id")
    google_html_link = q.get("google_html_link") or q.get("link")
    sincronizado_google = q.get("sincronizado_google")
    ultima_sync_google = q.get("ultima_sync_google")
    repetir = q.get("repetir")
    repetir_ate = q.get("repetir_ate")

    if not titulo:
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
        blocked = form.get("blocked")
        tipo_evento = form.get("tipo_evento")
        origem_evento = form.get("origem_evento")
        google_event_id = form.get("google_event_id")
        google_html_link = form.get("google_html_link") or form.get("link")
        sincronizado_google = form.get("sincronizado_google")
        ultima_sync_google = form.get("ultima_sync_google")
        repetir = form.get("repetir")
        repetir_ate = form.get("repetir_ate")

    if not titulo or not data_str:
        raise HTTPException(status_code=400, detail="É obrigatório informar pelo menos título e data.")
    if not validar_data_iso(data_str.strip()):
        raise HTTPException(status_code=400, detail="Formato de data inválido. Use YYYY-MM-DD.")

    hora_inicio = (hora_inicio or "").strip()
    hora_fim = (hora_fim or "").strip()
    eh_all_day = str(all_day).lower() in {"1", "true", "sim", "yes"}
    eh_blocked = str(blocked).lower() in {"1", "true", "sim", "yes"}
    if eh_blocked and not hora_inicio:
        eh_all_day = True

    if not eh_all_day and hora_inicio and not validar_hora(hora_inicio):
        raise HTTPException(status_code=400, detail="Hora inicial inválida. Use HH:MM.")
    if not eh_all_day and hora_fim and not validar_hora(hora_fim):
        raise HTTPException(status_code=400, detail="Hora final inválida. Use HH:MM.")

    try:
        duracao_val = int(duracao_min) if duracao_min else 60
    except ValueError:
        duracao_val = 60
    if eh_all_day:
        duracao_val = 24 * 60
    elif hora_inicio:
        if hora_fim:
            duracao_val = (hora_para_minutos(hora_fim) - hora_para_minutos(hora_inicio)) % 1440
        if not 0 < duracao_val <= 1440:
            raise HTTPException(status_code=400, detail="A duração deve estar entre 1 e 1440 minutos.")
        hora_fim = hora_fim or fim_horario_agenda(hora_inicio, duracao_val)

    operacao = GravacaoAgenda(db, request, user_id, form)
    anterior = operacao.repeticao()
    if anterior is not None:
        return anterior

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
            "blocked": eh_blocked,
            "ativo": True,
        }
        tarefa_google = criar_ou_atualizar_tarefa_importada_google(db, user_id, payload_google, commit=False)
        operacao.validar([tarefa_google], ignorados={tarefa_google.id})
        db.flush()
        return operacao.salvar(tarefa_google.to_dict())

    recorrencia = normalizar_frequencia_interna(repetir or "Único") if str(repetir or "").upper() != "NENHUMA" else "NENHUMA"
    if recorrencia == "UNICO":
        recorrencia = "NENHUMA"
    data_final = (repetir_ate or "").strip()
    if recorrencia != "NENHUMA" and (not data_final or not validar_data_iso(data_final)):
        raise HTTPException(status_code=400, detail="Informe uma data final válida para a recorrência.")
    inicio_serie = datetime.now(UTC) if recorrencia != "NENHUMA" else None

    def nova_ocorrencia(data_ocorrencia: str) -> Tarefa:
        return Tarefa(
            user_id=user_id, titulo=titulo.strip(), descricao=(descricao or "").strip(),
            origem=(origem or "").strip(), local=(local or "").strip(), data=data_ocorrencia,
            hora_inicio="" if eh_all_day else hora_inicio, hora_fim="" if eh_all_day else hora_fim,
            duracao_min=duracao_val, prioridade=prioridade_val,
            status=normalizar_status(status or "pendente"), tipo_evento="prioriza",
            origem_evento="prioriza", sincronizado_google=False, all_day=eh_all_day,
            blocked=eh_blocked, ativo=True, recurrence_type=recorrencia,
            recurrence_until=data_final, recurrence_started_at=inicio_serie,
        )

    datas_ocorrencias = [date.fromisoformat(data_str.strip())]
    if recorrencia != "NENHUMA":
        limite = date.fromisoformat(data_final)
        while datas_ocorrencias[-1] < limite and len(datas_ocorrencias) < 1000:
            proxima = _proxima_data_recorrencia(datas_ocorrencias[-1], recorrencia)
            if proxima > limite:
                break
            datas_ocorrencias.append(proxima)
    tarefas_criadas = [nova_ocorrencia(valor.isoformat()) for valor in datas_ocorrencias]
    operacao.validar(tarefas_criadas)
    db.add_all(tarefas_criadas)
    tarefa = tarefas_criadas[0]
    db.flush()
    if converter_demo:
        converter_modulo_demo_sem_commit(db, current_user, "agenda")
    resposta = ({"quantidade": len(tarefas_criadas), "tarefas": [item.to_dict() for item in tarefas_criadas]}
                if len(tarefas_criadas) > 1 else tarefa.to_dict())
    operacao.salvar(resposta)

    if _bool_from_value(sincronizar_google):
        try:
            tarefa = sincronizar_tarefa_no_google(db, tarefa, current_user)
            if len(tarefas_criadas) > 1:
                resposta["tarefas"][0] = tarefa.to_dict()
            else:
                resposta = tarefa.to_dict()
            if operacao.registrar_recibo:
                recibo = db.get(ReciboAgenda, (user_id, operacao.chave))
                recibo.resposta = json.dumps(resposta, ensure_ascii=False)
                db.commit()
        except Exception as e:
            print(f"[GOOGLE] Falha ao sincronizar tarefa recém-criada: {type(e).__name__}")
    return resposta


@app.put("/tarefas/{tarefa_id}")
async def editar_tarefa(tarefa_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        form = await request.form()
    except Exception:
        form = {}
    return await run_in_threadpool(_editar_tarefa, tarefa_id, request, form, db, current_user)


def _editar_tarefa(tarefa_id: int, request: Request, form, db: Session, current_user: User):
    q = request.query_params

    def pegar(campo: str):
        return q.get(campo, form.get(campo))

    operacao = GravacaoAgenda(db, request, current_user.id, form)
    anterior = operacao.repeticao()
    if anterior is not None:
        return anterior

    tarefa = db.query(Tarefa).filter(Tarefa.id == tarefa_id, Tarefa.user_id == current_user.id, Tarefa.ativo.is_(True)).first()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")

    data_str = (pegar("data") or "").strip()
    if data_str and not validar_data_iso(data_str):
        raise HTTPException(status_code=400, detail="Formato de data inválido. Use YYYY-MM-DD.")
    hora_inicio = pegar("hora_inicio")
    hora_fim = pegar("hora_fim")
    for hora in (hora_inicio, hora_fim):
        if hora and not validar_hora(hora.strip()):
            raise HTTPException(status_code=400, detail="Hora inválida. Use HH:MM.")
    try:
        duracao = int(pegar("duracao_min")) if pegar("duracao_min") else None
        prioridade = int(pegar("prioridade")) if pegar("prioridade") else None
    except ValueError as erro:
        raise HTTPException(status_code=400, detail="Duração ou prioridade inválida.") from erro

    alvos = [tarefa]
    if (pegar("scope") or "").strip().lower() == "series" and tarefa.recurrence_started_at:
        alvos = db.query(Tarefa).filter(
            Tarefa.user_id == current_user.id, Tarefa.ativo.is_(True),
            Tarefa.recurrence_started_at == tarefa.recurrence_started_at, Tarefa.data >= tarefa.data,
        ).order_by(Tarefa.data, Tarefa.id).all()

    originais = {alvo.id: assinatura_periodo_agenda(alvo) for alvo in alvos}
    for alvo in alvos:
        for campo in ("titulo", "descricao", "origem", "local"):
            valor = pegar(campo)
            if valor is not None:
                setattr(alvo, campo, valor.strip())
        if prioridade is not None:
            alvo.prioridade = prioridade if prioridade in (1, 2, 3) else 2
        if pegar("status") is not None:
            alvo.status = normalizar_status(pegar("status"))
        if alvo is tarefa:
            alvo.data = data_str or alvo.data
            if pegar("all_day") is not None:
                alvo.all_day = _bool_from_value(pegar("all_day"))
            if pegar("blocked") is not None:
                alvo.blocked = _bool_from_value(pegar("blocked"))
                if alvo.blocked and pegar("all_day") is None and not (hora_inicio or alvo.hora_inicio):
                    alvo.all_day = True

        tempos_informados = hora_inicio is not None or hora_fim is not None or duracao is not None
        if alvo.all_day and (tempos_informados or (alvo is tarefa and pegar("all_day") is not None)):
            alvo.hora_inicio = alvo.hora_fim = ""
            alvo.duracao_min = 1440
        elif not alvo.all_day and tempos_informados:
            if hora_inicio is not None:
                alvo.hora_inicio = hora_inicio.strip()
            intervalo = duracao if duracao is not None else (alvo.duracao_min or 60)
            if hora_fim and alvo.hora_inicio:
                intervalo = (hora_para_minutos(hora_fim) - hora_para_minutos(alvo.hora_inicio)) % 1440
            if not 0 < intervalo <= 1440:
                raise HTTPException(status_code=400, detail="A duração deve estar entre 1 e 1440 minutos.")
            alvo.duracao_min = intervalo
            alvo.hora_fim = fim_horario_agenda(alvo.hora_inicio, intervalo)

    alterados = [alvo for alvo in alvos if assinatura_periodo_agenda(alvo) != originais[alvo.id]]
    operacao.validar(alterados, ignorados={alvo.id for alvo in alterados}, alterados=bool(alterados))
    resposta = operacao.salvar(tarefa.to_dict())

    if _bool_from_value(pegar("sincronizar_google")) or tarefa.google_event_id:
        try:
            tarefa = sincronizar_tarefa_no_google(db, tarefa, current_user)
            resposta = tarefa.to_dict()
            if operacao.registrar_recibo:
                recibo = db.get(ReciboAgenda, (current_user.id, operacao.chave))
                recibo.resposta = json.dumps(resposta, ensure_ascii=False)
                db.commit()
        except Exception as e:
            print(f"[GOOGLE] Falha ao sincronizar edição de compromisso: {type(e).__name__}")

    return resposta


@app.post("/tarefas/{tarefa_id}/finalizar-recorrencia")
def finalizar_recorrencia_tarefa(tarefa_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tarefa = db.query(Tarefa).filter(Tarefa.id == tarefa_id, Tarefa.user_id == current_user.id, Tarefa.ativo == True).first()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Compromisso não encontrado.")
    if not tarefa.recurrence_started_at or (tarefa.recurrence_type or "NENHUMA") == "NENHUMA":
        raise HTTPException(status_code=400, detail="Este compromisso não pertence a uma recorrência.")
    agora = datetime.now(UTC)
    hoje = date.today().isoformat()
    serie = db.query(Tarefa).filter(
        Tarefa.user_id == current_user.id,
        Tarefa.recurrence_started_at == tarefa.recurrence_started_at,
    ).all()
    removidas = 0
    for ocorrencia in serie:
        ocorrencia.recurrence_ended_at = agora
        if ocorrencia.data > hoje and normalizar_status(ocorrencia.status) != "feito":
            ocorrencia.ativo = False
            removidas += 1
    db.commit()
    return {"ok": True, "ocorrencias_futuras_removidas": removidas}


@app.post("/tarefas_editar")
def editar_tarefa_legado(
    request: Request,
    tarefa_id: int,
    titulo: str,
    origem: str = "",
    data: str = "",
    hora_inicio: str = "",
    duracao_min: int = 60,
    prioridade: int = 2,
    all_day: bool = False,
    blocked: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    operacao = GravacaoAgenda(db, request, current_user.id)
    anterior = operacao.repeticao()
    if anterior is not None:
        return anterior
    tarefa = db.query(Tarefa).filter(Tarefa.id == tarefa_id, Tarefa.user_id == current_user.id, Tarefa.ativo == True).first()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    if data and not validar_data_iso(data):
        raise HTTPException(status_code=400, detail="Data inválida. Use YYYY-MM-DD.")
    if not all_day and hora_inicio and not validar_hora(hora_inicio):
        raise HTTPException(status_code=400, detail="Hora inicial inválida. Use HH:MM.")

    original = assinatura_periodo_agenda(tarefa)
    if not all_day and not 0 < duracao_min <= 1440:
        raise HTTPException(status_code=400, detail="A duração deve estar entre 1 e 1440 minutos.")
    tarefa.titulo = titulo.strip()
    tarefa.origem = origem.strip()
    if data:
        tarefa.data = data
    tarefa.all_day = bool(all_day or (blocked and not hora_inicio))
    tarefa.blocked = bool(blocked)
    tarefa.hora_inicio = "" if tarefa.all_day else hora_inicio.strip()
    tarefa.duracao_min = 24 * 60 if tarefa.all_day else duracao_min
    tarefa.hora_fim = "" if tarefa.all_day else fim_horario_agenda(tarefa.hora_inicio, tarefa.duracao_min)
    tarefa.prioridade = prioridade if prioridade in (1, 2, 3) else 2

    operacao.validar([tarefa], ignorados={tarefa.id}, alterados=original != assinatura_periodo_agenda(tarefa))
    return operacao.salvar({"ok": True, "mensagem": "Tarefa atualizada com sucesso", "tarefa": tarefa.to_dict()})


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
    hoje = _data_operacional_atual()
    return [i.to_dict(incluir_pode_hoje=True, data_operacional=hoje) for i in itens]


@app.post("/checklist_criar")
def criar_checklist_item(
    titulo: str = Query(...),
    origem: str = Query(""),
    frequencia: str = Query("Semanal"),
    convert_demo: bool | Literal["checklist"] = Query(False),
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
    db.flush()
    if convert_demo:
        converter_modulo_demo_sem_commit(db, current_user, "checklist")
    db.commit()
    db.refresh(item)
    return item.to_dict(incluir_pode_hoje=True)


@app.put("/checklist/{item_id}")
def editar_checklist_item(
    item_id: int,
    titulo: str = Query(None),
    origem: str = Query(None),
    frequencia: str = Query(None),
    scope: str = Query("single"),
    proxima_execucao: str = Query(None),
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
        item.recurrence_ended_at = None
    if proxima_execucao is not None:
        if not validar_data_iso(proxima_execucao):
            raise HTTPException(status_code=400, detail="Data de retorno inválida.")
        intervalo = _intervalo_dias(frequencia_interna_efetiva(item.frequencia, item.frequencia_interna))
        base = date.fromisoformat(proxima_execucao) - timedelta(days=intervalo)
        item.ultimo_exec = datetime.combine(base, datetime.min.time(), tzinfo=UTC)

    db.commit()
    db.refresh(item)
    return item.to_dict(incluir_pode_hoje=True)


@app.post("/checklist/{item_id}/finalizar-recorrencia")
def finalizar_recorrencia_checklist(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(ChecklistItem).filter(ChecklistItem.id == item_id, ChecklistItem.user_id == current_user.id, ChecklistItem.ativo == True).first()
    if not item:
        raise HTTPException(status_code=404, detail="Rotina não encontrada.")
    if frequencia_interna_efetiva(item.frequencia, item.frequencia_interna) == "UNICO":
        raise HTTPException(status_code=400, detail="Esta rotina não é recorrente.")
    item.recurrence_ended_at = datetime.now(UTC)
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
    elif novo_status == "pendente" and item.frequencia_interna == "UNICO":
        item.ultimo_exec = None

    db.commit()
    db.refresh(item)
    return item.to_dict(incluir_pode_hoje=True)


@app.post("/checklist_reset")
def resetar_status_checklist(item_id: int = Query(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(ChecklistItem).filter(ChecklistItem.id == item_id, ChecklistItem.user_id == current_user.id, ChecklistItem.ativo == True).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado.")
    hoje = _data_operacional_atual()
    if item.status == "feito" and not checklist_concluido_no_dia(item, hoje) and calcular_pode_mostrar_hoje(item, hoje):
        item.status = "pendente"
        db.commit()
        db.refresh(item)
    return item.to_dict(incluir_pode_hoje=True, data_operacional=hoje)


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
    convert_demo: bool | Literal["notes"] = Query(False),
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
    db.flush()
    if convert_demo:
        converter_modulo_demo_sem_commit(db, current_user, "notes")
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

def tabela_checklist_backup_legado(db: Session):
    colunas = inspect(db.connection()).get_columns("checklist")
    if any(coluna["name"] == "area" for coluna in colunas):
        return table("checklist", column("id"), column("user_id"), column("area"))
    return None


# ============================================================
# EVOLUÇÃO · METAS
# ============================================================

ValorMeta = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=3, allow_inf_nan=False)]


class MetaDados(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    titulo: str = Field(min_length=1, max_length=160)
    tipo: Literal["quantidade", "percentual", "simples"]
    objetivo: ValorMeta | None = None
    unidade: str | None = Field(default=None, max_length=32)
    prazo: date | None = None

    @model_validator(mode="after")
    def validar_objetivo(self):
        if self.tipo == "quantidade":
            if self.objetivo is None or self.objetivo <= 0:
                raise ValueError("Informe uma quantidade desejada maior que zero.")
        else:
            valor_fixo = Decimal(100 if self.tipo == "percentual" else 1)
            if self.objetivo is not None and self.objetivo != valor_fixo:
                raise ValueError("Objetivo incompatível com o tipo de acompanhamento.")
            if self.unidade:
                raise ValueError("A unidade se aplica apenas a metas de quantidade.")
            self.objetivo = valor_fixo
        self.unidade = self.unidade or None
        return self


class MetaEdicao(MetaDados):
    versao: int = Field(ge=1)


class MetaProgresso(BaseModel):
    progresso: ValorMeta
    versao: int = Field(ge=1)


class MetaBackup(MetaDados):
    id: UUID
    progresso: ValorMeta
    criada_em: AwareDatetime
    concluida_em: AwareDatetime | None = None

    @model_validator(mode="after")
    def validar_backup(self):
        validar_progresso_meta(self.tipo, self.objetivo, self.progresso)
        if (self.progresso == self.objetivo) != (self.concluida_em is not None):
            raise ValueError("Data de conclusão incompatível com o progresso.")
        if self.concluida_em and self.concluida_em < self.criada_em:
            raise ValueError("A conclusão não pode ser anterior à criação.")
        return self


def validar_progresso_meta(tipo, objetivo, progresso):
    if progresso > objetivo or (tipo == "simples" and progresso not in (0, 1)):
        raise ValueError("Progresso fora do intervalo permitido.")


def buscar_meta(db, user_id, meta_id):
    meta = db.get(Meta, (user_id, str(meta_id)))
    if not meta:
        raise HTTPException(status_code=404, detail="Meta não encontrada.")
    return meta


def atualizar_meta_versionada(db, meta, versao, valores):
    alteradas = db.query(Meta).filter_by(
        user_id=meta.user_id, id=meta.id, versao=versao,
    ).update({**valores, "versao": Meta.versao + 1}, synchronize_session=False)
    if not alteradas:
        db.rollback()
        raise HTTPException(status_code=409, detail="A meta foi atualizada em outra sessão. Tente novamente.")
    db.commit()
    db.refresh(meta)
    return meta.to_dict()


@app.get("/metas")
def listar_metas(response: Response, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-store"
    metas = db.query(Meta).filter_by(user_id=current_user.id).order_by(Meta.criada_em.desc(), Meta.id).all()
    return [meta.to_dict() for meta in metas]


@app.post("/metas", status_code=201)
def criar_meta(dados: MetaDados, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    meta = Meta(user_id=current_user.id, criada_em=datetime.now(UTC), **dados.model_dump())
    db.add(meta)
    db.commit()
    db.refresh(meta)
    return meta.to_dict()


@app.put("/metas/{meta_id}")
def editar_meta(meta_id: UUID, dados: MetaEdicao, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    meta = buscar_meta(db, current_user.id, meta_id)
    if dados.tipo != meta.tipo and meta.progresso != 0:
        raise HTTPException(status_code=422, detail="Zere o progresso antes de alterar o tipo de acompanhamento.")
    if dados.objetivo < meta.progresso:
        raise HTTPException(status_code=422, detail="A quantidade desejada não pode ser menor que o progresso atual.")
    valores = dados.model_dump(exclude={"versao"})
    valores["concluida_em"] = (meta.concluida_em or datetime.now(UTC)) if meta.progresso == dados.objetivo else None
    return atualizar_meta_versionada(db, meta, dados.versao, valores)


@app.patch("/metas/{meta_id}/progresso")
def atualizar_progresso_meta(meta_id: UUID, dados: MetaProgresso, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    meta = buscar_meta(db, current_user.id, meta_id)
    try:
        validar_progresso_meta(meta.tipo, meta.objetivo, dados.progresso)
    except ValueError as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro
    concluida_em = (meta.concluida_em or datetime.now(UTC)) if dados.progresso == meta.objetivo else None
    return atualizar_meta_versionada(db, meta, dados.versao, {"progresso": dados.progresso, "concluida_em": concluida_em})


@app.delete("/metas/{meta_id}", status_code=204)
def excluir_meta(meta_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    excluidas = db.query(Meta).filter_by(user_id=current_user.id, id=str(meta_id)).delete()
    if not excluidas:
        raise HTTPException(status_code=404, detail="Meta não encontrada.")
    db.commit()


def restaurar_metas(db, user_id, registros, importadas):
    if not isinstance(registros, list):
        importadas["erros"].append("Metas: esperava uma lista.")
        return
    insert = sqlite_insert if IS_SQLITE else postgresql_insert
    for indice, registro in enumerate(registros, 1):
        try:
            dados = MetaBackup.model_validate(registro)
        except ValidationError:
            importadas["erros"].append(f"Meta {indice}: dados inválidos.")
            continue
        valores = dados.model_dump(exclude={"id"})
        for campo in ("criada_em", "concluida_em"):
            if valores[campo]:
                valores[campo] = valores[campo].astimezone(UTC)
        comando = insert(Meta).values(user_id=user_id, id=str(dados.id), **valores)
        gravadas = db.execute(comando.on_conflict_do_nothing(index_elements=["user_id", "id"])).rowcount
        importadas["metas"] += gravadas


# ============================================================
# EVOLUÇÃO · HÁBITOS
# ============================================================

class HabitoDados(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    titulo: str = Field(min_length=1, max_length=160)
    frequencia: int = Field(ge=1, le=7, strict=True)


class HabitoArquivo(BaseModel):
    arquivado: bool = Field(strict=True)


class HabitoRegistro(BaseModel):
    realizado: bool = Field(strict=True)


class FrequenciaHistoricaHabito(BaseModel):
    semana: date
    frequencia: int = Field(ge=1, le=7, strict=True)


class PeriodoHistoricoHabito(BaseModel):
    inicio: date
    fim: date | None = None


def inicio_semana_habito(dia):
    return dia - timedelta(days=dia.weekday())


def dia_ativo_habito(dia, periodos):
    return any(periodo.inicio <= dia and (periodo.fim is None or dia <= periodo.fim) for periodo in periodos)


class HabitoBackup(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    id: UUID
    titulo: str = Field(min_length=1, max_length=160)
    criado_em: date
    arquivado_em: date | None = None
    frequencias: list[FrequenciaHistoricaHabito]
    periodos: list[PeriodoHistoricoHabito]
    realizacoes: set[date]

    @model_validator(mode="after")
    def validar_historico(self):
        hoje = _data_operacional_atual()
        periodos = sorted(self.periodos, key=lambda item: item.inicio)
        if not periodos or periodos[0].inicio != self.criado_em:
            raise ValueError("Histórico de atividade inválido.")
        for indice, periodo in enumerate(periodos):
            if not self.criado_em <= periodo.inicio <= hoje or (
                periodo.fim is not None and not periodo.inicio <= periodo.fim <= hoje
            ):
                raise ValueError("Período de atividade inválido.")
            if indice:
                anterior = periodos[indice - 1]
                if anterior.fim is None or anterior.fim >= periodo.inicio:
                    raise ValueError("Períodos de atividade sobrepostos.")
        if self.arquivado_em != periodos[-1].fim:
            raise ValueError("Arquivo incompatível com o último período.")
        semanas = [item.semana for item in self.frequencias]
        if not semanas or min(semanas) != inicio_semana_habito(self.criado_em) or len(set(semanas)) != len(semanas):
            raise ValueError("Histórico de frequências inválido.")
        if any(semana.weekday() != 0 or semana > hoje for semana in semanas):
            raise ValueError("Semana de frequência inválida.")
        if any(dia > hoje or not dia_ativo_habito(dia, periodos) for dia in self.realizacoes):
            raise ValueError("Realização fora dos períodos de atividade.")
        return self


def agrupar_historico_habitos(db, modelo, user_id, *filtros):
    historico = {}
    for item in db.query(modelo).filter(modelo.user_id == user_id, *filtros):
        historico.setdefault(item.habito_id, []).append(item)
    return historico


def gravar_historico_habito(db, modelo, valores, conflito_atualizar=None):
    insert = sqlite_insert if IS_SQLITE else postgresql_insert
    comando = insert(modelo).values(**valores)
    chaves = [campo.name for campo in modelo.__table__.primary_key]
    if conflito_atualizar is not None:
        comando = comando.on_conflict_do_update(index_elements=chaves, set_=conflito_atualizar)
    else:
        comando = comando.on_conflict_do_nothing(index_elements=chaves)
    return db.execute(comando).rowcount


def bloquear_habito(db, user_id, habito_id):
    # A atualização adquire o bloqueio antes de ler os períodos. SQLite serializa escritores.
    chave = (user_id, str(habito_id))
    alteradas = db.query(Habito).filter_by(user_id=chave[0], id=chave[1]).update(
        {"titulo": Habito.titulo}, synchronize_session=False,
    )
    if not alteradas:
        raise HTTPException(status_code=404, detail="Hábito não encontrado.")
    return db.get(Habito, chave)


@app.get("/habitos")
def listar_habitos(response: Response, semana: date | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-store"
    hoje = _data_operacional_atual()
    atual = inicio_semana_habito(hoje)
    semana = semana or atual
    if semana.weekday() != 0 or semana > atual:
        raise HTTPException(status_code=422, detail="Selecione uma segunda-feira da semana atual ou de uma anterior.")
    fim = semana + timedelta(days=6)
    usuario = current_user.id
    dias = [semana + timedelta(days=i) for i in range(7)]
    frequencias = agrupar_historico_habitos(db, HabitoFrequencia, usuario, HabitoFrequencia.semana <= atual)
    periodos = agrupar_historico_habitos(db, HabitoPeriodo, usuario)
    registros = agrupar_historico_habitos(db, HabitoRealizacao, usuario, HabitoRealizacao.dia.between(semana, fim))
    resultado = []
    for habito in db.query(Habito).filter_by(user_id=usuario).order_by(Habito.criado_em, Habito.id):
        atividade = periodos.get(habito.id, [])
        aplicaveis = [dia for dia in dias if dia_ativo_habito(dia, atividade)]
        historico = frequencias.get(habito.id, [])
        if not historico:
            continue
        vigente = max(historico, key=lambda item: item.semana)
        historica = max((item for item in historico if item.semana <= semana), key=lambda item: item.semana, default=None)
        resultado.append({
            "id": habito.id, "titulo": habito.titulo, "criado_em": habito.criado_em,
            "arquivado_em": habito.arquivado_em, "frequencia_atual": vigente.frequencia,
            "frequencia": historica.frequencia if historica else None,
            "aplicavel": bool(aplicaveis), "disponiveis": [dia for dia in aplicaveis if dia <= hoje],
            "realizacoes": sorted(item.dia for item in registros.get(habito.id, [])),
        })
    return {"hoje": hoje, "semana": semana, "semana_atual": atual, "habitos": resultado}


@app.post("/habitos", status_code=201)
def criar_habito(dados: HabitoDados, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    hoje = _data_operacional_atual()
    habito = Habito(user_id=current_user.id, titulo=dados.titulo, criado_em=hoje)
    db.add(habito)
    db.flush()
    db.add(HabitoPeriodo(user_id=habito.user_id, habito_id=habito.id, inicio=hoje))
    db.add(HabitoFrequencia(user_id=habito.user_id, habito_id=habito.id, semana=inicio_semana_habito(hoje), frequencia=dados.frequencia))
    db.commit()
    return {"id": habito.id}


@app.put("/habitos/{habito_id}")
def editar_habito(habito_id: UUID, dados: HabitoDados, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    habito = bloquear_habito(db, current_user.id, habito_id)
    habito.titulo = dados.titulo
    semana = inicio_semana_habito(_data_operacional_atual())
    gravar_historico_habito(db, HabitoFrequencia, {
        "user_id": habito.user_id, "habito_id": habito.id, "semana": semana, "frequencia": dados.frequencia,
    }, {"frequencia": dados.frequencia})
    db.commit()
    return {"id": str(habito_id)}


@app.put("/habitos/{habito_id}/arquivo")
def arquivar_habito(habito_id: UUID, dados: HabitoArquivo, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    habito = bloquear_habito(db, current_user.id, habito_id)
    hoje = _data_operacional_atual()
    if dados.arquivado and not habito.arquivado_em:
        atual = db.query(HabitoPeriodo).filter_by(user_id=habito.user_id, habito_id=habito.id, fim=None).one()
        atual.fim = hoje
        habito.arquivado_em = hoje
    elif not dados.arquivado and habito.arquivado_em:
        if habito.arquivado_em == hoje:
            atual = db.query(HabitoPeriodo).filter_by(user_id=habito.user_id, habito_id=habito.id, fim=hoje).one()
            atual.fim = None
        else:
            db.add(HabitoPeriodo(user_id=habito.user_id, habito_id=habito.id, inicio=hoje))
        habito.arquivado_em = None
    db.commit()
    return {"arquivado": dados.arquivado}


@app.put("/habitos/{habito_id}/realizacoes/{dia}")
def registrar_habito(habito_id: UUID, dia: date, dados: HabitoRegistro, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    habito = bloquear_habito(db, current_user.id, habito_id)
    periodos = db.query(HabitoPeriodo).filter_by(user_id=habito.user_id, habito_id=habito.id).all()
    if dia > _data_operacional_atual() or not dia_ativo_habito(dia, periodos):
        raise HTTPException(status_code=422, detail="Este dia não pertence ao período de atividade do hábito.")
    chave = {"user_id": habito.user_id, "habito_id": habito.id, "dia": dia}
    if dados.realizado:
        gravar_historico_habito(db, HabitoRealizacao, chave)
    else:
        db.query(HabitoRealizacao).filter_by(**chave).delete()
    db.commit()
    return {"realizado": dados.realizado}


def excluir_historico_habitos(db, user_id, habito_id=None):
    # SQLite pode iniciar sem chaves estrangeiras habilitadas.
    for modelo in (HabitoRealizacao, HabitoFrequencia, HabitoPeriodo):
        consulta = db.query(modelo).filter_by(user_id=user_id)
        if habito_id is not None:
            consulta = consulta.filter_by(habito_id=habito_id)
        consulta.delete(synchronize_session=False)


@app.delete("/habitos/{habito_id}", status_code=204)
def excluir_habito(habito_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    habito = bloquear_habito(db, current_user.id, habito_id)
    excluir_historico_habitos(db, habito.user_id, habito.id)
    db.delete(habito)
    db.commit()


def exportar_habitos(db, user_id):
    consulta = db.query(Habito).filter_by(user_id=user_id).order_by(Habito.id)
    # No PostgreSQL, mantém os registros de cada hábito estáveis durante a leitura.
    habitos = consulta.with_for_update(read=True).all()
    frequencias = agrupar_historico_habitos(db, HabitoFrequencia, user_id)
    periodos = agrupar_historico_habitos(db, HabitoPeriodo, user_id)
    registros = agrupar_historico_habitos(db, HabitoRealizacao, user_id)
    return [{
        "id": h.id, "titulo": h.titulo, "criado_em": h.criado_em, "arquivado_em": h.arquivado_em,
        "frequencias": [{"semana": f.semana, "frequencia": f.frequencia} for f in sorted(frequencias.get(h.id, []), key=lambda item: item.semana)],
        "periodos": [{"inicio": p.inicio, "fim": p.fim} for p in sorted(periodos.get(h.id, []), key=lambda item: item.inicio)],
        "realizacoes": sorted(r.dia for r in registros.get(h.id, [])),
    } for h in habitos]


def restaurar_habitos(db, user_id, registros, importadas):
    if not isinstance(registros, list):
        importadas["erros"].append("Hábitos: esperava uma lista.")
        return
    for indice, registro in enumerate(registros, 1):
        try:
            habito = HabitoBackup.model_validate(registro)
        except ValidationError:
            importadas["erros"].append(f"Hábito {indice}: histórico inválido.")
            continue
        uid = str(habito.id)
        gravado = gravar_historico_habito(db, Habito, {
            "user_id": user_id, "id": uid, "titulo": habito.titulo,
            "criado_em": habito.criado_em, "arquivado_em": habito.arquivado_em,
        })
        if not gravado:
            continue
        chave = {"user_id": user_id, "habito_id": uid}
        db.add_all([HabitoFrequencia(**chave, **f.model_dump()) for f in habito.frequencias])
        db.add_all([HabitoPeriodo(**chave, **p.model_dump()) for p in habito.periodos])
        db.add_all([HabitoRealizacao(**chave, dia=dia) for dia in habito.realizacoes])
        importadas["habitos"] += 1


# ============================================================
# EVOLUÇÃO · DATAS ESPECIAIS
# ============================================================

class DataEspecialDados(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    titulo: str = Field(min_length=1, max_length=160)
    data_original: date
    repeticao: Literal["nenhuma", "mensal", "anual"] = "nenhuma"


class DataEspecialBackup(DataEspecialDados):
    id: UUID
    criada_em: date


@app.get("/datas-especiais")
def listar_datas_especiais(response: Response, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-store"
    registros = db.query(DataEspecial).filter_by(user_id=current_user.id).order_by(DataEspecial.id)
    return [registro.to_dict() for registro in registros]


@app.post("/datas-especiais", status_code=201)
def criar_data_especial(dados: DataEspecialDados, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    registro = DataEspecial(user_id=current_user.id, criada_em=_data_operacional_atual(), **dados.model_dump())
    db.add(registro)
    db.commit()
    db.refresh(registro)
    return registro.to_dict()


@app.put("/datas-especiais/{data_id}", status_code=204)
def editar_data_especial(data_id: UUID, dados: DataEspecialDados, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    quantidade = db.query(DataEspecial).filter_by(user_id=current_user.id, id=str(data_id)).update(dados.model_dump())
    if not quantidade:
        raise HTTPException(status_code=404, detail="Data especial não encontrada.")
    db.commit()


@app.delete("/datas-especiais/{data_id}", status_code=204)
def excluir_data_especial(data_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    quantidade = db.query(DataEspecial).filter_by(user_id=current_user.id, id=str(data_id)).delete()
    if not quantidade:
        raise HTTPException(status_code=404, detail="Data especial não encontrada.")
    db.commit()


def restaurar_datas_especiais(db, user_id, registros, importadas):
    if not isinstance(registros, list):
        importadas["erros"].append("Datas especiais: esperava uma lista.")
        return
    inserir = sqlite_insert if IS_SQLITE else postgresql_insert
    for indice, registro in enumerate(registros, 1):
        try:
            data = DataEspecialBackup.model_validate(registro)
        except ValidationError:
            importadas["erros"].append(f"Data especial {indice}: dados inválidos.")
            continue
        comando = inserir(DataEspecial).values(
            user_id=user_id, id=str(data.id), **data.model_dump(exclude={"id"}),
        ).on_conflict_do_nothing(index_elements=["user_id", "id"])
        importadas["datas_especiais"] += db.execute(comando).rowcount


@app.get("/backup")
def exportar_backup(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tarefas = db.query(Tarefa).filter(Tarefa.user_id == current_user.id, Tarefa.ativo == True).all()
    checklist = db.query(ChecklistItem).filter(ChecklistItem.user_id == current_user.id, ChecklistItem.ativo == True).all()
    notas = db.query(Note).filter(Note.user_id == current_user.id, Note.ativo == True).all()
    marcos = db.query(MarcoOperacional).filter(MarcoOperacional.user_id == current_user.id, MarcoOperacional.ativo == True).all()
    checklist_exportado = [c.to_dict(incluir_pode_hoje=True) for c in checklist]
    legado = tabela_checklist_backup_legado(db)
    if legado is not None and checklist_exportado:
        areas = dict(db.query(legado.c.id, legado.c.area).filter(
            legado.c.user_id == current_user.id, legado.c.area.is_not(None)
        ).all())
        for item in checklist_exportado:
            if item["id"] in areas:
                item["area"] = areas[item["id"]]
    return {
        "versao": "2.4",
        "datas_especiais": [item.to_dict() for item in db.query(DataEspecial).filter_by(user_id=current_user.id).order_by(DataEspecial.id)],
        "habitos": exportar_habitos(db, current_user.id),
        "metas": [meta.to_dict() for meta in db.query(Meta).filter_by(user_id=current_user.id).all()],
        "exportado_em": datetime.now(UTC).isoformat(),
        "tarefas": [t.to_dict() for t in tarefas],
        "checklist": checklist_exportado,
        "notas": [n.to_dict() for n in notas],
        "marcos_operacionais": [m.to_dict() for m in marcos],
    }


def data_hora_backup(valor):
    if isinstance(valor, str) and valor:
        try:
            data = datetime.fromisoformat(valor)
            return data.astimezone(UTC).replace(tzinfo=None) if data.tzinfo else data
        except ValueError:
            pass
    return None


@app.post("/restaurar")
async def importar_backup(request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = garantir_user_id(current_user.id, "restauração")
    try:
        dados = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido.")

    if not isinstance(dados, dict):
        raise HTTPException(status_code=400, detail="Backup inválido.")

    tarefas_raw = dados.get("tarefas", [])
    checklist_raw = dados.get("checklist", [])
    notas_raw = dados.get("notas", [])
    marcos_raw = dados.get("marcos_operacionais", [])
    importadas = {"tarefas": 0, "checklist": 0, "notas": 0, "marcos_operacionais": 0, "metas": 0, "habitos": 0, "datas_especiais": 0, "erros": []}

    for t in tarefas_raw:
        try:
            titulo = (t.get("titulo") or "").strip()
            data_str = (t.get("data") or "").strip()
            if not titulo or not data_str or not validar_data_iso(data_str):
                continue
            hora_inicio = (t.get("hora_inicio") or "").strip()
            hora_fim = (t.get("hora_fim") or "").strip()
            all_day_val = bool(t.get("all_day"))
            blocked_val = bool(t.get("blocked"))
            duracao_val = int(t.get("duracao_min") or (1440 if all_day_val else 60))
            if all_day_val:
                duracao_val = 1440
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
                all_day=all_day_val,
                blocked=blocked_val,
                ativo=True,
            )
            db.add(nova)
            importadas["tarefas"] += 1
        except Exception as e:
            importadas["erros"].append(f"Tarefa '{t.get('titulo', '?')}': {e}")

    legado = tabela_checklist_backup_legado(db)
    vinculos_legados = []
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
                ultimo_exec=data_hora_backup(c.get("ultimo_exec")),
                recurrence_ended_at=data_hora_backup(c.get("recurrence_ended_at")),
                criado_em=data_hora_backup(c.get("criado_em")),
                ativo=True,
            )
            db.add(novo)
            if isinstance(c.get("area"), str) and c["area"]:
                if legado is not None:
                    vinculos_legados.append((novo, c["area"]))
                else:
                    importadas["erros"].append(
                        f"Checklist '{titulo}': rotina restaurada sem vínculo legado de Área."
                    )
            importadas["checklist"] += 1
        except Exception as e:
            importadas["erros"].append(f"Checklist '{c.get('titulo', '?')}': {e}")

    if vinculos_legados:
        db.flush()
        for rotina, area in vinculos_legados:
            db.execute(legado.update().where(
                legado.c.id == rotina.id, legado.c.user_id == user_id
            ).values(area=area))

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

    for m in marcos_raw:
        try:
            titulo = (m.get("titulo") or "").strip()
            data_marco = (m.get("data") or "").strip()
            if not titulo or not validar_data_iso(data_marco):
                continue
            novo_marco = MarcoOperacional(
                user_id=user_id,
                titulo=titulo,
                data=data_marco,
                categoria=normalizar_categoria_marco(m.get("categoria") or "Outro"),
                severidade=normalizar_severidade_marco(m.get("severidade") or "Baixa"),
                descricao=(m.get("descricao") or "").strip(),
                ativo=True,
            )
            db.add(novo_marco)
            importadas["marcos_operacionais"] += 1
        except Exception as e:
            importadas["erros"].append(f"Marco '{m.get('titulo', '?')}': {e}")

    restaurar_metas(db, user_id, dados.get("metas", []), importadas)
    restaurar_habitos(db, user_id, dados.get("habitos", []), importadas)
    restaurar_datas_especiais(db, user_id, dados.get("datas_especiais", []), importadas)
    db.commit()
    return {
        "ok": True,
        "importadas": importadas,
        "mensagem": f"Restauração concluída: {importadas['tarefas']} tarefas, {importadas['checklist']} rotinas, {importadas['notas']} notas e {importadas['marcos_operacionais']} marcos importados. Metas restauradas: {importadas['metas']}. Hábitos restaurados: {importadas['habitos']}. Datas especiais restauradas: {importadas['datas_especiais']}.",
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
        print(f"[PUSH] Erro ao enviar uma notificação: {type(e).__name__}")


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
    except Exception:
        raise HTTPException(status_code=500, detail="Erro ao salvar inscrição.") from None


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
    except Exception:
        raise HTTPException(status_code=500, detail="Não foi possível remover a inscrição.") from None


@app.get("/push/status")
async def push_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        total = db.query(PushSubscription).filter(PushSubscription.user_id == current_user.id, PushSubscription.ativo == True).count()
    except Exception:
        return {
            "vapid_configurado": bool(VAPID_PRIVATE_KEY),
            "assinantes": -1,
            "erro_tabela": "Não foi possível consultar as inscrições.",
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
            print(f"[PUSH LOOP] Erro: {type(e).__name__}")

        time_module.sleep(60)


@app.on_event("startup")
def iniciar_thread_push():
    global _push_thread_started
    if _push_thread_started:
        return
    _push_thread_started = True
    thread = threading.Thread(target=_loop_notificacoes_push, daemon=True)
    thread.start()
    thread_migracao = threading.Thread(target=migrar_series_agenda_existentes, daemon=True)
    thread_migracao.start()
    print("[PUSH] Thread de notificações iniciada.")


# ============================================================
# RODAR LOCALMENTE
# ============================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 5000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
