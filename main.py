import os
from datetime import datetime, date, timezone

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
)
from sqlalchemy.orm import sessionmaker, declarative_base, Session


# ============================================================
# CONFIG GERAL
# ============================================================

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./prioriza.db")

# Render costuma fornecer postgres://, mas o SQLAlchemy espera postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

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
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


init_db()


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

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/favicon.ico")
def favicon():
    return FileResponse("favicon.ico")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return RedirectResponse(url="/app")


@app.get("/app")
def serve_app():
    return FileResponse("index.html")


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
    origem = q.get("origem")
    data_str = q.get("data")
    hora_inicio = q.get("hora_inicio")
    duracao_min = q.get("duracao_min")
    prioridade = q.get("prioridade")

    if not titulo:
        try:
            form = await request.form()
            titulo = form.get("titulo")
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
    origem = pegar("origem")
    data_str = pegar("data")
    hora_inicio = pegar("hora_inicio")
    duracao_min = pegar("duracao_min")
    prioridade = pegar("prioridade")
    status = pegar("status")

    if titulo:
        tarefa.titulo = titulo.strip()
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
# RODAR LOCALMENTE
# ============================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 5000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
