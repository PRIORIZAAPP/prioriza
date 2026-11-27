# PRIORIZA · Sprint 078

## Sessões e Google Agenda

Base `1ce0071` (Sprint 077). Branch `sprint-078/sessoes-google`. Validação em ambientes isolados e com dados sintéticos.

## Diagnóstico e arquitetura

O logout anterior removia o token do navegador, mas o servidor continuava aceitando a credencial até sua expiração. A conexão com o Google incluía o token do PRIORIZA na URL. As credenciais do Google também podiam permanecer legíveis no banco após a desconexão.

- Cadastro e login geram um JWT com identificador único e sessão persistida. Cada chamada autenticada exige o cabeçalho Bearer e uma sessão vigente da mesma conta no banco. O logout revoga apenas a sessão atual. A redefinição de senha e a exclusão da conta encerram todas as sessões. A troca de senha encerra as anteriores e emite uma substituta para o dispositivo atual.
- A separação criptográfica da assinatura torna os JWTs anteriores incompatíveis com a Sprint 078. Após a atualização, todos precisam entrar uma vez. As sessões novas sobrevivem à recarga e à reinicialização da aplicação.
- O Bearer permanece no armazenamento local para preservar o fluxo atual. A API autenticada não usa cookie de sessão, reduzindo o risco de CSRF por envio automático de credenciais. Um XSS na mesma origem ainda poderia ler o Bearer. O logout confirma a revogação no servidor antes de encerrar no navegador. Em caso de falha de rede, o usuário recebe um aviso e pode tentar novamente.
- O OAuth começa com POST autenticado. O estado aleatório dura dez minutos, é consumido uma vez, fica vinculado à conta e à sessão ativas e exige o cookie temporário do navegador de origem. O cookie usa HttpOnly, SameSite=Lax e Secure em produção. A troca do código usa PKCE S256 com o Google e destinos definidos pelo servidor. Os escopos existentes foram preservados.
- As URLs de recuperação e OAuth usam apenas suas credenciais temporárias específicas. As rotas de autenticação respondem com no-store e no-referrer. O filtro de acesso da aplicação oculta parâmetros das URLs nos logs. A cobertura de infraestrutura externa deve ser conferida separadamente.
- Access token, refresh token e segredo de cliente persistidos são protegidos com Fernet e vinculados à conta e ao campo. A inicialização converte credenciais legadas, incluindo registros inativos, em uma única transação. A renovação usa as credenciais no servidor e não sobrescreve uma conexão alterada durante a chamada externa.
- A desconexão remove credenciais e autorizações pendentes no servidor antes de solicitar revogação ao Google. Uma falha externa é informada na interface e não restaura a conexão local. A reconexão é permitida. Compromissos do PRIORIZA são preservados e o fluxo não exclui eventos do calendário externo. A revogação pode afetar outras autorizações do mesmo aplicativo no Google. Operações externas já iniciadas podem terminar.

## Banco e configuração

A inicialização cria `auth_sessoes` e `google_autorizacoes`, com índices e referências à conta e à sessão. As colunas existentes das credenciais são mantidas. No PostgreSQL, a criação de esquema e a conversão das credenciais usam bloqueios transacionais, com espera limitada. Uma falha na conversão impede a inicialização da aplicação. Nenhuma tabela ou coluna existente é removida. O backup v2.5 permanece compatível e não inclui sessões nem credenciais.

`GOOGLE_CREDENTIALS_KEY` é uma chave Fernet independente, codificada em Base64 URL-safe, de 32 bytes. É necessária se o Google estiver configurado em produção ou se houver credenciais persistidas que precisam ser migradas ou lidas. Uma chave ausente, inválida ou incompatível nessa condição impede a inicialização. Gere-a em uma máquina confiável com o comando abaixo. Armazene em um gerenciador de segredos e no ambiente do serviço, com cópia de recuperação protegida, separada do backup do banco. Mantenha a mesma chave em todas as instâncias e reinicializações. Rotação exige recriptografia coordenada usando as duas chaves, validação isolada e planejamento de recuperação. A chave não deve ser simplesmente substituída no ambiente.

```sh
python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

## Arquivos modificados

- `main.py` — sessões, revogação, rotas de autenticação e OAuth, proteção de credenciais e inicialização.
- `index.html`, `sw.js` — versionamento dos scripts e cache `prioriza-public-v101`.
- `js/app.js`, `js/core/auth.js`, `js/core/runtime.js`, `js/screens/agenda.js` — conexão, logout, troca de senha e aviso de revogação externa.
- `pyproject.toml`, `requirements.txt`, `uv.lock` — declaração direta de `cryptography` na versão previamente resolvida.
- `tests/sessoes_google.py`, `tests/expiracao_credenciais.py` — cobertura dos novos fluxos e adaptação da regressão de credenciais com chave sintética.

## Evidências de validação

- **SQLite e PostgreSQL 18 reais e isolados.** A suíte de sessões verificou login, dispositivos independentes, logout, repetição de token revogado, expiração, rejeição de token na URL, isolamento, troca e redefinição de senha e exclusão de conta.
- **Migração em ambos os bancos.** Bancos preparados com a versão anterior e credenciais sintéticas ativas e inativas. Verificadas conversão, recusa de chave ausente, inválida ou incorreta, preservação da sessão válida ao reiniciar, revogação persistente e rejeição de JWT anterior à sprint.
- **Google simulado em ambos os bancos.** Verificados vínculo com sessão e navegador, proteção por estado e PKCE, rejeição de repetição, conexão, renovação, revogação confirmada e falha de comunicação, desconexão local, preservação dos compromissos e reconexão. As credenciais não apareceram nas respostas de status ou no backup.
- **Regressões.** Suítes de backup e restauração v2.5, formatos legados, falha transacional, isolamento, eliminação de conta, expiração de credenciais, Metas, Hábitos e Datas especiais aprovadas em SQLite e PostgreSQL 18. Suíte de configuração da Sprint 076 aprovada com PostgreSQL isolado na simulação de produção. Calendário civil da Evolução, sintaxe JavaScript e `git diff --check` aprovados.
- **Navegador.** Chromium a 390 px confirmou login, persistência após recarga, logout e rejeição do token anterior pela API. O service worker ativou v101, eliminou v100 e a amostra de respostas autenticadas não apareceu no Cache Storage.

A validação usou dados sintéticos. O Google real, o Render, o PWA instalado em dispositivo físico e o banco de produção não foram exercitados. As regressões não cobriram visualmente todas as telas e resoluções.

## Publicação e rollback

1. Conferir backup recuperável, disponibilidade da chave separada por instância, configurações de autenticação da Sprint 076 e permissões do papel PostgreSQL. Ele precisa conectar, acessar o esquema esperado, criar tabelas e índices, referenciar as tabelas indicadas nas chaves estrangeiras e ler/atualizar as credenciais existentes, além das permissões normais de execução. Conferir antes do deploy, sem divulgar valores.
2. Planejar a troca de versão sem escritores concorrentes da versão anterior no banco. A versão anterior pode gravar credenciais em texto puro durante a transição. Ativar a versão nova apenas após validar a inicialização e `/health`. Se houver falha de banco ou chave, preservar o banco e recuperar a chave/configuração original. Verificar arquivos versionados, v101, novo login e fluxos de conexão com conta controlada.
3. Após a migração, rollback exige um artefato já validado que mantenha a mesma criptografia, chave, verificação de sessões e rejeição de JWTs legados. Se esse artefato não existir, aplicar correção à frente com o banco e a chave preservados. O retorno direto à Sprint 077 é inseguro: ela não entende as credenciais criptografadas e volta a aceitar JWTs antigos. Uma restauração integral de snapshot também pode perder gravações posteriores e recuperar credenciais em texto puro.

A revisão e aprovação do PR antecedem qualquer integração ou publicação.
