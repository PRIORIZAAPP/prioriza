from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi import FastAPI, Request, Depends, Form
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base, Session

from passlib.context import CryptContext
from jose import JWTError, jwt

from datetime import datetime, timedelta
from pydantic import BaseModel
import os

# --------------------------------
# CONFIG GERAL
# --------------------------------

SECRET_KEY = "supersecretkey"  # depois a gente troca isso
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

DB_URL = "sqlite:///./prioriza.db"

engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()

pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

# o front armazena token em localStorage e manda Authorization: Bearer xxx
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

app = FastAPI(title="PRIORIZA API")


# --------------------------------
# MODELOS DE BANCO
# --------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)


class Tarefa(Base):
    __tablename__ = "tarefas"

    id = Column(Integer, primary_key=True, index=True)
    owner_email = Column(String, index=True)  # para separar por usuário

    titulo = Column(String, nullable=False)
    origem = Column(String, default="")
    data = Column(String, nullable=False)         # ISO yyyy-mm-dd
    hora_inicio = Column(String, default="08:00") # "HH:MM"
    duracao_min = Column(Integer, default=60)
    prioridade = Column(Integer, default=2)       # 1, 2, 3

    status = Column(String, default="pendente")
    ativo = Column(Boolean, default=True)


class ChecklistItem(Base):
    __tablename__ = "checklist"

    id = Column(Integer, primary_key=True, index=True)
    owner_email = Column(String, index=True)

    titulo = Column(String, nullable=False)
    origem = Column(String, default="")
    frequencia = Column(String, default="Semanal")          # rótulo exibido
    frequencia_interna = Column(String, default="SEMANAL")  # pra lógica
    status = Column(String, default="pendente")
    ativo = Column(Boolean, default=True)


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    owner_email = Column(String, index=True)

    texto = Column(String, nullable=False)
    data = Column(String, default="")              # opcional
    tipo = Column(String, default="GERAL")
    status = Column(String, default="pendente")
    ativo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)


# --------------------------------
# SCHEMAS Pydantic
# --------------------------------

class LoginPayload(BaseModel):
    email: str
    password: str


# --------------------------------
# UTILS
# --------------------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def authenticate_user(db: Session, email: str, password: str):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str | None = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user


# --------------------------------
# CRIA USUÁRIO PADRÃO
# --------------------------------

@app.on_event("startup")
def create_default_user():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "admin@prioriza.app").first()
        if not user:
            new_user = User(
                email="admin@prioriza.app",
                hashed_password=get_password_hash("123456")
            )
            db.add(new_user)
            db.commit()
    finally:
        db.close()


# --------------------------------
# ROTAS DE AUTENTICAÇÃO
# --------------------------------

@app.post("/auth/login")
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    """
    Login em JSON, do jeito que o front está chamando:
    POST /auth/login  { "email": "...", "password": "..." }
    """
    user = authenticate_user(db, payload.email.strip().lower(), payload.password)
    if not user:
        raise HTTPException(status_code=400, detail="Email ou senha incorretos")

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/me")
def read_me(current_user: User = Depends(get_current_user)):
    return {"email": current_user.email}


# --------------------------------
# ROTAS: TAREFAS (AGENDA)
# --------------------------------

def tarefa_to_dict(t: Tarefa) -> dict:
    return {
        "id": t.id,
        "titulo": t.titulo,
        "origem": t.origem,
        "data": t.data,
        "hora_inicio": t.hora_inicio,
        "duracao_min": t.duracao_min,
        "prioridade": t.prioridade,
        "status": t.status,
        "ativo": t.ativo,
    }


@app.get("/tarefas")
def listar_tarefas(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    tarefas = (
        db.query(Tarefa)
        .filter(Tarefa.owner_email == user.email)
        .order_by(Tarefa.data, Tarefa.hora_inicio)
        .all()
    )
    return [tarefa_to_dict(t) for t in tarefas]


@app.post("/tarefas")
def criar_tarefa(
    titulo: str = Query(...),
    data: str = Query(...),
    hora_inicio: str = Query("08:00"),
    duracao_min: int = Query(60),
    prioridade: int = Query(2),
    origem: str = Query(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    nova = Tarefa(
        owner_email=user.email,
        titulo=titulo,
        data=data,
        hora_inicio=hora_inicio,
        duracao_min=duracao_min,
        prioridade=prioridade,
        origem=origem,
        status="pendente",
        ativo=True,
    )
    db.add(nova)
    db.commit()
    db.refresh(nova)
    return tarefa_to_dict(nova)


@app.post("/tarefas_excluir")
def excluir_tarefa(
    tarefa_id: int = Query(..., alias="tarefa_id"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    tarefa = (
        db.query(Tarefa)
        .filter(Tarefa.id == tarefa_id, Tarefa.owner_email == user.email)
        .first()
    )
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    tarefa.ativo = False
    db.commit()
    return {"ok": True}


# --------------------------------
# ROTAS: CHECKLIST
# --------------------------------

def checklist_to_dict(c: ChecklistItem) -> dict:
    return {
        "id": c.id,
        "titulo": c.titulo,
        "origem": c.origem,
        "frequencia": c.frequencia,
        "frequencia_interna": c.frequencia_interna,
        "status": c.status,
        "ativo": c.ativo,
    }


@app.get("/checklist")
def listar_checklist(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    itens = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.owner_email == user.email)
        .order_by(ChecklistItem.titulo)
        .all()
    )
    return [checklist_to_dict(i) for i in itens]


@app.post("/checklist_criar")
def criar_checklist_item(
    titulo: str = Query(...),
    origem: str = Query(""),
    frequencia: str = Query("Semanal"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    freq_interna = frequencia.strip().upper()
    novo = ChecklistItem(
        owner_email=user.email,
        titulo=titulo,
        origem=origem,
        frequencia=frequencia,
        frequencia_interna=freq_interna,
        status="pendente",
        ativo=True,
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return checklist_to_dict(novo)


@app.post("/checklist_status")
def atualizar_status_checklist(
    item_id: int = Query(..., alias="item_id"),
    status_item: str = Query(..., alias="status"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    item = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.id == item_id, ChecklistItem.owner_email == user.email)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")

    item.status = status_item
    db.commit()
    return {"ok": True}


@app.post("/checklist_excluir")
def excluir_checklist_item(
    item_id: int = Query(..., alias="item_id"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    item = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.id == item_id, ChecklistItem.owner_email == user.email)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")

    item.ativo = False
    db.commit()
    return {"ok": True}


# --------------------------------
# ROTAS: NOTES
# --------------------------------

def note_to_dict(n: Note) -> dict:
    return {
        "id": n.id,
        "texto": n.texto,
        "data": n.data,
        "tipo": n.tipo,
        "status": n.status,
        "ativo": n.ativo,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@app.get("/notes")
def listar_notes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    notas = (
        db.query(Note)
        .filter(Note.owner_email == user.email)
        .order_by(Note.created_at)
        .all()
    )
    return [note_to_dict(n) for n in notas]

from datetime import date, datetime
from fastapi import Form

@app.post("/notes")
def criar_note(
        texto: str = Form(...),
        tipo: str = Form("Nota"),
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ):
        nova_note = Note(
            owner_email=current_user.email,
            texto=texto,
            tipo=tipo,
            status="ativo",
            ativo=True,
            data=date.today(),
            created_at=datetime.utcnow(),
        )

        db.add(nova_note)
        db.commit()
        db.refresh(nova_note)

        # depois de salvar, volta pra tela do bloco de notas
        return RedirectResponse(url="/notes", status_code=303)


@app.post("/notes_status")
def atualizar_status_note(
    note_id: int = Query(..., alias="note_id"),
    status_note: str = Query(..., alias="status"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    nota = (
        db.query(Note)
        .filter(Note.id == note_id, Note.owner_email == user.email)
        .first()
    )
    if not nota:
        raise HTTPException(status_code=404, detail="Nota não encontrada")

    nota.status = status_note
    db.commit()
    return {"ok": True}


@app.post("/notes_delete")
def excluir_note(
    note_id: int = Query(..., alias="note_id"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    nota = (
        db.query(Note)
        .filter(Note.id == note_id, Note.owner_email == user.email)
        .first()
    )
    if not nota:
        raise HTTPException(status_code=404, detail="Nota não encontrada")

    nota.ativo = False
    db.commit()
    return {"ok": True}


# --------------------------------
# FRONTEND / STATIC
# --------------------------------

# arquivos estáticos (logo etc.)
app.mount("/static", StaticFiles(directory="."), name="static")


@app.get("/app")
def serve_app():
    # serve o index.html
    return FileResponse("index.html")


@app.get("/")
def root():
    return {"message": "PRIORIZA API ONLINE"}