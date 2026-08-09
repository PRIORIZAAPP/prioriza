# SPRINT 043 — Relatório técnico

## 1. Resumo

Foi criada uma camada central de segurança e confiabilidade, sem alteração de regras de negócio, rotas funcionais, payloads ou banco. A entrega inclui escape HTML central, cancelamento e ordenação de leituras, timeout de rede, deduplicação disponível, proteção lógica contra duplo envio na autenticação, limpeza de sessão, logs seguros, captura global de erros, cabeçalhos HTTP e uma base PWA que armazena somente assets públicos.

O backup integral e imutável da Sprint 042 está em `../backup-sprint-043`.

## 2. Arquivos alterados ou criados

- `index.html`
- `main.py`
- `structure-manifest.json`
- `site.webmanifest` (novo)
- `sw.js` (novo)
- `js/app.js`
- `js/core/admin.js`
- `js/core/auth.js`
- `js/core/debug.js`
- `js/core/utils.js` (novo)
- `js/integrations/notifications.js`
- `js/screens/agenda.js`
- `js/screens/checklist.js`
- `js/screens/operation.js`
- `js/screens/workspace.js`

## 3. Auditoria de HTML dinâmico

- `innerHTML`: 141 antes e 141 depois. A contagem não foi reduzida artificialmente.
- `outerHTML`: 0; `document.write`: 0; `eval`: 0; `new Function`: 0.
- `insertAdjacentHTML`: 3, mantidos após revisão.
- Classificação: 122 usos de conteúdo fixo, limpeza ou estado controlado (Tipo A); 19 templates com interpolação, tratados por escape central ou valores fechados/controlados (Tipo B); nenhum Tipo C conhecido permaneceu.
- Chamadas de proteção encontradas: 58 entre o escape central e seus adaptadores legados.
- `textoSeguro` e `escaparTextoOperacao` passaram a delegar para `PriorizaUtils.escapeHTML`.
- Listas de Checklist e Notas passaram a montar itens em `DocumentFragment`.

Risco residual: o legado ainda possui grande quantidade de templates HTML. Novos componentes devem preferir `textContent` e criação explícita de elementos.

## 4. Armazenamento e autenticação

- Armazenamentos encontrados: 36 referências a `localStorage`; nenhuma a `sessionStorage` ou IndexedDB.
- Conteúdo legítimo: tema, onboarding, preferências, datas de exibição, locais frequentes e flags de notificação.
- Conteúdo privado: token `prioriza_auth_token` e cache local do avatar por usuário.
- O backend autentica por Bearer token e não oferece fluxo completo por cookie HttpOnly/CSRF. Por segurança, não foi feita migração parcial.
- Logout agora cancela leituras, remove token, usuário em memória, avatar local e flags/cache de notificações antes de recarregar.
- Token, payload de push e respostas administrativas não são registrados pelos novos logs.

Plano recomendado para cookie: login/logout/me por cookie `HttpOnly; Secure; SameSite=Lax`, CORS com origem explícita, `credentials: include`, estratégia CSRF e expiração/renovação testadas em conjunto.

## 5. Requisições

- `fetchWithTimeout`: timeout padrão de 20 segundos e mensagem segura.
- `fetchLatest`: `AbortController` e versão monotônica contra resposta fora de ordem.
- Aplicado a Hoje/Agenda, status e mês do Google Agenda, Checklist Hoje/Geral e Notas.
- `fetchDeduped` disponibilizado para leituras idênticas futuras.
- Cancelamento global executado no logout.
- Formulários de login, cadastro, recuperação e redefinição possuem trava lógica e botão desabilitado durante o envio. Os principais salvamentos de Agenda, Checklist e Workspace já possuíam bloqueio por botão.

## 6. DOM, listeners e memória

- Inventário: 250 `addEventListener`, 49 `setTimeout`, 3 `setInterval`, 2 `MutationObserver` e 2 `ResizeObserver`.
- A inicialização existente já possui flags de vínculo em áreas críticas; o novo tratamento global também é idempotente.
- Checklist Hoje/Geral e Notas usam inserção única via `DocumentFragment`.
- Não foram introduzidos novos intervalos ou observers.
- Pendência: o inicializador legado central permanece dentro de `operation.js`, impedindo um `destroy()` isolado e descarregamento seguro por tela sem uma refatoração estrutural adicional.

## 7. Carregamento

- Medição renderizada: 13 scripts, 6 folhas de estilo, 19 assets externos observáveis e 58 SVGs inline.
- Autenticação, navegação, Hoje, estado global e tratamento de sessão permanecem no carregamento inicial.
- As interfaces legadas de Finanças e Operação continuam ocultas e seus vinculadores retornam antes de carregar dados ou listeners quando `hidden`.
- Pendência importante: `finance.js` e `operation.js` ainda são transferidos. `operation.js` contém também o inicializador autenticado de toda a aplicação e referências lexicais compartilhadas; removê-los agora quebraria módulos aprovados. A separação física deve ser feita em sprint própria, com contrato explícito de módulos.

## 8. Imagens e assets

- Foram encontradas 7 imagens `data:image` no JavaScript de onboarding.
- Elas foram preservadas nesta entrega porque não havia os arquivos-fonte externos nem uma validação visual completa das áreas destacadas. Uma conversão automática arriscaria regressão no onboarding aprovado.
- Não houve redução de peso de imagens nesta etapa. Pendência: exportar cada imagem, comparar visualmente e então usar WebP/PNG dimensionado com `loading=lazy` quando não crítico.

## 9. PWA e cache

- Criados `site.webmanifest` e `sw.js`, antes referenciados mas ausentes.
- Cache versionado: `prioriza-public-v43`.
- Navegação/HTML: network first, com fallback para `/app`.
- Assets públicos listados: cache first.
- APIs privadas, autenticação, admin, Google, push, Finanças e Operação são explicitamente ignorados pelo Service Worker.
- Ativação remove caches antigos prefixados por `prioriza-`; nenhuma resposta privada é armazenada.
- Registro usa `updateViaCache: none`; a atualização não força recarga do formulário aberto.
- O manifesto omite ícones porque os arquivos de ícone referenciados ainda não existem no projeto recebido. Isso evita declarar assets inexistentes, mas os ícones instaláveis continuam pendentes.

## 10. Segurança

- Teste automatizado com `<img src=x onerror="1">&'` confirmou saída escapada; scripts não são interpretados pelo helper.
- `debug=1` e Eruda só funcionam em localhost/127.0.0.1/::1.
- Logs de push não incluem resposta bruta; a URL do banco não é mais impressa.
- `/debug` agora exige administrador e não expõe prefixo de banco, diretório interno, redirect URI ou exceção bruta.
- Cabeçalhos aplicados pelo backend: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e HSTS somente sob HTTPS.
- CSP não foi aplicada: o legado usa estilos inline, imagens data/blob e integrações Google/push que exigem teste completo em produção. Proposta inicial: `default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://apis.google.com; frame-src https://accounts.google.com; worker-src 'self' blob:`.
- Dependências externas observadas: Google APIs/OAuth, Resend no backend, Web Push/VAPID e Eruda apenas em desenvolvimento.

## 11. Métricas

| Métrica | Antes | Depois |
|---|---:|---:|
| HTML | 277.232 B | 277.287 B |
| CSS | 345.041 B | 345.041 B |
| JavaScript | 717.540 B | 725.005 B |
| Imagens base64 | 7 | 7 |
| Assets renderizados | não medido no baseline | 19 (13 JS + 6 CSS) |
| Erros de console no login | não medido no baseline | 0 |

O acréscimo de 7.465 B de JavaScript corresponde aos utilitários de segurança/rede. Tempo transferido e interatividade não foram inventados: a superfície local não forneceu Resource Timing. A redução estrutural de peso depende da separação dos módulos legados e da exportação das imagens.

## 12. Testes executados

- Sintaxe de todos os 13 arquivos JavaScript: aprovada.
- Compilação de `main.py`: aprovada.
- JSON do manifesto: aprovado.
- Escape XSS central: aprovado.
- Cancelamento e preservação da última leitura: aprovado.
- Renderização local desktop 1440×900: sem overflow horizontal e sem erros/warnings no console.
- Renderização local mobile 390×844: sem overflow horizontal e sem erros/warnings no console.
- Login visível e estilizado nos dois breakpoints.
- Inventário renderizado confirmou os assets carregados.

Não executados por falta de backend/contas/dados de teste isolados: troca real entre usuários, sessão 401 completa, Google OAuth, push real, listas com 100 registros, Fast/Slow 3G, instalação PWA com ícones e uso prolongado. Devem ser validados em staging antes da produção.

## 13. Pendências e riscos conhecidos

1. Migração do token para cookie depende de backend e estratégia CSRF completos.
2. Separar o inicializador global de `operation.js` e remover Finanças/Operação do carregamento inicial.
3. Exportar e validar visualmente as 7 imagens base64.
4. Fornecer ícones PWA 16, 32, 180, 192 e 512 px.
5. Validar CSP em modo Report-Only no ambiente hospedado.
6. Executar cenários autenticados, rede lenta, offline, volume e longa duração em staging.
7. Restringir `allow_origins=["*"]` após confirmar os domínios oficiais e o fluxo OAuth.

## 14. Confirmações finais

- Nenhuma regra de negócio, rota funcional, payload ou estrutura de dados foi alterada.
- Nenhuma funcionalidade foi excluída.
- Finanças e Operação permanecem em evolução e suas interfaces funcionais continuam desativadas.
- Nenhuma biblioteca externa foi adicionada.
- Nenhuma credencial foi criada ou exposta; nenhum token foi registrado em log.
- Nenhuma CSP não validada foi ativada.
- As pendências acima são explícitas; esta entrega não declara como testado o que o ambiente local não permitiu validar.
