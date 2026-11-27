# PRIORIZA · Sprint 076 · Segurança e dependências

## Resumo executivo

Base `5f5a032`, com o PR #46. A instalação de referência da Sprint 075 reproduziu 40 avisos em 64 pacotes. A instalação final em Linux e Python 3.12.14 passou em `pip check` e `pip-audit`, com zero avisos conhecidos nas versões auditadas. A execução com produção simulada passou em PostgreSQL 18. O Render real não foi consultado.

A aplicação agora rejeita a configuração de produção quando os segredos obrigatórios estão ausentes, vazios ou usam um valor conhecido de desenvolvimento. No Render, `RENDER=true` ou a presença de `RENDER_SERVICE_ID` ativa essa verificação. Fora do Render, use `APP_ENV=production`. O modo local continua disponível.

**Parecer técnico.** Apto para revisão e homologação em ambiente isolado. A publicação depende de confirmar as variáveis obrigatórias e o comando de build. Se uma delas estiver ausente ou for insegura, o novo processo **não inicializa**. Nenhum segredo é gerado ou rotacionado pelo código de produção.

## Diagnóstico e comparação

Os manifestos anteriores divergiam. `requirements.txt` declarava FastAPI 0.115.5 e Multipart 0.0.12, enquanto `requirements`, as entradas Poetry e o lock da outra configuração descreviam ambientes diferentes. Starlette era transitiva na instalação base. Pip era a ferramenta instalada no ambiente, sem pin no projeto. Os números anteriores descrevem a instalação isolada, pois as versões efetivas do Render permanecem desconhecidas.

| Dependência | Antes local | Depois | Uso |
|---|---:|---:|---|
| FastAPI | 0.115.5 | 0.165.0 | Execução e compatibilidade com Starlette 1.x |
| Starlette | 0.41.3 | 1.10.0 | Execução, agora fixada explicitamente |
| Python Multipart | 0.0.12 | 0.0.34 | Execução, formulários e uploads |
| Pip | 25.0.1 | 26.3 | Instalação e build, em arquivo próprio |
| AnyIO | 4.16.0 | 4.16.0 | Transitiva. A versão vulnerável 4.12.1 herdada no primeiro lock foi rejeitada |
| IDNA | 3.20 | 3.20 | Transitiva. A versão vulnerável 3.11 herdada no primeiro lock foi rejeitada |
| Pydantic | 2.14.4 | 2.14.4 | Validação em execução |
| SQLAlchemy | 2.0.36 | 2.0.36 | Persistência |
| psycopg2-binary | 2.9.10 | 2.9.10 | Driver PostgreSQL |
| HTTPX | 0.28.1 | 0.28.1 | Testes com TestClient. Fora do export de execução |

A resolução acrescentou `annotated-doc` e consolidou as versões transitivas de `annotated-types`, `certifi`, `charset-normalizer`, `click` e `PyYAML` no lock. As versões diretas de Google Auth, Google API, Uvicorn e PyWebPush da instalação anterior foram preservadas.

| Auditoria | Pacotes | Resultados |
|---|---:|---:|
| Base local com ferramentas e testes | 64 | 40 linhas, 20 GHSA distintos |
| Primeira instalação limpa com ferramentas e testes | 65 | 4 linhas novas em AnyIO e IDNA, 3 GHSA distintos |
| Final limpa com dependências de execução e pip | 63 | 0 |
| Final com dependências de teste | 65 | 0 |

A lista por CVE/GHSA contém as faixas afetadas, versões corrigidas, gravidade e aplicabilidade. Os avisos incluem casos de indisponibilidade em formulários e arquivos estáticos, processamento condicional de host/TLS e riscos da cadeia de instalação. A eliminação dos avisos no ambiente auditado tem como limite a cobertura e a atualização da base consultada. [Anexo de avisos](sprint-076-avisos.md)

## Build reproduzível

`pyproject.toml` declara as dependências diretas em Python 3.12. `uv.lock` fixa a resolução, inclusive as ferramentas de teste. `requirements.txt` é o export de execução, com versões exatas, e `requirements` referencia o mesmo arquivo. `requirements-build.txt` fixa o instalador. O uso opcional de passlib no código foi preservado. A instalação de referência do Render via requirements não instalava passlib, embora o manifesto Poetry anterior o mencionasse. Se um serviço tiver histórico de build fora dessa referência com hashes bcrypt, conferir login legado em uma cópia isolada antes de trocar o ambiente.

Comando de build para conferência, a ser aplicado pelo responsável do Render somente após aprovação:

```sh
python -m pip install -r requirements-build.txt && python -m pip install -r requirements.txt && python -m pip check
```

Conferência do lock:

```sh
uv lock --check
uv export --locked --no-dev --no-emit-project --no-hashes -o requirements.txt
```

A versão instalada em produção deve ser verificada nos logs de build com `python --version` e `python -m pip --version`. Foi testado Python 3.12.14. O `runtime.txt` anterior ainda registra 3.12.0, e a versão efetiva depende da configuração do serviço. Verificar a seleção do interpretador antes da publicação. [Versões de Python no Render](https://render.com/docs/python-version)

## Configuração obrigatória no Render

No serviço correto, abra **Environment** e confira as chaves pelo nome, inclusive valores herdados de grupos de ambiente. Use o gerenciador de segredos autorizado para confirmar que cada entrada foi provisionada para aquele serviço. Evite colar valores, imprimir variáveis ou enviar capturas do conteúdo. Se houver dúvida sobre um valor antigo, valide com o administrador responsável e em ambiente isolado. [Variáveis no Render](https://render.com/docs/configure-environment-variables)

| Variável | Finalidade e verificação | Ausência ou substituição |
|---|---|---|
| `JWT_SECRET` | Assinatura dos tokens e confirmações da Agenda. Conferir a chave e a origem do segredo, distinto dos valores de desenvolvimento. | Ausente, vazio ou padrão conhecido impede o startup. A substituição invalida tokens e confirmações pendentes. |
| `SESSION_SECRET` | Assinatura do cookie da sessão de OAuth. O middleware está ativo no processo mesmo quando a integração não foi configurada. | Ausente, vazio ou padrão conhecido impede o startup. A substituição invalida cookies e OAuth em andamento. |
| `DATABASE_URL` | PostgreSQL do serviço. Conferir nome da chave, tipo do recurso e permissões da função sem copiar a URL. | Ausente ou inválida impede o startup. Alterar pode conectar ao banco errado ou exigir privilégios diferentes. |
| `APP_ENV` | Define o modo fora do Render. Use `production` nesses ambientes. O Render tem detecção automática. | Fora do Render, sem esse sinal, ficam disponíveis os padrões locais. A troca para produção ativa as validações. |

O teste de PostgreSQL simulou a ausência dos serviços opcionais. O servidor iniciou com `/health` disponível e as rotas protegidas mantiveram a autenticação.

### Variáveis por recurso

| Recurso | Chaves e condições | Efeito da ausência ou troca |
|---|---|---|
| Google Agenda | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` HTTPS público. Conferir os nomes e a correspondência do callback no cadastro vigente. | Sem o conjunto válido, novas conexões ficam indisponíveis. Troca de credencial pode exigir reconexão. |
| Recuperação por e-mail | `RESEND_API_KEY`, `EMAIL_FROM` e `APP_URL` HTTPS pública. Conferir entrada, domínio e origem do remetente. | O envio fica indisponível com chaves incompletas ou URL local/insegura em produção. Troca altera remetente, destino dos links ou autorização de envio. |
| Feedback | `FEEDBACK_TO` ou `ADMIN_EMAIL`, além de `RESEND_API_KEY` e `EMAIL_FROM`. | O envio depende dessas entradas. O texto e o e-mail do usuário não são mais registrados como fallback de log. |
| Administração | `ADMIN_EMAIL` para a função administrativa conforme comportamento existente. | Conferir a conta autorizada antes de trocar. |
| Push | `VAPID_PRIVATE_KEY` e `VAPID_PUBLIC_KEY` correspondente à chave provisionada. A pública tem fallback distribuído pelo aplicativo. | Sem a privada, push fica indisponível. Uma nova dupla de chaves pode exigir reinscrição. |
| Parâmetros | `JWT_EXP_HOURS`, `PASSWORD_RESET_EXP_MINUTES`, `AVATAR_MAX_BYTES` e `PORT` possuem padrões. | Ajustar muda limites ou janela de validade. `PORT` é usado pelo modo de execução direto. |

## Proteção de informações

Cookies de sessão são marcados como Secure em produção. As mensagens de startup identificam a variável ou a etapa afetada sem imprimir valores. O log de acesso do Uvicorn passou a omitir a query string. Logs de falhas de serviços, feedback, OAuth e push omitem corpos privados e identificadores. SQLAlchemy oculta parâmetros em mensagens de erro. Respostas de OAuth e push evitam repassar exceções brutas.

A revisão do histórico de arquivos de configuração encontrou um `.env` com configuração SQLite local sem usuário ou senha, removido do versionamento e incluído no ignore. A revisão de padrões no estado atual e dos arquivos de configuração versionados não confirmou segredo real. Isso não equivale a uma varredura completa de todos os commits do repositório, do proxy ou do provedor. Os valores reais e os logs do Render não foram consultados.

Foi identificado também um `prioriza.db` versionado com registros de conta, Agenda, Checklist e Notas. A inspeção foi somente por contagem, sem exportar conteúdo. A origem dos dados e eventual uso de credenciais reais precisam ser confirmados antes de ampliar o acesso ao repositório. O arquivo e o histórico foram preservados nesta sprint. Se houver confirmação de dados ou credenciais reais, restringir o acesso e aprovar procedimento de retirada do histórico e eventual revogação ou rotação antes de qualquer intervenção externa.

## Testes e regressão

- Instalação limpa, `pip check`, `uv lock --check` e auditoria repetida. A instalação final de execução e a de testes passaram.
- Produção simulada com PostgreSQL, rejeição de variáveis ausentes, valores de desenvolvimento e URL de banco inválida, SQLite local e testes de ocultação de informações. Um GET local confirmou que o Uvicorn registra a rota sem a query string.
- Registro, login, falha com senha inválida, expiração, proteção de rotas, isolamento, administração e exclusão de conta foram exercitados em SQLite e PostgreSQL 18. Redefinição por link de uso único e renovação de credencial do Google passaram, com provedores simulados.
- Suítes existentes de Metas, Hábitos, Datas especiais e expiração passaram nos dois bancos. CRUD da Agenda, Marcos, Notas e Checklist, conflitos concorrentes da Agenda e OAuth simulado também foram exercitados.
- Backup 2.4 e restauração em outra conta passaram nos dois bancos. Restauração repetida ainda duplica Agenda, Checklist, Notas e Marcos nos dois. Essa falha preexistente permanece fora do escopo.
- Chromium desktop a 1280 × 720, 1366 × 768, 1440 × 900 e 1920 × 1080. Chromium e WebKit mobile a 320, 390 e 430 px. Azul, Verde, Roxo e Grafite distribuídos na matriz. Foram exercitados Home, formulários, Evolução e persistência de preferência em Ajustes.
- PWA confirmou ativação de v100, invalidação de v99, retomada após desconexão e saída local. Os arquivos estáticos e o service worker são idênticos aos da base. O manifesto ainda não declara ícones, como registrado na Sprint 075.

Limitações. Sem acesso a produção, aparelhos físicos, entrega real de e-mail ou Google real. Não houve teste de ataque contra serviços. Permanecem abertas as mudanças de sessão, revogação, criptografia OAuth em repouso, instalação física do PWA e deduplicação.

## Publicação e rollback

1. Antes do deploy, confirme as chaves obrigatórias, o Python efetivo, o comando de build e a disponibilidade de um backup recuperável. Se algum segredo obrigatório estiver ausente, configure-o por um procedimento autorizado antes de promover a revisão.
2. No ambiente de homologação, confirme que `/health` retorna 200, valide cadastro, login, saída e rotas protegidas. Confira o cache v100 e teste recuperação e OAuth se o serviço oferece esses recursos.
3. Se o build falhar, verifique a versão real de Python, o primeiro erro de resolução ou instalação e o resultado de `pip check`. Se o startup falhar com `[CONFIG]`, confira a chave indicada sem imprimir seu valor. Para falha `[DB]`, confira rede, conexão e permissões na base de homologação.
4. Se a recuperação do serviço exigir rollback, selecione a última revisão saudável do Render ou reimplante o artefato anterior de `5f5a032`. Preserve o banco e as variáveis. Não restaure o banco como parte do rollback de código. A reversão também reintroduz o comportamento permissivo dos segredos e as versões anteriores. Limite a duração da reversão e repita os testes de saúde e login. [Rollbacks no Render](https://render.com/docs/rollbacks)

## Arquivos

`main.py`, `pyproject.toml`, `uv.lock`, `requirements.txt`, `requirements`, `requirements-build.txt`, `.gitignore`, remoção do `.env` versionado, `tests/configuracao_producao.py` e os dois documentos da Sprint.
