# Voxa API

## Visão do Produto

Voxa API é uma plataforma SaaS de transcrição de áudio por assinatura, construída sobre o modelo Whisper (faster-whisper em CPU). Desenvolvedores e empresas pagam uma mensalidade fixa, recebem uma API Key e consomem um endpoint REST simples para transcrever áudios de até 5 minutos — sem gerenciar infraestrutura, sem se preocupar com modelos de ML, sem cobrança variável por minuto que explode o orçamento.

A proposta de valor é clareza e previsibilidade: um preço mensal fixo, limites transparentes por plano, e uma API que funciona em 3 linhas de código. Para o operador do produto, o controle total via painel admin (suspender por inadimplência, trocar plano, auditar uso) garante operação sustentável sem acesso direto ao banco de dados.

## Público-alvo

**Segmento primário — Desenvolvedores independentes e pequenas equipes:**
- Constroem produtos que precisam de transcrição como feature (ex: notas de voz, legendas automáticas, resumo de reuniões, acessibilidade)
- Não querem gerenciar infraestrutura de ML nem pagar por GPU
- Valorizam documentação clara, quickstart rápido e preço previsível

**Segmento secundário — Empresas de médio porte com volume moderado:**
- Têm casos de uso internos (transcrição de calls de suporte, reuniões, entrevistas)
- Precisam de auditoria, múltiplas API Keys por ambiente (dev/staging/prod) e suporte responsivo
- Sensíveis a SLA e disponibilidade

**Personas:**
- **Dev Indie**: usa plano starter, integra em projetos pessoais, foco em simplicidade e custo baixo
- **Tech Lead de Startup**: usa plano pro, precisa de múltiplas keys e histórico de uso para controle de custos
- **Ops de Empresa**: usa plano business, precisa de auditoria, previsibilidade e canal de suporte

## Problema que Resolve

**O que é doloroso hoje:**
1. **Custos variáveis imprevisíveis**: APIs de transcrição como AssemblyAI e Deepgram cobram por minuto/hora de áudio, gerando faturas surpresa em fim de mês — especialmente em produtos com uso sazonal
2. **Complexidade de self-hosting**: rodar Whisper localmente exige GPU ou CPU potente, conhecimento de Python/CUDA, manutenção constante de ambiente e modelos
3. **Curva de aprendizado**: plataformas enterprise (Google Speech, Amazon Transcribe) têm APIs complexas, billing obscuro e setup de IAM que leva horas para funcionar
4. **Falta de controle operacional**: produtos sem painel admin dependem de queries diretas no banco para gerenciar inadimplência, revogar acesso ou auditar uso

**Como o Voxa API resolve:**
- Plano mensal fixo → orçamento previsível, zero surpresa
- Infra gerenciada → cliente só faz `curl` com a key, nós rodamos o Whisper
- API simples → primeira transcrição em menos de 5 minutos após o cadastro
- Painel admin completo → operador controla tudo sem SQL

## Features Principais

### Para o Cliente (customer)
- **Endpoint de transcrição** (`POST /v1/transcribe`): upload de áudio (mp3, wav, ogg, mp4, m4a, flac, webm), retorna texto + metadados (duração, tempo de processamento)
- **Gerenciamento de API Keys**: criar, rotular, listar e revogar chaves; chave exibida apenas no momento da criação
- **Dashboard de uso**: consumo do dia e do mês, gráfico dos últimos 30 dias, percentual do limite atingido
- **Histórico de transcrições**: listagem paginada com filtros por status e data; texto completo disponível no detalhe
- **Plano e assinatura**: visualizar plano atual, limites, data de renovação e status
- **Trial gratuito**: 10 transcrições no plano starter ao se cadastrar, sem precisar de cartão

### Para o Operador (admin)
- **Painel de clientes**: listagem com search, filtro por status e plano, métricas da plataforma
- **Controle de assinaturas**: suspender (por inadimplência), reativar, trocar plano — com efeito imediato
- **Gestão de API Keys**: revogar qualquer chave de qualquer cliente
- **Audit log**: registro de todas as ações administrativas com ator, alvo e timestamp

### Segurança e Confiabilidade
- Rate limiting por tier com headers `X-RateLimit-*` padronizados
- Page guard: sem assinatura ativa → 402 em dashboard e endpoint de transcrição
- Proteção contra brute-force no login (5 tentativas por IP por 15 minutos)
- Input sanitization, helmet (headers de segurança), CORS com whitelist
- Logs estruturados com correlation ID por requisição (rastreabilidade)
- Health checks públicos (liveness + readiness)

### Documentação e Discovery
- Swagger/OpenAPI interativo em `/docs` com autenticação integrada
- Landing page com pricing, features e quickstart em 3 linhas de código

## Non-Goals (Fora do Escopo)

O que o Voxa API **NÃO** fará nesta versão:

- ❌ **Transcrição em tempo real (streaming)**: foco exclusivo em áudio pré-gravado (batch); streaming requer WebSockets e infraestrutura diferente
- ❌ **Múltiplos idiomas com detecção automática**: idioma fixo configurado no servidor; detecção de idioma é feature de roadmap
- ❌ **Diarização (identificação de múltiplos falantes)**: fora do escopo do faster-whisper base; requer modelos adicionais
- ❌ **Análise semântica** (sumarização, sentiment, tópicos, PII redaction): o produto é transcrição, não inteligência sobre o texto
- ❌ **Integração de pagamento automatizada**: billing manual/manual nesta versão (admin ativa planos); integração com Stripe é roadmap
- ❌ **Upload de áudio > 5 minutos**: limite técnico do produto — arquivos maiores devem ser divididos pelo cliente
- ❌ **SDK em múltiplas linguagens**: API REST + documentação clara são suficientes para v1; SDKs são roadmap
- ❌ **SLA formal / Status Page pública**: monitoramento interno apenas; SLA e status page são roadmap enterprise
- ❌ **Exportação de transcrições** (PDF, SRT, VTT): retorno em JSON apenas; conversão de formato é responsabilidade do cliente

## Concorrentes e Diferencial

### Concorrentes diretos pesquisados

| Produto | Modelo de preço | Diferencial deles | Ponto fraco |
|---|---|---|---|
| **OpenAI Whisper API** | Pay-per-use ($0.006/min) | Marca forte, precisão alta | Custo variável, dependência de OpenAI |
| **AssemblyAI** | Pay-per-use + features premium | Diarização, sentiment, LeMUR | Caro em volume, features extras custam mais |
| **Deepgram** | Pay-per-use com créditos grátis | Baixa latência, streaming | Limite de streams concorrentes por tier |
| **Gladia** | Pay-per-use | Precisão em idiomas europeus | Menos conhecido, docs incompletas |
| **Voicegain** | Enterprise, SOC-2 | Compliance, private cloud | Caro, focado em enterprise |
| **Google Speech-to-Text** | Pay-per-use com free tier | Integração com GCP | Setup IAM complexo, billing obscuro |

### Diferencial do Voxa API

1. **Preço fixo e previsível**: plano mensal vs pay-per-use — ideal para produtos com volume consistente ou orçamento fixo
2. **Simplicidade operacional**: API em 3 linhas, sem IAM, sem SDKs obrigatórios, sem configuração de modelos
3. **Controle total para o operador**: painel admin nativo com controle de inadimplência sem acesso direto ao banco
4. **Self-hosted por natureza**: rodamos faster-whisper em CPU própria — sem custo por token enviado a terceiros, sem dependência de APIs externas para a funcionalidade core
5. **Velocidade de integração**: trial sem cartão, API Key na hora, primeira transcrição em < 5 minutos

## Glossário do Domínio

| Termo | Definição |
|---|---|
| **Transcrição** | Conversão de áudio em texto. No contexto da API, o resultado é o texto bruto sem formatação adicional. |
| **Whisper** | Modelo de speech-to-text desenvolvido pela OpenAI, open-source. O Voxa API usa `faster-whisper`, uma implementação otimizada para CPU. |
| **faster-whisper** | Re-implementação do Whisper usando CTranslate2, com melhor performance em CPU sem necessidade de GPU. |
| **API Key** | Token de autenticação gerado pela plataforma e usado pelo cliente para autenticar requisições ao endpoint de transcrição. Formato: `vxa_` + 40 chars hex. |
| **Bearer Token** | Token JWT usado para autenticação nas rotas do dashboard (não é a API Key — são dois mecanismos distintos). |
| **Subscription / Assinatura** | Vínculo entre um cliente e um plano, com período de vigência e status (trial, active, suspended, cancelled). |
| **Trial** | Período gratuito inicial com 10 transcrições no plano starter. Não requer cartão de crédito. |
| **Rate Limit** | Limite de requisições por período (diário) determinado pelo plano do cliente. |
| **Page Guard** | Mecanismo que bloqueia acesso a endpoints de dashboard e transcrição para usuários sem assinatura ativa, retornando HTTP 402. |
| **Audit Log** | Registro imutável de ações administrativas (suspend, reactivate, plan change, key revocation) para rastreabilidade. |
| **Tier** | Nível de plano do cliente (starter, pro, business), que determina limites de uso e funcionalidades. |
| **X-API-Key** | Header HTTP usado para autenticar requisições ao endpoint de transcrição (`POST /v1/transcribe`). |
| **Processing Time** | Tempo em milissegundos desde o recebimento do áudio até a resposta com o texto transcrito. Métrica de performance do servidor. |
| **Brute-force Protection** | Mecanismo que bloqueia IPs após múltiplas tentativas de login falhadas, protegendo contra ataques de dicionário. |
