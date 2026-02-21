# Voxa API

> API REST de transcrição de áudio alimentada pelo **faster-whisper** (Whisper da OpenAI em CTranslate2, CPU-only).  
> Planos: **trial** (7 dias, 20 req/min) · **basic** (60 req/min) · **pro** (300 req/min)

---

## Índice

- [Desenvolvimento](#desenvolvimento)
  - [Pré-requisitos](#pré-requisitos)
  - [Clonar e instalar](#clonar-e-instalar)
  - [Configurar variáveis de ambiente](#configurar-variáveis-de-ambiente)
  - [Rodar migrações](#rodar-migrações)
  - [Rodar o seed](#rodar-o-seed)
  - [Iniciar em dev](#iniciar-em-dev)
  - [Testes](#testes)
  - [Lint e format](#lint-e-format)
- [Produção](#produção)
  - [Build](#build)
  - [Variáveis críticas em prod](#variáveis-críticas-em-prod)
  - [Migrações em produção](#migrações-em-produção)
  - [Seed em produção](#seed-em-produção)
  - [Iniciar a aplicação](#iniciar-a-aplicação)
  - [Docker](#docker)
  - [Health check](#health-check)
  - [Graceful shutdown](#graceful-shutdown)
- [Arquitetura](#arquitetura)
  - [Estrutura de pastas](#estrutura-de-pastas)
  - [Stack](#stack)

---

## Desenvolvimento

### Pré-requisitos

| Ferramenta | Versão mínima | Notas |
|---|---|---|
| Node.js | 20 LTS | Testado com v22 |
| npm | 10+ | Incluído com Node |
| PostgreSQL | 14+ | Via Docker (recomendado) ou instalação local |
| Python 3 | 3.10+ | Necessário para o faster-whisper |
| faster-whisper | qualquer | `pip install faster-whisper` |

> **Dica:** Use `docker compose up -d postgres` para subir apenas o banco de dados em dev,
> sem precisar instalar o PostgreSQL localmente.

---

### Clonar e instalar

```bash
git clone https://github.com/AndreClawdTeam/voxa-api.git
cd voxa-api
npm install
```

---

### Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` com seus valores:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NODE_ENV` | ✅ | `development`, `test` ou `production` |
| `PORT` | ✅ | Porta HTTP do servidor (padrão: `3000`) |
| `DATABASE_URL` | ✅ | Connection string PostgreSQL (`postgresql://user:pass@host:5432/db`) |
| `JWT_SECRET` | ✅ | Segredo para assinar JWTs — **mínimo 32 chars, gerado aleatoriamente** |
| `JWT_EXPIRES_IN` | ✅ | Expiração do access token, ex.: `15m` |
| `JWT_REFRESH_EXPIRES_IN` | ✅ | Expiração do refresh token, ex.: `7d` |
| `RATE_LIMIT_TRIAL_RPM` | ✅ | Req/min para o plano trial (padrão: `20`) |
| `RATE_LIMIT_BASIC_RPM` | ✅ | Req/min para o plano basic (padrão: `60`) |
| `RATE_LIMIT_PRO_RPM` | ✅ | Req/min para o plano pro (padrão: `300`) |
| `TRIAL_DURATION_DAYS` | ✅ | Duração do trial em dias (padrão: `7`) |
| `LOG_LEVEL` | — | Nível de log: `debug`, `info`, `warn`, `error` (padrão: `info`) |
| `WHISPER_PYTHON` | ✅ | Caminho do Python com faster-whisper (ex.: `python3` ou `/usr/bin/python3`) |

> **Segurança:** Nunca commite o `.env` no repositório. Ele já está no `.gitignore`.  
> Para gerar um `JWT_SECRET` seguro:
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

---

### Rodar migrações

```bash
npm run db:migrate
```

Aplica todas as migrações pendentes do diretório `migrations/` usando Drizzle ORM.  
As migrações são idempotentes — é seguro rodar múltiplas vezes.

---

### Rodar o seed

```bash
npm run db:seed
```

Cria um usuário admin padrão e dados iniciais de referência.  
O seed é **idempotente** (verifica se os dados já existem antes de inserir).

Credenciais do admin criado pelo seed:
```
Email:    admin@voxa.dev
Senha:    Admin@123456
```
> **Altere a senha do admin imediatamente após o primeiro acesso.**

---

### Iniciar em dev

```bash
npm run dev
```

Inicia o servidor com **tsx watch** (hot-reload automático).  
Acesse a API em `http://localhost:3000`.

Documentação Swagger disponível em:
```
http://localhost:3000/api-docs
```

---

### Testes

```bash
npm test
```

Executa os 107 testes com **Vitest** (mode: `run`, sem watch).  
Os testes não precisam de banco de dados real — o DB é mockado via `vi.mock`.

Para watch mode durante o desenvolvimento:
```bash
npx vitest
```

Para cobertura:
```bash
npx vitest run --coverage
```

---

### Lint e format

```bash
npx biome check --write .
```

Executa lint + format em todos os arquivos TypeScript de uma vez.  
O Biome é configurado em `biome.json` como substituto unificado do ESLint + Prettier.

Para checar sem aplicar correções automáticas:
```bash
npx biome check .
```

---

## Produção

### Build

```bash
npm run build
```

Compila TypeScript para JavaScript em `dist/` usando `tsconfig.build.json`.  
O diretório `dist/` contém apenas os arquivos necessários para execução (sem testes).

---

### Variáveis críticas em prod

Em produção, as seguintes variáveis são obrigatórias e devem ser configuradas com segurança:

| Variável | Por que é crítica |
|---|---|
| `JWT_SECRET` | Qualquer vazamento compromete toda a autenticação da plataforma |
| `DATABASE_URL` | Acesso ao banco — use usuário com permissões mínimas necessárias |
| `NODE_ENV=production` | Ativa otimizações e desativa logs de debug |

Use um cofre de segredos (AWS Secrets Manager, Vault, Railway Secrets, etc.) em vez de arquivos `.env` em produção.

---

### Migrações em produção

> ⚠️ **FAÇA BACKUP DO BANCO ANTES DE MIGRAR EM PRODUÇÃO.**

```bash
# 1. Fazer backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Aplicar migrações
npm run db:migrate
```

As migrações são idempotentes, mas podem incluir DDL destrutivo (DROP COLUMN, ALTER TYPE).  
Sempre revise os arquivos em `migrations/` antes de aplicar em prod.

---

### Seed em produção

O seed **pode** ser rodado em produção para criar o usuário admin inicial:

```bash
npm run db:seed
```

É **idempotente** — verifica se o admin já existe antes de inserir. Seguro de rodar múltiplas vezes.

> ⚠️ Altere a senha do admin imediatamente após o seed:  
> `PATCH /api/v1/dashboard/profile` com o novo email/senha (ou via painel do banco).

---

### Iniciar a aplicação

```bash
node dist/server.js
```

Ou via pm2:
```bash
pm2 start dist/server.js --name voxa-api
```

---

### Docker

O `docker-compose.yml` sobe dois serviços:

| Serviço | Imagem | Porta | Descrição |
|---|---|---|---|
| `postgres` | postgres:15-alpine | 5432 | Banco de dados PostgreSQL |
| `app` | (build local) | 3000 | Voxa API compilada |

```bash
# Subir tudo em background
docker compose up -d

# Subir apenas o banco (para dev com Node local)
docker compose up -d postgres

# Ver logs
docker compose logs -f app

# Derrubar
docker compose down
```

> **Importante:** Em produção via Docker, defina `JWT_SECRET` e as variáveis críticas
> como environment variables no host ou via secrets, não no `docker-compose.yml`.

---

### Health check

```
GET /health
```

Resposta de sucesso:
```json
{
  "status": "ok",
  "timestamp": "2026-02-21T11:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600
}
```

Resposta em degradação (banco indisponível):
```json
{
  "status": "degraded",
  "details": { "database": "unreachable" }
}
```

Use este endpoint para monitoramento e health checks do load balancer.

---

### Graceful shutdown

O servidor captura `SIGTERM` e `SIGINT` e:
1. Para de aceitar novas conexões
2. Aguarda até 30 segundos pelo fim das requisições em andamento
3. Fecha o pool de conexões do PostgreSQL
4. Encerra com código `0`

Configurado em `src/server.ts`. Compatível com Kubernetes, Railway, e outros orquestradores.

---

## Arquitetura

### Estrutura de pastas

```
src/
├── app.ts                          # Criação do app Express (middlewares globais, rotas, error handler)
├── server.ts                       # Entry point HTTP + graceful shutdown
├── config/
│   └── env.ts                      # Variáveis de ambiente validadas com Zod
├── db/
│   ├── index.ts                    # Instância do Drizzle ORM + pool pg
│   ├── schema.ts                   # Schema completo (users, subscriptions, transcriptions, ...)
│   └── seed.ts                     # Seed idempotente de dados iniciais
├── lib/
│   ├── errors.ts                   # Hierarquia de erros (AppError, ValidationError, etc.)
│   ├── http.ts                     # Helpers de resposta HTTP + requireUser/requireApiKeyId
│   ├── jwt.ts                      # Sign/verify JWT com Zod para validação segura de payloads
│   ├── logger.ts                   # Logger estruturado (pino)
│   ├── magic-bytes.ts              # Validação de áudio por magic bytes (previne MIME spoofing)
│   ├── swagger.ts                  # Configuração do Swagger/OpenAPI
│   ├── validation.ts               # Helpers Zod: parseBody, parseQuery, parseParams, paginação
│   └── whisper.ts                  # Cliente faster-whisper (spawn Python)
├── middleware/
│   ├── authenticate.ts             # Autenticação JWT Bearer → req.user
│   ├── authenticate-api-key.ts     # Autenticação por API Key → req.user + req.apiKeyId + req.subscription
│   ├── rate-limit-by-tier.ts       # Rate limiting dinâmico por tier de assinatura
│   └── require-admin.ts            # Autorização: role === 'admin'
├── modules/
│   ├── auth/                       # Registro, login, refresh, logout
│   ├── api-keys/                   # CRUD de API keys
│   ├── transcription/              # Endpoint de transcrição de áudio
│   ├── subscriptions/              # Consulta e upgrade de plano
│   ├── dashboard/                  # Uso, histórico e perfil do usuário
│   └── admin/                      # Gestão de usuários, assinaturas e audit log
└── types/
    └── express.d.ts                # Extensão global do Express.Request (user, apiKeyId, subscription)
```

Cada módulo segue a arquitetura em camadas:

```
Routes → Controller → Service → Repository → Drizzle ORM → PostgreSQL
```

---

### Stack

| Tecnologia | Versão | Papel |
|---|---|---|
| **Node.js** | 20+ LTS | Runtime JavaScript server-side |
| **TypeScript** | 5.x | Tipagem estática, zero `as any` em produção |
| **Express** | 5.x | Framework HTTP + roteamento |
| **Drizzle ORM** | latest | Query builder type-safe para PostgreSQL |
| **PostgreSQL** | 14+ | Banco de dados relacional principal |
| **Zod** | 3.x | Validação de schemas (env, req.body, payloads JWT) |
| **faster-whisper** | any | Motor de transcrição de áudio (Python, CPU) |
| **jsonwebtoken** | 9.x | Assinatura e verificação de JWTs (access + refresh) |
| **bcryptjs** | 2.x | Hash de senhas (salt rounds: 12) |
| **pino** | latest | Logger estruturado (JSON), integrado ao Express via pino-http |
| **Biome** | latest | Linter + formatter unificado (substitui ESLint + Prettier) |
| **Vitest** | 3.x | Framework de testes unitários (compatible com Jest API) |
| **Swagger UI** | latest | Documentação interativa da API em `/api-docs` |
| **Docker** | any | Containerização para produção |

---

## Decisões técnicas

### Por que faster-whisper em vez da API da OpenAI?
Custo zero por transcrição. Privacidade total (dados não saem da infra). Sem dependência de terceiros.
A troca: requer Python no servidor e mais CPU. Aceitável para v1.

### Por que Drizzle em vez de Prisma?
Drizzle é mais próximo do SQL, tem migração mais previsível e não tem um "runtime" pesado.
Para um produto de transcrição de áudio que precisa de queries otimizadas, o controle é valioso.

### Por que Biome em vez de ESLint + Prettier?
Um único binário, configuração unificada, mais rápido. Mesma qualidade de DX.

### Por que JWTs com jti para revogação?
Access tokens são efêmeros (15min) — não precisam de revogação.
Refresh tokens têm vida longa (7d) — precisam de blacklist por `jti`. Implementado em memória
(single-process). Para multi-instância, migre para Redis.
