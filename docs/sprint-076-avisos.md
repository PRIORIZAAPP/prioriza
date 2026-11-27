# Anexo · Avisos de dependências

Gravidade e faixa afetada vêm da base GitHub Advisory Database. A versão corrigida é a primeira informada pelo advisory. Linhas repetidas do pip-audit foram agrupadas pelo GHSA. O anexo inclui o cenário inicial e os avisos surgidos no lock intermediário.

## starlette

- **CVE-2025-54121** · Média · Afetada: `< 0.47.2` · Corrigida: `0.47.2`. Aplicável aos uploads multipart, como o avatar. Risco de indisponibilidade. [GHSA-2c2j-9gv5-cj73](https://github.com/advisories/GHSA-2c2j-9gv5-cj73)
- **CVE-2025-62727** · Alta · Afetada: `>= 0.39.0, <= 0.49.0` · Corrigida: `0.49.1`. Aplicável a respostas de arquivos estáticos. Risco de indisponibilidade. [GHSA-7f5h-v6xp-fcq8](https://github.com/advisories/GHSA-7f5h-v6xp-fcq8)
- **CVE-2026-54283** · Alta · Afetada: `>= 0.4.1, < 1.3.1` · Corrigida: `1.3.1`. Relevante a formulários URL-encoded. Risco de consumo de recursos. [GHSA-82w8-qh3p-5jfq](https://github.com/advisories/GHSA-82w8-qh3p-5jfq)
- **CVE-2026-48710** · Média · Afetada: `<= 1.0.0` · Corrigida: `1.0.1`. Relevante para roteamento HTTP. O impacto depende de controles que usam o caminho da URL. [GHSA-86qp-5c8j-p5mr](https://github.com/advisories/GHSA-86qp-5c8j-p5mr)
- **CVE-2026-54282** · Baixa · Afetada: `< 1.3.0` · Corrigida: `1.3.0`. Depende de decisões baseadas no hostname reconstruído. URLs públicas do fluxo de recuperação vêm de configuração. [GHSA-jp82-jpqv-5vv3](https://github.com/advisories/GHSA-jp82-jpqv-5vv3)
- **CVE-2026-48818** · Alta · Afetada: `< 1.1.0` · Corrigida: `1.1.0`. Cenário específico de Windows. O alvo da implantação é Linux. [GHSA-wqp7-x3pw-xc5r](https://github.com/advisories/GHSA-wqp7-x3pw-xc5r)
- **CVE-2026-48817** · Média · Afetada: `< 1.1.0` · Corrigida: `1.1.0`. Condicional ao uso direto de HTTPEndpoint. As rotas auditadas usam FastAPI. [GHSA-x746-7m8f-x49c](https://github.com/advisories/GHSA-x746-7m8f-x49c)

## python-multipart

- **CVE-2024-53981** · Alta · Afetada: `< 0.0.18` · Corrigida: `0.0.18`. Relevante ao parser multipart. Risco de consumo de CPU. [GHSA-59g5-xgcq-4qw3](https://github.com/advisories/GHSA-59g5-xgcq-4qw3)
- **CVE-2026-53539** · Alta · Afetada: `< 0.0.30` · Corrigida: `0.0.30`. Relevante a formulários URL-encoded. Risco de consumo de CPU. [GHSA-5rvq-cxj2-64vf](https://github.com/advisories/GHSA-5rvq-cxj2-64vf)
- **CVE-2026-53538** · Baixa · Afetada: `< 0.0.30` · Corrigida: `0.0.30`. Alcançável no parsing de formulários URL-encoded. O impacto depende de divergência de parsing entre componentes. [GHSA-6jv3-5f52-599m](https://github.com/advisories/GHSA-6jv3-5f52-599m)
- **CVE-2026-40347** · Média · Afetada: `< 0.0.26` · Corrigida: `0.0.26`. Relevante ao parser multipart. Risco de indisponibilidade. [GHSA-mj87-hwqh-73pj](https://github.com/advisories/GHSA-mj87-hwqh-73pj)
- **CVE-2026-42561** · Alta · Afetada: `< 0.0.27` · Corrigida: `0.0.27`. Relevante ao parser multipart. Risco de consumo de CPU e memória. [GHSA-pp6c-gr5w-3c5g](https://github.com/advisories/GHSA-pp6c-gr5w-3c5g)
- **CVE-2026-53540** · Baixa · Afetada: `< 0.0.31` · Corrigida: `0.0.31`. Condicional ao uso direto de parse_form. O fluxo HTTP revisado usa request.form. [GHSA-v9pg-7xvm-68hf](https://github.com/advisories/GHSA-v9pg-7xvm-68hf)
- **CVE-2026-24486** · Alta · Afetada: `< 0.0.22` · Corrigida: `0.0.22`. Condicional a opções de gravação fora do padrão. O fluxo de avatar escolhe nome no servidor. [GHSA-wp53-j4wj-2cfg](https://github.com/advisories/GHSA-wp53-j4wj-2cfg)

## pip

- **CVE-2025-8869** · Média · Afetada: `<= 25.2` · Corrigida: `25.3`. Aplicável ao processo de instalação e à cadeia de build. O risco depende da origem dos pacotes e do índice. [GHSA-4xh5-x5gv-qwph](https://github.com/advisories/GHSA-4xh5-x5gv-qwph)
- **CVE-2026-3219** · Média · Afetada: `<= 26.0.1` · Corrigida: `26.1`. Aplicável ao processo de instalação e à cadeia de build. O risco depende da origem dos pacotes e do índice. [GHSA-58qw-9mgm-455v](https://github.com/advisories/GHSA-58qw-9mgm-455v)
- **CVE-2026-1703** · Baixa · Afetada: `< 26.0` · Corrigida: `26.0`. Aplicável ao processo de instalação e à cadeia de build. O risco depende da origem dos pacotes e do índice. [GHSA-6vgw-5pg2-w6jp](https://github.com/advisories/GHSA-6vgw-5pg2-w6jp)
- **CVE-2026-6357** · Média · Afetada: `< 26.1` · Corrigida: `26.1`. Aplicável ao processo de instalação e à cadeia de build. O risco depende da origem dos pacotes e do índice. [GHSA-jp4c-xjxw-mgf9](https://github.com/advisories/GHSA-jp4c-xjxw-mgf9)
- **CVE-2026-13346** · Média · Afetada: `< 26.2.0` · Corrigida: `26.2.0`. Aplicável ao processo de instalação e à cadeia de build. O risco depende da origem dos pacotes e do índice. [GHSA-qwm4-qh6w-59xr](https://github.com/advisories/GHSA-qwm4-qh6w-59xr)
- **CVE-2026-8643** · Média · Afetada: `< 26.1.2` · Corrigida: `26.1.2`. Aplicável ao processo de instalação e à cadeia de build. O risco depende da origem dos pacotes e do índice. [GHSA-wf93-45jw-7689](https://github.com/advisories/GHSA-wf93-45jw-7689)

## anyio

- **CVE-2026-64847** · Média · Afetada: `< 4.14.2` · Corrigida: `4.14.2`. Condicional ao pool de processos do AnyIO. Esse caminho não foi identificado no aplicativo. [GHSA-5p39-cfhj-2xmp](https://github.com/advisories/GHSA-5p39-cfhj-2xmp)
- **CVE-2026-63374** · Crítica · Afetada: `< 4.14.2` · Corrigida: `4.14.2`. Condicional a TLS do AnyIO com nomes internacionalizados. Provedores auditados usam destinos conhecidos. [GHSA-82r6-8w77-94w6](https://github.com/advisories/GHSA-82r6-8w77-94w6)

## idna

- **CVE-2026-45409** · Média · Afetada: `< 3.15` · Corrigida: `3.15`. Condicional ao processamento IDNA de nomes internacionalizados. Risco de consumo de recursos. [GHSA-65pc-fj4g-8rjx](https://github.com/advisories/GHSA-65pc-fj4g-8rjx)
