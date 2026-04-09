import os
import json
import threading
from pathlib import Path
from datetime import datetime, date, timezone, timedelta
from typing import Optional

from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    Query,
    Form,
    Request,
)
from fastapi.responses import FileResponse, RedirectResponse
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleAuthRequest
from googleapiclient.discovery import build
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Text,
    text,
)
from sqlalchemy.orm import sessionmaker, declarative_base, Session


# ============================================================
# CONFIG GERAL
# ============================================================

# Diretório base do projeto (onde está o main.py)
BASE_DIR = Path(__file__).resolve().parent

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

# Se não foi definida nenhuma variável, usa SQLite local
if not DATABASE_URL:
    DATABASE_URL = f"sqlite:///{BASE_DIR / 'prioriza.db'}"
    print(f"[DB] ⚠️  DATABASE_URL não definida — usando SQLite local: {DATABASE_URL}")
else:
    print(f"[DB] ✅ DATABASE_URL encontrada: {DATABASE_URL[:40]}...")

# Render costuma fornecer postgres://, mas o SQLAlchemy espera postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    print("[DB] URL corrigida de postgres:// para postgresql://")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

try:
    engine = create_engine(DATABASE_URL, connect_args=connect_args)
    print(f"[DB] Engine criado com sucesso.")
except Exception as _e:
    print(f"[DB] ❌ Erro ao criar engine: {_e}")
    raise
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

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="lax",
    https_only=True,
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

class Tarefa(Base):
    __tablename__ = "tarefas"

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String, nullable=False)
    descricao = Column(String, default="")      # campo de observações/descrição
    origem = Column(String, default="")
    data = Column(String, nullable=False)       # YYYY-MM-DD
    hora_inicio = Column(String, default="")    # HH:MM
    duracao_min = Column(Integer, default=30)
    prioridade = Column(Integer, default=2)
    status = Column(String, default="pendente")
    ativo = Column(Boolean, default=True)
    criado_em = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "titulo": self.titulo,
            "descricao": self.descricao or "",
            "origem": self.origem,
            "data": self.data,
            "hora_inicio": self.hora_inicio,
            "duracao_min": self.duracao_min,
            "prioridade": self.prioridade,
            "status": self.status,
            "ativo": self.ativo,
            "criado_em": self.criado_em.isoformat() if self.criado_em else None,
        }


class ChecklistItem(Base):
    __tablename__ = "checklist"

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String, nullable=False)
    origem = Column(String, default="")
    frequencia = Column(String, default="Semanal")
    frequencia_interna = Column(String, default="SEMANAL")
    status = Column(String, default="pendente")
    ativo = Column(Boolean, default=True)
    ultimo_exec = Column(DateTime, nullable=True)
    criado_em = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self, incluir_pode_hoje: bool = False):
        d = {
            "id": self.id,
            "titulo": self.titulo,
            "origem": self.origem,
            "frequencia": self.frequencia,
            "frequencia_interna": self.frequencia_interna,
            "status": self.status,
            "ativo": self.ativo,
            "ultimo_exec": self.ultimo_exec.isoformat() if self.ultimo_exec else None,
            "criado_em": self.criado_em.isoformat() if self.criado_em else None,
        }
        if incluir_pode_hoje:
            d["pode_mostrar_hoje"] = calcular_pode_mostrar_hoje(self)
            d["proxima_execucao"] = calcular_proxima_execucao(self)
            d["dias_para_proxima"] = calcular_dias_para_proxima(self)
        return d


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    texto = Column(String, nullable=False)
    data = Column(String, default="")
    tipo = Column(String, default="GERAL")
    status = Column(String, default="pendente")
    ativo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

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
    """Armazena a inscrição push de cada dispositivo"""
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    ativo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "endpoint": self.endpoint,
            "ativo": self.ativo,
        }


class GoogleCalendarToken(Base):
    __tablename__ = "google_calendar_tokens"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, default="google", nullable=False)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=True)
    token_uri = Column(String, default="https://oauth2.googleapis.com/token")
    client_id = Column(Text, nullable=False)
    client_secret = Column(Text, nullable=False)
    scopes = Column(Text, default="")
    expiry = Column(DateTime, nullable=True)
    ativo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
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


# ============================================================
# DB
# ============================================================

def init_db():
    try:
        Base.metadata.create_all(bind=engine)
        print("[DB] ✅ Tabelas criadas/verificadas com sucesso.")
    except Exception as e:
        print(f"[DB] ❌ Erro no init_db: {e}")
        raise


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


init_db()

# Migração automática: adiciona colunas novas sem apagar dados existentes
_migracoes = [
    "ALTER TABLE tarefas ADD COLUMN descricao VARCHAR DEFAULT ''",
]
for _sql in _migracoes:
    try:
        with engine.connect() as conn:
            conn.execute(text(_sql))
            conn.commit()
    except Exception:
        pass  # coluna já existe, tudo certo

# Migração especial: força recriação da tabela push_subscriptions
# (necessário porque a estrutura antiga tinha coluna 'keys_json' que não existe mais)
try:
    with engine.connect() as conn:
        # Apaga a tabela antiga completamente
        conn.execute(text("DROP TABLE IF EXISTS push_subscriptions CASCADE"))
        conn.commit()
        print("[MIGRAÇÃO] Tabela push_subscriptions antiga removida.")
except Exception as e:
    print(f"[MIGRAÇÃO] Aviso ao remover push_subscriptions: {e}")

# Recria a tabela com a estrutura correta
try:
    PushSubscription.__table__.create(bind=engine, checkfirst=True)
    print("[MIGRAÇÃO] Tabela push_subscriptions recriada com sucesso (endpoint, p256dh, auth, ativo, created_at).")
except Exception as e:
    print(f"[MIGRAÇÃO] Erro ao criar push_subscriptions: {e}")


# ============================================================
# HELPERS
# ============================================================

def validar_data_iso(data_str: str) -> bool:
    try:
        datetime.strptime(data_str.strip(), "%Y-%m-%d")
        return True
    except ValueError:
        return False


def normalizar_frequencia_interna(freq: str) -> str:
    if not freq:
        return "SEMANAL"

    f = freq.strip().lower()

    if "único" in f or "unico" in f or "pontual" in f or "esporádico" in f or "esporadico" in f:
        return "UNICO"
    if "dia" in f:
        return "DIARIA"
    if "semana" in f:
        return "SEMANAL"
    if "bimes" in f:
        return "BIMESTRAL"
    if "trimes" in f:
        return "TRIMESTRAL"
    if "semes" in f:
        return "SEMESTRAL"
    if "ano" in f:
        return "ANUAL"
    if "mes" in f:
        return "MENSAL"

    return "SEMANAL"


def _intervalo_dias(freq_interna: str) -> int:
    mapa = {
        "DIARIA": 1,
        "SEMANAL": 7,
        "MENSAL": 30,
        "BIMESTRAL": 60,
        "TRIMESTRAL": 90,
        "SEMESTRAL": 180,
        "ANUAL": 365,
        "UNICO": 999999,
    }
    return mapa.get((freq_interna or "SEMANAL").upper(), 7)


def calcular_pode_mostrar_hoje(item: ChecklistItem) -> bool:
    if not item.ativo:
        return False

    if (item.frequencia_interna or "").upper() == "UNICO":
        return item.ultimo_exec is None and item.status != "feito"

    hoje = date.today()

    if item.ultimo_exec is None:
        return True

    ultimo = item.ultimo_exec.date()
    if hoje <= ultimo:
        return False

    delta = (hoje - ultimo).days
    return delta >= _intervalo_dias(item.frequencia_interna)


def calcular_proxima_execucao(item: ChecklistItem) -> str | None:
    from datetime import timedelta

    if (item.frequencia_interna or "").upper() == "UNICO":
        return None if item.ultimo_exec else date.today().isoformat()

    if item.ultimo_exec is None:
        return date.today().isoformat()

    proxima = item.ultimo_exec.date() + timedelta(days=_intervalo_dias(item.frequencia_interna))
    return proxima.isoformat()


def calcular_dias_para_proxima(item: ChecklistItem) -> int:
    if (item.frequencia_interna or "").upper() == "UNICO":
        return 0

    proxima_str = calcular_proxima_execucao(item)
    if not proxima_str:
        return 0

    proxima = date.fromisoformat(proxima_str)
    return (proxima - date.today()).days


def google_configurado() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI)


def salvar_google_credentials(db: Session, credentials: Credentials):
    token_row = db.query(GoogleCalendarToken).filter(GoogleCalendarToken.provider == "google").first()

    scopes_str = ",".join(credentials.scopes or GOOGLE_SCOPES)
    expiry = credentials.expiry
    if expiry and expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)

    if not token_row:
        token_row = GoogleCalendarToken(
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
        token_row.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(token_row)
    return token_row


def get_google_credentials(db: Session) -> Credentials:
    token_row = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.provider == "google",
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
        salvar_google_credentials(db, credentials)
        return credentials

    return credentials


def google_service(db: Session):
    credentials = get_google_credentials(db)
    return build("calendar", "v3", credentials=credentials)


# ============================================================
# STATIC / FRONT
# ============================================================

if not os.path.exists("static"):
    os.makedirs("static")

# Pasta static (cria se não existir)
_static_dir = BASE_DIR / "static"
_static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")


@app.get("/favicon.ico")
def favicon():
    p = BASE_DIR / "favicon.ico"
    return FileResponse(str(p)) if p.exists() else FileResponse(str(BASE_DIR / "ícone-48x48.png")) if (BASE_DIR / "ícone-48x48.png").exists() else __import__('fastapi').Response(status_code=404)


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
    # Tenta o nome padrão primeiro, depois o nome em português
    for nome in [f"icon-{filename}", f"ícone-{filename}"]:
        p = BASE_DIR / nome
        if p.exists():
            return FileResponse(str(p))
    from fastapi import Response
    return Response(status_code=404)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/debug")
def debug_info(db: Session = Depends(get_db)):
    """Diagnóstico completo — banco, tabelas e variáveis de ambiente."""
    info = {
        "database_url_tipo": "postgresql" if DATABASE_URL.startswith("postgresql") else "sqlite",
        "database_url_prefixo": DATABASE_URL[:50] + "..." if len(DATABASE_URL) > 50 else DATABASE_URL,
        "base_dir": str(BASE_DIR),
        "env_vars": {
            "DATABASE_URL": "✅ definida" if os.environ.get("DATABASE_URL") else "❌ NÃO definida (usando SQLite local)",
            "VAPID_PRIVATE_KEY": "✅ definida" if os.environ.get("VAPID_PRIVATE_KEY") else "❌ não definida",
            "GOOGLE_CLIENT_ID": "✅ definida" if os.environ.get("GOOGLE_CLIENT_ID") else "❌ não definida",
        },
        "tabelas": {},
        "erro": None,
    }
    try:
        info["tabelas"]["tarefas"] = db.query(Tarefa).count()
        info["tabelas"]["checklist"] = db.query(ChecklistItem).count()
        info["tabelas"]["notas"] = db.query(Note).count()
        info["tabelas"]["push_subscriptions"] = db.query(PushSubscription).count()
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
# GOOGLE AGENDA
# ============================================================

@app.get("/google/status")
def google_status(db: Session = Depends(get_db)):
    token_row = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.provider == "google",
        GoogleCalendarToken.ativo == True,
    ).first()

    return {
        "configurado": google_configurado(),
        "conectado": token_row is not None,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "token": token_row.to_dict() if token_row else None,
    }


@app.get("/auth/google")
def auth_google(request: Request):
    if not google_configurado():
        raise HTTPException(
            status_code=500,
            detail=(
                "Google não configurado. Defina GOOGLE_CLIENT_ID, "
                "GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI nas variáveis de ambiente."
            ),
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

    return RedirectResponse(auth_url)


@app.get("/auth/google/callback")
def auth_google_callback(
    request: Request,
    db: Session = Depends(get_db),
):
    if not google_configurado():
        raise HTTPException(
            status_code=500,
            detail=(
                "Google não configurado. Defina GOOGLE_CLIENT_ID, "
                "GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI nas variáveis de ambiente."
            ),
        )

    error = request.query_params.get("error")
    if error:
        raise HTTPException(status_code=400, detail=f"Falha na autorização Google: {error}")

    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Código de autorização não recebido.")

    saved_state = request.session.get("google_oauth_state")
    saved_code_verifier = request.session.get("google_code_verifier")
    returned_state = request.query_params.get("state")

    if not saved_state or not saved_code_verifier:
        raise HTTPException(
            status_code=400,
            detail="Sessão OAuth do Google não encontrada. Tente conectar novamente."
        )

    if returned_state != saved_state:
        raise HTTPException(
            status_code=400,
            detail="State OAuth inválido. Tente conectar novamente."
        )

    try:
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

        credentials = flow.credentials
        salvar_google_credentials(db, credentials)

        request.session.pop("google_oauth_state", None)
        request.session.pop("google_code_verifier", None)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao concluir login Google: {str(e)}")

    return RedirectResponse(url="/app?google=conectado")


@app.get("/google/calendar/events")
def listar_eventos_google(
    date_from: str = Query(None, description="Data inicial YYYY-MM-DD"),
    date_to: str = Query(None, description="Data final YYYY-MM-DD"),
    max_results: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    service = google_service(db)

    if date_from and not validar_data_iso(date_from):
        raise HTTPException(status_code=400, detail="date_from inválida. Use YYYY-MM-DD.")
    if date_to and not validar_data_iso(date_to):
        raise HTTPException(status_code=400, detail="date_to inválida. Use YYYY-MM-DD.")

    if date_from:
        time_min = f"{date_from}T00:00:00Z"
    else:
        time_min = datetime.now(timezone.utc).isoformat()

    time_max = f"{date_to}T23:59:59Z" if date_to else None

    eventos = service.events().list(
        calendarId="primary",
        timeMin=time_min,
        timeMax=time_max,
        maxResults=max_results,
        singleEvents=True,
        orderBy="startTime",
    ).execute()

    items = []
    for event in eventos.get("items", []):
        inicio = (event.get("start") or {}).get("dateTime") or (event.get("start") or {}).get("date")
        fim = (event.get("end") or {}).get("dateTime") or (event.get("end") or {}).get("date")
        items.append(
            {
                "id": event.get("id"),
                "titulo": event.get("summary") or "(Sem título)",
                "descricao": event.get("description") or "",
                "local": event.get("location") or "",
                "inicio": inicio,
                "fim": fim,
                "status": event.get("status"),
                "link": event.get("htmlLink"),
                "origem": "google_calendar",
            }
        )

    return items


@app.post("/google/calendar/events")
def criar_evento_google(
    titulo: str = Query(...),
    data: str = Query(..., description="YYYY-MM-DD"),
    hora_inicio: str = Query(..., description="HH:MM"),
    hora_fim: str = Query(..., description="HH:MM"),
    descricao: str = Query(""),
    local: str = Query(""),
    db: Session = Depends(get_db),
):
    if not validar_data_iso(data):
        raise HTTPException(status_code=400, detail="Data inválida. Use YYYY-MM-DD.")

    try:
        inicio_dt = datetime.fromisoformat(f"{data}T{hora_inicio}:00")
        fim_dt = datetime.fromisoformat(f"{data}T{hora_fim}:00")
    except ValueError:
        raise HTTPException(status_code=400, detail="Hora inválida. Use HH:MM.")

    if fim_dt <= inicio_dt:
        raise HTTPException(status_code=400, detail="Hora final deve ser maior que a inicial.")

    service = google_service(db)

    evento = {
        "summary": titulo.strip(),
        "description": (descricao or "").strip(),
        "location": (local or "").strip(),
        "start": {
            "dateTime": inicio_dt.isoformat(),
            "timeZone": "America/Sao_Paulo",
        },
        "end": {
            "dateTime": fim_dt.isoformat(),
            "timeZone": "America/Sao_Paulo",
        },
    }

    criado = service.events().insert(calendarId="primary", body=evento).execute()

    return {
        "ok": True,
        "evento_id": criado.get("id"),
        "link": criado.get("htmlLink"),
        "titulo": criado.get("summary"),
        "inicio": (criado.get("start") or {}).get("dateTime"),
        "fim": (criado.get("end") or {}).get("dateTime"),
    }


@app.post("/google/disconnect")
def desconectar_google(db: Session = Depends(get_db)):
    token_row = db.query(GoogleCalendarToken).filter(GoogleCalendarToken.provider == "google").first()
    if not token_row:
        return {"ok": True, "mensagem": "Google já estava desconectado."}

    token_row.ativo = False
    token_row.updated_at = datetime.now(timezone.utc)
    db.commit()

    request_message = {"ok": True, "mensagem": "Google Agenda desconectado com sucesso."}
    return request_message


# ============================================================
# RESUMO
# ============================================================

@app.get("/resumo")
def resumo(
    data_ref: str = Query(None, description="Data de referência YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    hoje = data_ref.strip() if data_ref and validar_data_iso(data_ref) else date.today().isoformat()

    tarefas_hoje = db.query(Tarefa).filter(
        Tarefa.ativo == True,
        Tarefa.data == hoje,
    ).all()

    total_hoje = len(tarefas_hoje)
    feitas_hoje = sum(1 for t in tarefas_hoje if t.status in ("feito", "concluida", "concluído"))
    andamento_hoje = sum(1 for t in tarefas_hoje if t.status == "em_andamento")
    pendentes_hoje = sum(1 for t in tarefas_hoje if t.status == "pendente")

    checklist_itens = db.query(ChecklistItem).filter(ChecklistItem.ativo == True).all()
    chk_disponiveis = sum(1 for i in checklist_itens if calcular_pode_mostrar_hoje(i))
    chk_feitos = sum(1 for i in checklist_itens if calcular_pode_mostrar_hoje(i) and i.status == "feito")

    notas_pendentes = db.query(Note).filter(
        Note.ativo == True,
        Note.status == "pendente",
    ).count()

    return {
        "tarefas_hoje": total_hoje,
        "feitas_hoje": feitas_hoje,
        "andamento_hoje": andamento_hoje,
        "pendentes_hoje": pendentes_hoje,
        "chk_disponiveis": chk_disponiveis,
        "chk_feitos": chk_feitos,
        "notas_pendentes": notas_pendentes,
    }


# ============================================================
# TAREFAS
# ============================================================

@app.get("/tarefas")
def listar_tarefas(db: Session = Depends(get_db)):
    tarefas = (
        db.query(Tarefa)
        .filter(Tarefa.ativo == True)
        .order_by(Tarefa.data, Tarefa.hora_inicio)
        .all()
    )
    return [t.to_dict() for t in tarefas]


@app.get("/agenda/hoje")
def tarefas_hoje(db: Session = Depends(get_db)):
    hoje = date.today().isoformat()
    tarefas = (
        db.query(Tarefa)
        .filter(Tarefa.ativo == True, Tarefa.data == hoje)
        .order_by(Tarefa.hora_inicio)
        .all()
    )
    return [t.to_dict() for t in tarefas]


@app.post("/tarefas")
async def criar_tarefa(
    request: Request,
    db: Session = Depends(get_db),
):
    q = request.query_params

    titulo = q.get("titulo")
    descricao = q.get("descricao")
    origem = q.get("origem")
    data_str = q.get("data")
    hora_inicio = q.get("hora_inicio")
    duracao_min = q.get("duracao_min")
    prioridade = q.get("prioridade")

    if not titulo:
        try:
            form = await request.form()
            titulo = form.get("titulo")
            descricao = form.get("descricao")
            origem = form.get("origem")
            data_str = form.get("data")
            hora_inicio = form.get("hora_inicio")
            duracao_min = form.get("duracao_min")
            prioridade = form.get("prioridade")
        except Exception:
            pass

    if not titulo or not data_str:
        raise HTTPException(status_code=400, detail="É obrigatório informar pelo menos título e data.")

    data_str = data_str.strip()
    if not validar_data_iso(data_str):
        raise HTTPException(status_code=400, detail="Formato de data inválido. Use YYYY-MM-DD.")

    origem = (origem or "").strip()
    hora_inicio = (hora_inicio or "").strip()

    try:
        duracao_val = int(duracao_min) if duracao_min else 60
    except ValueError:
        duracao_val = 60

    try:
        prioridade_val = int(prioridade) if prioridade else 2
        if prioridade_val not in (1, 2, 3):
            prioridade_val = 2
    except ValueError:
        prioridade_val = 2

    tarefa = Tarefa(
        titulo=titulo.strip(),
        descricao=(descricao or "").strip(),
        origem=origem,
        data=data_str,
        hora_inicio=hora_inicio,
        duracao_min=duracao_val,
        prioridade=prioridade_val,
        status="pendente",
        ativo=True,
    )
    db.add(tarefa)
    db.commit()
    db.refresh(tarefa)
    return tarefa.to_dict()


@app.put("/tarefas/{tarefa_id}")
async def editar_tarefa(
    tarefa_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    tarefa = db.query(Tarefa).filter(Tarefa.id == tarefa_id, Tarefa.ativo == True).first()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")

    q = request.query_params

    try:
        form = await request.form()
    except Exception:
        form = {}

    def pegar(campo):
        return q.get(campo) or (form.get(campo) if hasattr(form, "get") else None)

    titulo = pegar("titulo")
    descricao = pegar("descricao")
    origem = pegar("origem")
    data_str = pegar("data")
    hora_inicio = pegar("hora_inicio")
    duracao_min = pegar("duracao_min")
    prioridade = pegar("prioridade")
    status = pegar("status")

    if titulo:
        tarefa.titulo = titulo.strip()
    if descricao is not None:
        tarefa.descricao = descricao.strip()
    if origem is not None:
        tarefa.origem = origem.strip()
    if data_str:
        data_str = data_str.strip()
        if not validar_data_iso(data_str):
            raise HTTPException(status_code=400, detail="Formato de data inválido. Use YYYY-MM-DD.")
        tarefa.data = data_str
    if hora_inicio is not None:
        tarefa.hora_inicio = hora_inicio.strip()
    if duracao_min:
        try:
            tarefa.duracao_min = int(duracao_min)
        except ValueError:
            pass
    if prioridade:
        try:
            p = int(prioridade)
            tarefa.prioridade = p if p in (1, 2, 3) else 2
        except ValueError:
            pass
    if status:
        tarefa.status = status.strip().lower()

    db.commit()
    db.refresh(tarefa)
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
    db: Session = Depends(get_db)
):
    tarefa = db.query(Tarefa).filter(Tarefa.id == tarefa_id).first()

    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    tarefa.titulo = titulo
    tarefa.origem = origem
    tarefa.data = data
    tarefa.hora_inicio = hora_inicio
    tarefa.duracao_min = duracao_min
    tarefa.prioridade = prioridade

    db.commit()
    db.refresh(tarefa)

    return {"ok": True, "mensagem": "Tarefa atualizada com sucesso"}


@app.post("/tarefas_excluir")
def excluir_tarefa(
    tarefa_id: int = Query(..., alias="tarefa_id"),
    db: Session = Depends(get_db),
):
    tarefa = db.query(Tarefa).filter(Tarefa.id == tarefa_id).first()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    tarefa.ativo = False
    db.commit()
    return {"ok": True}


# ============================================================
# CHECKLIST
# ============================================================

@app.get("/checklist")
def listar_checklist(db: Session = Depends(get_db)):
    itens = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.ativo == True)
        .order_by(ChecklistItem.criado_em)
        .all()
    )
    return [i.to_dict(incluir_pode_hoje=True) for i in itens]


@app.post("/checklist_criar")
def criar_checklist_item(
    titulo: str = Query(...),
    origem: str = Query(""),
    frequencia: str = Query("Semanal"),
    db: Session = Depends(get_db),
):
    titulo = titulo.strip()
    origem = (origem or "").strip()
    freq = (frequencia or "Semanal").strip()
    freq_interna = normalizar_frequencia_interna(freq)

    item = ChecklistItem(
        titulo=titulo,
        origem=origem,
        frequencia=freq,
        frequencia_interna=freq_interna,
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
):
    item = db.query(ChecklistItem).filter(ChecklistItem.id == item_id, ChecklistItem.ativo == True).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado.")

    if titulo is not None:
        item.titulo = titulo.strip()
    if origem is not None:
        item.origem = origem.strip()
    if frequencia is not None:
        freq = frequencia.strip()
        item.frequencia = freq
        item.frequencia_interna = normalizar_frequencia_interna(freq)

    db.commit()
    db.refresh(item)
    return item.to_dict(incluir_pode_hoje=True)


@app.post("/checklist_status")
def alterar_status_checklist(
    item_id: int = Query(...),
    status: str = Query(...),
    db: Session = Depends(get_db),
):
    item = db.query(ChecklistItem).filter(ChecklistItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado.")

    novo_status = (status or "").strip().lower()
    if novo_status not in ("pendente", "em_andamento", "feito"):
        novo_status = "pendente"

    item.status = novo_status

    if novo_status == "feito":
        item.ultimo_exec = datetime.now(timezone.utc)

    db.commit()
    db.refresh(item)
    return item.to_dict(incluir_pode_hoje=True)


@app.post("/checklist_reset")
def resetar_status_checklist(
    item_id: int = Query(...),
    db: Session = Depends(get_db),
):
    item = db.query(ChecklistItem).filter(ChecklistItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado.")

    item.status = "pendente"
    db.commit()
    db.refresh(item)
    return item.to_dict(incluir_pode_hoje=True)


@app.post("/checklist_excluir")
def excluir_checklist_item(
    item_id: int = Query(...),
    db: Session = Depends(get_db),
):
    item = db.query(ChecklistItem).filter(ChecklistItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado.")
    item.ativo = False
    db.commit()
    return {"ok": True}


# ============================================================
# NOTAS
# ============================================================

@app.get("/notes")
def listar_notas(db: Session = Depends(get_db)):
    notas = (
        db.query(Note)
        .filter(Note.ativo == True)
        .order_by(Note.created_at)
        .all()
    )
    return [n.to_dict() for n in notas]


@app.post("/notes")
def criar_nota(
    texto: str = Form(...),
    data: str = Form(""),
    tipo: str = Form("GERAL"),
    db: Session = Depends(get_db),
):
    texto = texto.strip()
    tipo = (tipo or "GERAL").strip().upper()
    data_str = (data or "").strip()

    if data_str and not validar_data_iso(data_str):
        raise HTTPException(status_code=400, detail="Formato de data inválido. Use YYYY-MM-DD.")

    nota = Note(
        texto=texto,
        data=data_str,
        tipo=tipo,
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
):
    nota = db.query(Note).filter(Note.id == note_id, Note.ativo == True).first()
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
def alterar_status_nota(
    note_id: int = Query(...),
    status: str = Query(...),
    db: Session = Depends(get_db),
):
    nota = db.query(Note).filter(Note.id == note_id).first()
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
def excluir_nota(
    note_id: int = Query(...),
    db: Session = Depends(get_db),
):
    nota = db.query(Note).filter(Note.id == note_id).first()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota não encontrada.")

    nota.ativo = False
    db.commit()
    return {"ok": True}


# ============================================================
# BACKUP E RESTAURAÇÃO
# ============================================================

@app.get("/backup")
def exportar_backup(db: Session = Depends(get_db)):
    """Exporta todos os dados do usuário em JSON para backup."""
    tarefas = db.query(Tarefa).filter(Tarefa.ativo == True).all()
    checklist = db.query(ChecklistItem).filter(ChecklistItem.ativo == True).all()
    notas = db.query(Note).filter(Note.ativo == True).all()

    return {
        "versao": "1.0",
        "exportado_em": datetime.now(timezone.utc).isoformat(),
        "tarefas": [t.to_dict() for t in tarefas],
        "checklist": [c.to_dict() for c in checklist],
        "notas": [n.to_dict() for n in notas],
    }


@app.post("/restaurar")
async def importar_backup(request: Request, db: Session = Depends(get_db)):
    """Importa dados de um backup JSON. Não apaga dados existentes - apenas adiciona os novos."""
    try:
        dados = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido.")

    versao = dados.get("versao", "1.0")
    tarefas_raw = dados.get("tarefas", [])
    checklist_raw = dados.get("checklist", [])
    notas_raw = dados.get("notas", [])

    importadas = {"tarefas": 0, "checklist": 0, "notas": 0, "erros": []}

    # ── Tarefas ──
    for t in tarefas_raw:
        try:
            titulo = (t.get("titulo") or "").strip()
            data_str = (t.get("data") or "").strip()
            if not titulo or not data_str or not validar_data_iso(data_str):
                continue
            nova = Tarefa(
                titulo=titulo,
                descricao=(t.get("descricao") or "").strip(),
                origem=(t.get("origem") or "").strip(),
                data=data_str,
                hora_inicio=(t.get("hora_inicio") or "").strip(),
                duracao_min=int(t.get("duracao_min") or 60),
                prioridade=int(t.get("prioridade") or 2),
                status=t.get("status") or "pendente",
                ativo=True,
            )
            db.add(nova)
            importadas["tarefas"] += 1
        except Exception as e:
            importadas["erros"].append(f"Tarefa '{t.get('titulo','?')}': {e}")

    # ── Checklist ──
    for c in checklist_raw:
        try:
            titulo = (c.get("titulo") or "").strip()
            if not titulo:
                continue
            novo = ChecklistItem(
                titulo=titulo,
                origem=(c.get("origem") or "").strip(),
                frequencia=c.get("frequencia") or "Semanal",
                frequencia_interna=c.get("frequencia_interna") or "SEMANAL",
                status=c.get("status") or "pendente",
                ativo=True,
            )
            db.add(novo)
            importadas["checklist"] += 1
        except Exception as e:
            importadas["erros"].append(f"Checklist '{c.get('titulo','?')}': {e}")

    # ── Notas ──
    for n in notas_raw:
        try:
            texto = (n.get("texto") or "").strip()
            if not texto:
                continue
            nova_nota = Note(
                texto=texto,
                data=n.get("data") or "",
                tipo=n.get("tipo") or "GERAL",
                status=n.get("status") or "pendente",
                ativo=True,
            )
            db.add(nova_nota)
            importadas["notas"] += 1
        except Exception as e:
            importadas["erros"].append(f"Nota '{n.get('texto','?')[:30]}': {e}")

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
VAPID_PUBLIC_KEY  = os.environ.get("VAPID_PUBLIC_KEY", "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBkYIRPqbb5ZfElDa1Ew")
VAPID_CLAIMS      = {"sub": "mailto:contato@prioriza.onrender.com"}


def _enviar_push(sub: PushSubscription, titulo: str, corpo: str, url: str = "/app"):
    """Envia uma notificação push para um dispositivo inscrito."""
    try:
        from pywebpush import webpush, WebPushException
        dados = json.dumps({"titulo": titulo, "corpo": corpo, "url": url, "icone": "/icon-180x180.png"})
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


def _enviar_push_todos(titulo: str, corpo: str, url: str = "/app"):
    """Envia push para todos os dispositivos inscritos."""
    if not VAPID_PRIVATE_KEY:
        return
    db = SessionLocal()
    try:
        subs = db.query(PushSubscription).filter(PushSubscription.ativo == True).all()
        for sub in subs:
            _enviar_push(sub, titulo, corpo, url)
    finally:
        db.close()


@app.post("/push/subscribe")
async def push_subscribe(request: Request, db: Session = Depends(get_db)):
    """Recebe a inscrição push do navegador e salva no banco."""
    try:
        dados = await request.json()
        endpoint = dados.get("endpoint", "")
        keys = dados.get("keys", {})
        p256dh = keys.get("p256dh", "")
        auth = keys.get("auth", "")

        print(f"[PUSH] Tentando inscrever: endpoint={endpoint[:50]}... p256dh={bool(p256dh)} auth={bool(auth)}")

        if not endpoint or not p256dh or not auth:
            raise HTTPException(status_code=400, detail="Dados de inscrição inválidos.")

        sub = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).first()
        if sub:
            print(f"[PUSH] Atualizando inscrição existente id={sub.id}")
            sub.p256dh = p256dh
            sub.auth = auth
            sub.ativo = True
        else:
            print(f"[PUSH] Criando nova inscrição")
            sub = PushSubscription(endpoint=endpoint, p256dh=p256dh, auth=auth, ativo=True)
            db.add(sub)

        db.commit()
        db.refresh(sub)
        print(f"[PUSH] ✅ Inscrição salva com sucesso! id={sub.id}")
        return {"ok": True, "id": sub.id}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[PUSH] ❌ Erro ao salvar inscrição: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro ao salvar inscrição: {str(e)}")


@app.delete("/push/subscribe")
async def push_unsubscribe(request: Request, db: Session = Depends(get_db)):
    """Remove inscrição push de um dispositivo."""
    try:
        dados = await request.json()
        endpoint = dados.get("endpoint", "")
        sub = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).first()
        if sub:
            sub.ativo = False
            db.commit()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/push/status")
async def push_status(db: Session = Depends(get_db)):
    """Retorna o status do sistema de push notifications."""
    try:
        total = db.query(PushSubscription).filter(PushSubscription.ativo == True).count()
    except Exception as e:
        # Tabela ainda não tem todas as colunas — retorna info parcial
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
async def push_teste(db: Session = Depends(get_db)):
    """Dispara uma notificação de teste para todos os dispositivos inscritos."""
    if not VAPID_PRIVATE_KEY:
        raise HTTPException(status_code=503, detail="VAPID_PRIVATE_KEY não configurada no servidor.")
    subs = db.query(PushSubscription).filter(PushSubscription.ativo == True).all()
    if not subs:
        raise HTTPException(status_code=404, detail="Nenhum dispositivo inscrito. Abra o app primeiro.")
    for sub in subs:
        _enviar_push(sub, "🧪 Teste PRIORIZA", "Push funcionando com app fechado! 🎉", "/app")
    return {"ok": True, "enviado_para": len(subs)}


@app.get("/push/limpar")
async def push_limpar(db: Session = Depends(get_db)):
    """Remove TODAS as inscrições push antigas (útil quando as chaves VAPID mudam)."""
    count = db.query(PushSubscription).count()
    db.query(PushSubscription).delete()
    db.commit()
    return {"ok": True, "removidas": count, "mensagem": "Todas as inscrições foram removidas. Recarregue o app para criar nova inscrição."}


# ── Agendador de notificações push ───────────────────────────
FERIADOS_BR = [
    (1, 1, "Ano Novo"), (21, 4, "Tiradentes"), (1, 5, "Dia do Trabalho"),
    (7, 9, "Independência"), (12, 10, "N.S. Aparecida"), (2, 11, "Finados"),
    (15, 11, "Proclamação da República"), (20, 11, "Consciência Negra"), (25, 12, "Natal"),
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


def _loop_notificacoes_push():
    """Roda a cada minuto e dispara notificações push conforme o horário."""
    import time
    while True:
        try:
            agora = datetime.now()
            hora  = agora.hour
            minuto = agora.minute
            dia_semana = agora.weekday()  # 0=segunda, 4=sexta

            db = SessionLocal()
            try:
                hoje_iso = date.today().isoformat()
                tarefas_hoje = db.query(Tarefa).filter(
                    Tarefa.ativo == True, Tarefa.data == hoje_iso
                ).order_by(Tarefa.hora_inicio).all()

                amanha_iso = (date.today() + timedelta(days=1)).isoformat()
                tarefas_amanha = db.query(Tarefa).filter(
                    Tarefa.ativo == True, Tarefa.data == amanha_iso
                ).all()

                checklist = db.query(ChecklistItem).filter(ChecklistItem.ativo == True).all()
                chk_hoje = [i for i in checklist if calcular_pode_mostrar_hoje(i)]

                # ── Compromissos próximos (a cada minuto) ──
                minutos_agora = hora * 60 + minuto
                for t in tarefas_hoje:
                    if not t.hora_inicio or t.status == "feito":
                        continue
                    try:
                        h, m = map(int, t.hora_inicio.split(":"))
                        diff = (h * 60 + m) - minutos_agora
                        origem = f" · {t.origem}" if t.origem else ""
                        if diff == 15:
                            _enviar_push_todos("🔔 Em 15 minutos", f"{t.titulo}{origem} começa às {t.hora_inicio}")
                        elif diff == 5:
                            _enviar_push_todos("⏰ Em 5 minutos", f"{t.titulo}{origem} começa às {t.hora_inicio}")
                        elif diff == 0:
                            _enviar_push_todos("🚨 Agora!", f"{t.titulo}{origem} está começando!")
                        elif diff == 60:
                            _enviar_push_todos("📅 Em 1 hora", f"{t.titulo}{origem} às {t.hora_inicio}")
                    except Exception:
                        pass

                # ── Bom dia às 6h ──
                if hora == 6 and minuto == 0:
                    total = len(tarefas_hoje)
                    chk_total = len(chk_hoje)
                    alta_prio = [t for t in tarefas_hoje if t.prioridade == 1]
                    if total == 0 and chk_total == 0:
                        _enviar_push_todos("☀️ Bom dia!", "Agenda livre hoje. Aproveite ou adiante algo!")
                    elif alta_prio:
                        _enviar_push_todos("☀️ Bom dia! Dia importante", f"{len(alta_prio)} tarefa(s) de alta prioridade hoje. Primeira: {alta_prio[0].titulo}")
                    else:
                        _enviar_push_todos("☀️ Bom dia!", f"Hoje: {total} compromisso(s) e {chk_total} rotina(s) no checklist.")

                # ── Alta prioridade às 9h ──
                if hora == 9 and minuto == 0:
                    alta = [t for t in tarefas_hoje if t.prioridade == 1 and t.status != "feito"]
                    if alta:
                        _enviar_push_todos("🔴 Tarefa prioritária", f'"{alta[0].titulo}" é alta prioridade. Não deixe passar!' if len(alta) == 1 else f"{len(alta)} tarefas de alta prioridade hoje!")

                # ── Checklist às 11h ──
                if hora == 11 and minuto == 0:
                    pendentes = [i for i in chk_hoje if i.status == "pendente"]
                    feitos = [i for i in chk_hoje if i.status == "feito"]
                    if pendentes and not feitos:
                        _enviar_push_todos("📋 Checklist do dia", f"Você ainda não iniciou nenhuma rotina. {len(pendentes)} pendente(s).")
                    elif pendentes:
                        _enviar_push_todos("📋 Checklist em andamento", f"{len(feitos)} feita(s), faltam {len(pendentes)}.")

                # ── Fim do dia às 20h ──
                if hora == 20 and minuto == 0:
                    feitas = len([t for t in tarefas_hoje if t.status == "feito"])
                    pendentes_count = len([t for t in tarefas_hoje if t.status == "pendente"])
                    total = len(tarefas_hoje)
                    amanha_count = len(tarefas_amanha)
                    if total == 0:
                        _enviar_push_todos("🌙 Encerrando o dia", "Nenhum compromisso hoje. Descanse bem!")
                    elif feitas == total:
                        _enviar_push_todos("🌙 Parabéns! ✅", f"Todas as {total} tarefa(s) concluídas hoje. Excelente!")
                    else:
                        _enviar_push_todos("🌙 Fim do dia", f"{feitas}/{total} tarefas concluídas. {f'Amanhã: {amanha_count} compromisso(s).' if amanha_count else ''}")

                # ── Segunda-feira às 8h ──
                if dia_semana == 0 and hora == 8 and minuto == 0:
                    semana_total = db.query(Tarefa).filter(
                        Tarefa.ativo == True,
                        Tarefa.data >= hoje_iso,
                        Tarefa.data <= (date.today() + timedelta(days=4)).isoformat()
                    ).count()
                    _enviar_push_todos("💪 Semana começando!", f"Você tem {semana_total} compromisso(s) essa semana. Bora!")

                # ── Sexta-feira às 17h ──
                if dia_semana == 4 and hora == 17 and minuto == 0:
                    pendentes_sexta = [t for t in tarefas_hoje if t.status != "feito"]
                    if not pendentes_sexta:
                        _enviar_push_todos("🎉 Sexta-feira! Semana concluída", "Você zerou todas as tarefas. Bom descanso!")
                    else:
                        _enviar_push_todos("🏁 Sexta-feira! Reta final", f"Faltam {len(pendentes_sexta)} tarefa(s) para fechar a semana.")

                # ── Feriados ──
                if hora == 7 and minuto == 0:
                    feriado = _feriado_hoje_ou_amanha()
                    if feriado:
                        quando, nome = feriado
                        tarefas_feriado = tarefas_hoje if quando == "hoje" else tarefas_amanha
                        n = len(tarefas_feriado)
                        if quando == "hoje":
                            _enviar_push_todos(f"🎉 Hoje é feriado — {nome}!", f"{f'Você tem {n} tarefa(s) mesmo assim.' if n else 'Aproveite o dia de folga! 😊'}")
                        else:
                            _enviar_push_todos(f"📅 Feriado amanhã — {nome}", f"{f'Você tem {n} tarefa(s) no dia do feriado. Considere adiantar!' if n else 'Amanhã é folga. Adiantar tarefas hoje?'}")

            finally:
                db.close()

        except Exception as e:
            print(f"[PUSH LOOP] Erro: {e}")

        time.sleep(60)  # espera 1 minuto


# Inicia o loop em thread separada ao subir o servidor
_thread_push = threading.Thread(target=_loop_notificacoes_push, daemon=True)
_thread_push.start()


# ============================================================
# RODAR LOCALMENTE
# ============================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 5000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
