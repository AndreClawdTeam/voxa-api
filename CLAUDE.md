# Voxa API

## Visão do Produto

Voxa é uma API REST paga de transcrição de áudio que permite desenvolvedores e empresas converter arquivos de áudio em texto de forma rápida, segura e acessível. Usando o modelo Whisper (faster-whisper) rodando em CPU, a Voxa oferece transcrições de alta qualidade sem depender de serviços externos caros.

O modelo de negócio é simples: o cliente assina um plano mensal, recebe um API Token e começa a usar imediatamente. Sem complexidade, sem setup demorado. A plataforma é self-service: registro → escolha do plano → pagamento → API Token disponível imediatamente.

## Público-alvo

- **Desenvolvedores independentes** que precisam de transcrição em seus produtos (podcasts, notas de voz, atendimento ao cliente) e querem integrar com poucas linhas de código
- **Startups e pequenas empresas** que querem integrar transcrição sem pagar os preços da OpenAI ou AWS Transcribe e sem a complexidade de infraestrutura cloud
- **Criadores de conteúdo** que precisam legendar ou transcrever vídeos/áudios de forma automatizada e recorrente
- **Empresas de atendimento** que querem transcrever ligações ou mensagens de voz para análise, CRM ou compliance

## Problema que Resolve

Soluções de transcrição existentes têm problemas sérios para uso moderado e previsível:

- **OpenAI Whisper API**: $0.006/minuto — para 1.000 minutos/mês são $6, mas o custo é imprevisível e escala com uso
- **AWS Transcribe**: cobrança por segundo, requer conta AWS configurada, IAM roles, S3 buckets — muita infraestrutura para um uso simples
- **Google Speech-to-Text**: preço variável por idioma, setup complexo com GCP
- **AssemblyAI / Deepgram**: bons produtos, mas preços por uso que podem escalar inesperadamente

A Voxa resolve isso com **preço fixo mensal por tier**, REST API simples (um endpoint, um token, pronto), e onboarding em minutos — sem conta cloud, sem configuração de infraestrutura, sem surpresas na fatura.

## Features Principais

- **POST /v1/transcribe** — endpoint core para transcrição de áudios de até 5 minutos; aceita multipart/form-data com o arquivo de áudio; retorna JSON com texto, idioma detectado e confiança
- **API Keys gerenciadas** — geração segura com prefixo `vxa_`, rotulagem por ambiente (produção/dev), listagem, revogação individual sem afetar outras keys
- **Assinaturas com page guard** — sem assinatura ativa = sem acesso ao dashboard e à API; trial de 7 dias disponível no registro
- **Rate limiting por tier** — limites diferentes por plano (ex: basic = 60 req/min, pro = 300 req/min), com headers `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `X-RateLimit-Reset` padronizados
- **Dashboard do cliente** — visualização de uso mensal, histórico de transcrições com replay, gestão de perfil e API keys
- **Dashboard admin** — controle total de clientes, ativação/desativação de assinaturas, audit log de ações críticas, métricas de uso da plataforma
- **Autenticação robusta** — JWT com roles (`customer` / `admin`), refresh tokens, proteção contra brute-force via rate limit no login (5 tentativas / 15 min)
- **Swagger completo** — documentação interativa da API em `/api/docs`, com exemplos de request/response e autenticação integrada
- **Landing page** — apresentação do produto, planos e preços, CTA para registro, e captação de novos clientes
- **Logs estruturados com pino** — rastreabilidade total de cada requisição com `requestId`, duração, status e metadados de transcrição
- **Docker + graceful shutdown** — containerização completa, health checks em `/health`, shutdown limpo sem perder transcrições em andamento

## Non-Goals (Fora do Escopo)

- Transcrição de áudios acima de 5 minutos (na v1) — limitar complexidade e custo de CPU
- Tradução de transcrições (apenas transcrição no idioma original do áudio)
- App mobile nativo — a API REST é suficiente para integração mobile
- Suporte a streaming de áudio em tempo real — requer arquitetura WebSocket/gRPC fora do escopo v1
- Integrações diretas com plataformas (Slack, WhatsApp, Zoom, etc.) — isso é responsabilidade do cliente da API
- Processamento de vídeo — apenas áudio; extração de áudio de vídeo é responsabilidade do cliente
- Múltiplos idiomas de interface no dashboard — apenas português e inglês na v1
- Faturamento automático / cobrança recorrente integrada na plataforma — gestão manual de assinaturas pelo admin na v1

## Concorrentes e Diferencial

| Concorrente | Modelo de preço | Limitação | Diferencial da Voxa |
|---|---|---|---|
| OpenAI Whisper API | $0.006/min (por uso) | Custo imprevisível | Preço fixo mensal, sem surpresas |
| AWS Transcribe | Por segundo (por uso) | Setup AWS complexo | Mais simples, sem AWS setup |
| AssemblyAI | Por hora de áudio | Escala com uso | Mais barato para uso moderado |
| Deepgram | Por hora + features | Planos caros no tier médio | Focado em simplicidade e preço |
| Google Speech-to-Text | Por 15s de áudio | Setup GCP necessário | Zero infraestrutura para o cliente |

**Diferencial principal:** preço previsível com plano fixo mensal, API com um único endpoint intuitivo, onboarding em minutos (registro → pagamento → token → uso), e controle total pelo admin (desativar clientes inadimplentes, audit log, métricas em tempo real).

## Modelo de Assinatura

| Tier | Limite | Rate Limit | Trial |
|---|---|---|---|
| **trial** | 7 dias | 20 req/min | Sim (automático no cadastro) |
| **basic** | Plano mensal básico | 60 req/min | Não |
| **pro** | Plano mensal profissional | 300 req/min | Não |

- Sem assinatura ativa → acesso bloqueado por page guard (dashboard) e 401 (API)
- Trial expira automaticamente; cliente precisa assinar um plano para continuar
- Admin pode ativar, pausar ou cancelar qualquer assinatura manualmente

## Glossário do Domínio

- **API Token / API Key** — chave de autenticação gerada por assinante para consumir a API; formato `vxa_<random_hex>`; associada a um usuário e a um tier de assinatura
- **Tier** — nível do plano de assinatura (`trial`, `basic`, `pro`) que define rate limits, duração máxima de áudio e features disponíveis
- **Transcrição** — conversão de arquivo de áudio em texto pelo modelo Whisper; resultado inclui texto, idioma detectado, confiança e duração do áudio
- **Page Guard** — middleware de proteção de rota que verifica assinatura ativa antes de permitir acesso ao dashboard; redireciona para página de planos se inativo
- **Circuit Breaker** — mecanismo de proteção que suspende acesso de um cliente após comportamento anômalo (ex: flood de requests acima do limite)
- **Rate Limit** — limite de requisições por período de tempo, definido por tier; controlado por sliding window no Redis ou em memória
- **Audit Log** — registro imutável de ações críticas realizadas por admins (ex: desativar assinatura, alterar plano) e clientes (ex: revogar API key); armazenado no banco com timestamp e IP
- **faster-whisper** — implementação otimizada do modelo Whisper em Python usando CTranslate2; roda eficientemente em CPU com qualidade equivalente ao modelo original da OpenAI
- **Graceful Shutdown** — processo de encerramento do servidor que aguarda requisições em andamento terminarem antes de fechar conexões, evitando transcrições incompletas
- **Refresh Token** — token de longa duração usado para renovar o JWT de acesso sem exigir novo login; armazenado com hash no banco e associado ao usuário
