# PRIORIZA

**App web PWA de organização pessoal** com agenda, checklist, notas e notificações inteligentes.

🌐 **URL de produção**: https://prioriza.onrender.com/app

---

## ✨ Funcionalidades Implementadas

### 📅 Agenda & Compromissos
- ✅ Criar, editar e excluir tarefas
- ✅ Definir horário, duração, prioridade e local
- ✅ Campo de observação/descrição opcional
- ✅ Status: pendente → em andamento → feito
- ✅ Visualização por dia e por mês (calendário)
- ✅ Integração com Google Calendar (sincronização bidirecional)
- ✅ Desfazer exclusão (5 segundos após swipe)
- ✅ Botão de edição rápida

### 📋 Checklist (Rotinas Recorrentes)
- ✅ Criar rotinas com frequência (diária, semanal, mensal, única)
- ✅ Resetar automaticamente rotinas concluídas
- ✅ Swipe para marcar como feito ou em andamento
- ✅ Contador de rotinas pendentes

### 📝 Notas Pessoais
- ✅ Criar notas rápidas
- ✅ Tipo: pessoal ou trabalho
- ✅ Data opcional
- ✅ Swipe para marcar como feito ou excluir

### 🎤 Comandos de Voz
- ✅ "Salvar nota: [texto]"
- ✅ "Agendar: [título] amanhã às [hora]"
- ✅ "Adicionar tarefa: [título]"
- ✅ Reconhecimento de voz contínuo

### 🔔 Sistema de Notificações (20+ modelos)

#### **Com app aberto** (funciona em iOS e Android):
- ✅ **06h** — Bom dia com resumo do dia
- ✅ **08h (seg)** — Visão geral da semana
- ✅ **09h** — Alerta de tarefas prioritárias
- ✅ **11h** — Lembrete do checklist
- ✅ **1h antes** — Compromisso em 1 hora
- ✅ **15 min antes** — Compromisso em 15 minutos
- ✅ **5 min antes** — Compromisso em 5 minutos
- ✅ **Na hora** — Compromisso começando agora
- ✅ **17h (sex)** — Balanço da semana
- ✅ **20h** — Resumo do fim do dia
- ✅ **Feriados** — Alerta de feriados na semana

#### **Com app fechado** (apenas Android):
- ⚠️ Push notifications via Web Push API
- ⚠️ **Limitação no iOS**: notificações só funcionam com app aberto ou em segundo plano

---

## 🗄️ Estrutura de Dados

### Tabelas do Banco (PostgreSQL em produção, SQLite local)

**`tarefas`**
- id, titulo, origem, data, hora_inicio, duracao_min, prioridade, status, descricao, ativo, criado_em

**`checklist`**
- id, titulo, origem, frequencia, frequencia_interna, status, ativo, ultimo_exec

**`notes`**
- id, texto, data, tipo, status, ativo, created_at

**`push_subscriptions`**
- id, endpoint, p256dh, auth, ativo, created_at

**`google_calendar_tokens`**
- id, provider, access_token, refresh_token, token_uri, client_id, client_secret, scopes, expiry, ativo, created_at, updated_at

---

## 🚀 API Endpoints

### Tarefas
- `GET /tarefas` — Lista todas as tarefas
- `GET /agenda/hoje` — Tarefas do dia
- `POST /tarefas` — Criar nova tarefa
- `PUT /tarefas/{id}` — Editar tarefa
- `POST /tarefas_excluir` — Excluir (soft delete)

### Checklist
- `GET /checklist` — Lista itens do checklist
- `POST /checklist_criar` — Criar item
- `PUT /checklist/{id}` — Editar item
- `POST /checklist_status` — Alterar status
- `POST /checklist_reset` — Resetar item
- `POST /checklist_excluir` — Excluir item

### Notas
- `GET /notes` — Lista notas
- `POST /notes` — Criar nota
- `PUT /notes/{id}` — Editar nota
- `POST /notes_status` — Alterar status
- `POST /notes_delete` — Excluir nota

### Resumo
- `GET /resumo` — Resumo diário (tarefas, checklist, notas)

### Google Calendar
- `GET /google/status` — Status da integração
- `GET /auth/google` — Iniciar OAuth
- `GET /auth/google/callback` — Callback OAuth
- `POST /google/disconnect` — Desconectar
- `GET /google/calendar/events` — Listar eventos
- `POST /google/event` — Criar evento

### Push Notifications
- `GET /push/status` — Status do sistema push
- `POST /push/subscribe` — Inscrever dispositivo
- `DELETE /push/subscribe` — Desinscrever dispositivo
- `GET /push/teste` — Enviar notificação de teste
- `GET /push/limpar` — Limpar todas as inscrições

### Utilitários
- `GET /health` — Health check
- `GET /` → redireciona para `/app`
- `GET /app` — Serve o index.html

---

## 🛠️ Stack Tecnológico

**Backend**:
- Python 3.12
- FastAPI
- SQLAlchemy (ORM)
- PostgreSQL (produção) / SQLite (dev)
- pywebpush (Web Push API)
- google-auth, google-api-python-client (Google Calendar)

**Frontend**:
- HTML5, CSS3, JavaScript (Vanilla)
- PWA com Service Worker
- Web Speech API (comandos de voz)
- Web Push API (notificações)
- Responsive design (max-width 480px)

**Infraestrutura**:
- Hosting: Render.com
- Database: Render PostgreSQL
- Repositório: GitHub

---

## ⚙️ Variáveis de Ambiente (Render)

```bash
DATABASE_URL=postgresql://...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://prioriza.onrender.com/auth/google/callback
SESSION_SECRET=...
VAPID_PRIVATE_KEY=6bCGPZyVlKcNmXbEW1vYTqjhOAz3dPsRkIuFeMwHnQo
VAPID_PUBLIC_KEY=BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBkYIRPqbb5ZfElDa1Ew
PORT=10000
```

---

## 📱 Como Instalar o PWA

### iPhone (iOS 16.4+)
1. Abra https://prioriza.onrender.com/app no Safari
2. Toque no ícone de compartilhar
3. "Adicionar à Tela de Início"
4. Pronto! O PRIORIZA agora é um app

### Android
1. Abra https://prioriza.onrender.com/app no Chrome
2. Toque em "Adicionar à tela inicial" quando aparecer
3. Ou: Menu (⋮) → "Instalar app"

---

## 🐛 Limitações Conhecidas

### iOS Safari / PWA
- ❌ Push notifications **não funcionam** com app completamente fechado
- ⚠️ Push só funciona com app aberto ou em segundo plano
- ⚠️ Isso é uma **limitação da Apple**, não do código

### Android
- ✅ Push notifications funcionam **100%**, mesmo com app fechado

### Geral
- ⚠️ Feriados fixos apenas (não calcula feriados móveis como Páscoa/Carnaval)
- ⚠️ Google Calendar requer OAuth (precisa autorizar manualmente)

---

## 🔮 Próximas Melhorias Sugeridas

- [ ] Adicionar categorias/tags às tarefas
- [ ] Filtro avançado (por origem, prioridade, período)
- [ ] Gráficos de produtividade
- [ ] Modo dark
- [ ] Backup/export de dados (JSON, CSV)
- [ ] Sincronização entre dispositivos (multi-user)
- [ ] Widget de resumo na tela inicial
- [ ] Notificações por email (alternativa ao push)

---

## 📄 Licença

Projeto pessoal — código proprietário.

---

## 👤 Autor

Desenvolvido com ❤️ para organização pessoal e produtividade.

**Última atualização**: 08/04/2026
