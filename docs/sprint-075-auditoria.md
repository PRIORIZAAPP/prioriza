# PRIORIZA · Relatório de auditoria da Sprint 075

## Resumo executivo

A auditoria teve como base a `main` em `86a03a1`, com o PR #45 integrado. Foi executada em contas fictícias, SQLite temporário e PostgreSQL 18.7 isolado. O Google e o envio de e-mail foram simulados. Nenhum teste atingiu dados ou configurações de produção.

A Sprint padroniza o círculo em andamento e o cinza dos três pontinhos da Agenda. Os testes compararam dimensões, tipografia e truncamento dos títulos com a base. Duas correções técnicas tratam a expiração na recuperação de senha e a renovação do Google Agenda. O esquema do banco, o contrato das APIs e o backup v2.4 foram preservados.

## Parecer de prontidão

| Cenário | Parecer | Fundamentação |
|---|---|---|
| Uso pessoal cotidiano | **Apto com ressalvas** | Fluxos centrais exercitados e restauração única validada. Confirmar segredos próprios no ambiente, validar a recuperação e testar o iPhone. A restauração repetida amplia quatro listas. |
| Grupo controlado | **Apto com ressalvas** | Condicionado à triagem dos avisos de dependências e à verificação de segredos, recuperação, backup recuperável e OAuth, se habilitado. Acompanhar o piloto com contas autorizadas e evitar reimportar o mesmo arquivo. |
| Disponibilização comercial | **Não apto** | Resolver ou mitigar o risco das dependências, formalizar o ciclo de vida de sessão, proteger credenciais OAuth armazenadas, tratar reimportação, validar dispositivos físicos e confirmar a configuração necessária do Google para o público pretendido. |

## Cobertura e contagem

Unidade de contagem é o cenário ou suíte por ambiente. As assertivas internas e tentativas de diagnóstico foram agrupadas com o resultado final. Os itens pendentes são blocos planejados ainda sem execução suficiente.

| Grupo | Executados | Aprovados | Reprovados |
|---|---:|---:|---:|
| API e desempenho local, 11 cenários por banco | 22 | 20 | 2 |
| Suítes de Metas, Hábitos e Datas nos dois bancos, conflitos da Agenda nos dois bancos, três ambientes de expiração e calendário Node | 12 | 12 | 0 |
| Matriz navegador e viewport, comparação da Agenda, gravações e Home, virada operacional | 21 | 21 | 0 |
| PWA, microfone simulado e Ajustes | 9 | 8 | 1 |
| Backup cruzado, sincronização Google e OAuth simulados | 4 | 4 | 0 |
| Inicialização, indisponibilidade e medição de navegação | 6 | 6 | 0 |
| Auditoria de dependências | 1 | 0 | 1 |
| **Total** | **75** | **71** | **4** |

**12 blocos não executados ou incompletos.** (1) UI e seletores nativos em iPhone físico. (2) Instalação e atualização a partir de um PWA físico já instalado. (3) Voz com hardware, permissão do sistema e demais comandos falados. (4) Entrega real de e-mail de recuperação. (5) Login, renovação e revogação com conta Google real. (6) Cobertura completa de Ajustes, incluindo notificações e privacidade. (7) Contadores e estados vazios exaustivos de todos os módulos. (8) Falha de restauração durante a gravação e recuperação após interrupção. (9) Revisão exaustiva de XSS, SQL e CSRF. (10) Todas as opções de edição de séries, filtros e gestos dos módulos. (11) Carga simultânea, memória e latências sustentadas. (12) Homologação e observabilidade de produção.

### Matriz de interface e dados

- Chromium desktop em 1280 × 720, 1366 × 768, 1440 × 900 e 1920 × 1080.
- Chromium e WebKit mobile em 320, 390 e 430 px. O motor WebKit automatizado complementa a validação. A interação nativa no iPhone físico permanece pendente.
- Aparências Azul, Verde, Roxo e Grafite distribuídas pela matriz, sem produto cartesiano de todos os cenários.
- SQLite e PostgreSQL 18.7 isolados. As regressões de expiração também passaram em sessões PostgreSQL com `America/Sao_Paulo` e `UTC`.
- Comparação da Agenda antes/depois em Chromium 390 e 1440 e em WebKit 320. Dimensões dos indicadores e menus e propriedades de truncamento e tipografia dos títulos permaneceram iguais. O menu continuou acessível.

## Resultados por módulo

- **Conta e segurança.** Cadastro, login, credencial inválida, persistência, remoção local na saída, expiração, papel administrativo, bloqueio sem autenticação em nove rotas, isolamento amostral e exclusão definitiva passaram. O e-mail de recuperação foi simulado. O novo teste confirma alteração de senha e rejeição do token reutilizado. Revisão de armazenamento e sessões registrada abaixo.
- **Home.** A navegação e o acesso à Evolução foram exercitados. A ordem Pendentes, Em andamento e Concluídas, o atraso e a preservação da Agenda foram verificados com 6 e 24 rotinas e 2 e 18 compromissos. A virada automatizada em Brasília recarregou a lista do Checklist sem recarregar a página, com resposta da API controlada. A troca de visibilidade também foi exercitada para Datas especiais.
- **Agenda.** CRUD, Pesquisa de Marcos, eventos de dia inteiro, bloqueios integrais e parciais, limites adjacentes, travessia da meia-noite, conflitos, edição, séries e idempotência concorrente passaram nos cenários exercitados. A visualização diária apresentou o feriado nacional de Natal. As únicas mudanças visuais foram as autorizadas.
- **Google Agenda.** A simulação exerceu URL de autorização, PKCE, cancelamento, callback, status sem exposição dos tokens na resposta, desconexão local, renovação e importação repetida de uma ocorrência com atualização pelo ID. Datas civis e fuso foram conferidos. A suíte de conflitos inclui eventos Google com dados controlados.
- **Checklist.** Criação diária, semanal, mensal e única, edição de categoria, mudança de status, exclusão, isolamento e atualização na Home passaram nos cenários executados. A suíte de navegador cobriu a virada operacional com relógio simulado.
- **Notas.** CRUD, status, nota extensa com quebras, categoria legada, validação de data e isolamento passaram. Salvamento pelo formulário foi exercitado. A segunda restauração de um mesmo arquivo duplicou as notas.
- **Evolução.** Suítes de Metas, Hábitos e Datas passaram nos dois bancos. Exercitaram validações, concorrência, progresso decimal, histórico e isolamento. Conquistas deriva das metas concluídas. Navegação, acordeão, cadastro, edição, progresso e manutenção do painel após salvar foram exercitados em Chromium e WebKit. O contador civil de Datas especiais passou na virada do dia e em mês bissexto.
- **Ajustes, formulários e voz.** Alteração de aparência e persistência após recarga passaram. Os seis formulários foram conferidos quanto aos controles, dimensões, cor efetiva no WebKit, estado de gravação, cancelamento e persistência. Voz simulada confirmou navegador incompatível, início, parada, resposta à permissão negada e cadastro de uma nota após confirmação, com cancelamento prévio sem criar registro.
- **PWA.** O navegador ativou v100, eliminou um cache v99 existente, abriu a rota de entrada com conexão desligada e retomou a sessão ao reconectar no cenário amostrado. Cache Storage ficou sem dados privados das rotas amostradas. O manifesto responde com início em `/app`, mas não declara ícones. Instalação física permanece pendente.

## Falhas, causas e intervenção

| Gravidade e estado | Evidência e causa | Proposta e impacto |
|---|---|---|
| **Alto · corrigido · recuperação** | Pedir redefinição de uma conta fictícia e usar o link ainda válido retornava falha. Valores de expiração de uma coluna sem fuso eram comparados com uma data consciente de UTC na aplicação. | A comparação passou ao banco com a representação adequada a SQLite e PostgreSQL. A redefinição de uso único passou nos dois. Nenhuma alteração de esquema. |
| **Alto · corrigido · Google** | Carregar credencial fictícia vencida originalmente resultava em zero chamadas à renovação. A expiração persistida não era repassada ao SDK. | Leitura da expiração no fuso da sessão PostgreSQL e conversão para UTC no formato do SDK. A renovação simulada acontece uma vez e é reaproveitada. Proteção e revogação dos tokens requerem revisão separada. |
| **Alto · aberto · backup** | Depois de restaurar duas vezes o mesmo v2.4, Agenda passou de 1 a 2, Checklist de 3 a 6, Notas de 1 a 2 e Marcos de 1 a 2 em ambos os bancos. A importação dessas listas cria novos registros. | Aprovar um modelo de identidade e idempotência por origem antes de alterar a restauração. Deduplicar somente por título e data pode mesclar registros legítimos. |
| **Alto · aberto · dependências** | `pip-audit` no ambiente local avaliou 64 dependências e retornou 40 avisos, incluindo 14 em `starlette 0.41.3`, 14 em `python-multipart 0.0.12` e 12 no `pip 25.0.1` do ambiente de build. | Triar aplicabilidade, atualizar dependências compatíveis com FastAPI e repetir a matriz. A contagem de avisos não estabelece exploração nem confirma as versões efetivamente instaladas em produção. |
| **Alto condicional · revisão de segurança** | O código admite valores de desenvolvimento para segredos de autenticação e sessão quando a configuração está ausente. A configuração efetiva de produção não foi consultada. | Verificar presença de segredos próprios antes do piloto e planejar validação de configuração no startup. Uma rotação pode invalidar sessões. |
| **Médio · revisão de segurança** | A saída limpa o token no cliente. A rota de logout não mantém estado de revogação no servidor. O cliente armazena o token em `localStorage`, e fluxos legados aceitam token em URL. | Aprovar ciclo de vida de sessões e revisão de rotas que ainda precisam de token em URL, incluindo OAuth. Avaliar impacto em compatibilidade e armazenamento local. |
| **Médio · revisão de segurança · Google** | A linha de integração armazena credenciais textuais. Desconectar inativa a linha. A proteção externa do banco, revogação remota e retenção não foram verificadas. | Definir proteção de credenciais em repouso, política de retenção e revogação com os escopos já aprovados. Mudança de persistência requer revisão. |
| **Médio · aberto · PWA** | A inspeção do JSON do manifesto verificou ausência da chave `icons`. A instalação e a retomada no dispositivo não foram reproduzidas. | Validar os requisitos de instalação com os ícones homologados e verificar em iPhone e Android antes de ampliar o público. |
| **Baixo · corrigido · Agenda** | O indicador laranja divergia do padrão da Home e os três pontinhos divergiam no cinza em layouts da Agenda. | Estilos restritos ao módulo. Círculo preenchido com ponteiros brancos, sem contorno contrastante, e cinza `#64748b` para os pontos. |

A revisão defensiva amostral observou filtros de titularidade e parâmetros do ORM nos fluxos testados. O teste de Cache Storage não evidenciou conteúdo privado das rotas amostradas. Não houve acesso a tokens reais nem testes invasivos contra produção.

## Banco e backup

Passaram inicializações concorrentes e reinício em SQLite e PostgreSQL novos e com dados legados. Foram conferidos registros legados sem alteração, exclusão da conta com remoção das linhas amostradas e orfandade ausente nesses cenários, Meta com conflito de atualização, idempotência da Agenda e autenticação por conta. A inicialização falhou com PostgreSQL local inacessível e passou em novo processo após restabelecer a conexão de teste.

O v2.4 foi exportado e restaurado entre SQLite e PostgreSQL nos dois sentidos, com Agenda, Checklist, Notas, Metas, Hábitos e Datas especiais. A suíte de Hábitos abrange frequência, períodos e realizações. O backup preserva Conquistas por meio da meta concluída. Backups anteriores, arquivo sem objeto JSON e conteúdo corrompido foram exercitados, além do isolamento da conta de destino. Restauração repetida é idempotente nas suítes de Evolução e continua duplicando os quatro módulos listados acima.

## Desempenho local

Medições no TestClient, sem latência de rede externa, 500 notas, 25 amostras por rota após aquecimento. Tempos em milissegundos. A resposta de Notas foi de cerca de 80 KB.

| Rota | SQLite p50 / p95 | PostgreSQL p50 / p95 |
|---|---:|---:|
| `/health` | 1,33 / 2,50 | 1,14 / 2,06 |
| `/notes` | 16,28 / 23,74 | 19,45 / 29,88 |
| `/backup` | 23,06 / 50,72 | 26,56 / 87,70 |

A inicialização foi medida em três processos novos por banco, com dados legados locais. A mediana foi 1.107 ms em SQLite e 927 ms em PostgreSQL 18.

Uma navegação do Chromium local em 1440 px registrou DOMContentLoaded aos 864 ms e load aos 1.107 ms. O clique até a seção ativa levou 391 ms na Agenda, 601 ms no Checklist, 151 ms em Notas, 239 ms em Evolução, 91 ms em Ajustes e 169 ms em Hoje. Nessa passagem aquecida foram observadas quatro requisições na Agenda e três na Evolução, com estado reaproveitado nos demais módulos na janela medida. Não é benchmark de concorrência nem previsão de produção.

## OAuth e disponibilização comercial

A simulação não confirma entrega de mensagens do Google, duração de credenciais em projeto de teste, acesso de usuários externos, revogação pelo provedor ou aprovação da tela de consentimento. Em um projeto ainda em modo de teste, o acesso pode depender da lista de testadores e da validade de credenciais definida pelo Google. Para disponibilização comercial, verificar público, estado do consentimento e requisitos de verificação dos escopos atuais, além de privacidade, retenção, suporte e resposta a incidentes. A Sprint não altera credenciais, escopos ou Google Cloud Console.

## Checklist de homologação em produção

- [ ] Conferir o commit aprovado, disponibilidade e arquivos servidos, incluindo o cache v100.
- [ ] Confirmar origem e acesso aos segredos configurados, sem expor valores, e verificar retenção de logs.
- [ ] Confirmar backup recuperável e ensaiar restauração em destino isolado.
- [ ] Validar login, saída e recuperação por e-mail com conta de teste.
- [ ] Validar seletores nativos, layout, cache, retomada e voz em aparelhos físicos.
- [ ] Validar OAuth com conta autorizada, incluindo renovação e desconexão, caso usado no piloto.
- [ ] Acompanhar erros, latência, volumes e duplicidades durante o piloto.

## Arquivos modificados

`css/responsive.css` contém as duas correções da Agenda. `index.html` e `sw.js` versionam os estáticos e o cache `prioriza-public-v100`. `main.py` corrige comparações de expiração e `tests/expiracao_credenciais.py` cobre as regressões. Este documento reúne a auditoria. As capturas da Agenda foram feitas com registros fictícios.
