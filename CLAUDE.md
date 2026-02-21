# Voxa API — Technical Documentation

> **Tech Lead:** Johnny Juvenil | **Stack:** Node.js + TypeScript + Express + Drizzle + PostgreSQL
> **Last updated:** 2026-02-21 | **Version:** v1.0

---

## 1. Visão do Produto

### O que é a Voxa

Voxa é uma **API REST paga de transcrição de áudio** que permite desenvolvedores e empresas converter arquivos de áudio em texto de forma rápida, segura e acessível. O motor do sistema é o **faster-whisper** (implementação otimizada do Whisper da OpenAI em CTranslate2) rodando em CPU — sem dependência de GPUs caras ou serviços externos.

O modelo de negócio é direto: **assine um plano → receba um API Token → comece a usar**. Sem conta cloud, sem infraestrutura própria, sem surpresas na fatura.

### Proposta de Valor

| Problema do mercado | Solução Voxa |
|---|---|
| Custo por uso imprevisível (OpenAI, AWS) | Preço fixo mensal por tier |
| Setup complexo (IAM roles, S3, GCP) | Zero infraestrutura para o cliente |
| APIs com curva de aprendizado | Um endpoint, um token, pronto |
| Onboarding demorado | Registro → pagamento → uso em < 5 minutos |

### Público-Alvo

- **Desenvolvedores independentes** — integração com poucas linhas de código para podcasts, notas de voz, atendimento ao cliente
- **Startups e PMEs** — transcrição sem pagar preços da OpenAI/AWS e sem complexidade de cloud
- **Criadores de conteúdo** — legendas e transcrições automatizadas e recorrentes
- **Empresas de atendimento** — transcrição de ligações/mensagens de voz para CRM e compliance

### Escopo da v1

**Dentro do escopo:**
- Transcrição de áudios de até 5 minutos (MP3, WAV, OGG, MP4/M4A, FLAC, WEBM)
- Planos trial (7 dias), basic e pro com rate limits diferenciados
- Autenticação JWT com roles customer/admin
- Dashboard do cliente e admin com operações de gestão
- API Keys múltiplas por conta com rotulagem e revogação

**Fora do escopo (v1):**
- Áudios > 5 minutos
- Tradução de transcrições
- Streaming de áudio em tempo real (WebSocket/gRPC)
- Processamento de vídeo
- Faturamento automático/recorrente integrado na plataforma
- App mobile nativo

### Modelo de Assinatura

| Tier | Duração | Rate Limit | Trial |
|---|---|---|---|
| **trial** | 7 dias | 20 req/min | Sim (automático no cadastro) |
| **basic** | Mensal | 60 req/min | Não |
| **pro** | Mensal | 300 req/min | Não |

- Sem assinatura ativa → 401 na API, redirecionamento no dashboard
- Trial expira automaticamente; requer upgrade de plano para continuar
- Admin pode ativar, pausar ou cancelar assinaturas manualmente

---

## 2. Arquitetura

### Diagrama de Camadas

```
┌─────────────────────────────────────────────────────────────┐
│                        HTTP Request                         │
│           (Bearer JWT ou API Key vxa_<hex>)                 │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                   Middlewares Globais                        │
│  pino-http (logging) | cors | helmet | express.json         │
│  requestId injection | rate-limit global                    │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│               Routes (Express Router)                        │
│  /api/v1/auth/*      — autenticação pública                 │
│  /api/v1/transcribe  — endpoint core (API Key auth)         │
│  /api/v1/keys/*      — gestão de API Keys (JWT auth)        │
│  /api/v1/dashboard/* — dashboard cliente (JWT auth)         │
│  /api/v1/admin/*     — painel admin (JWT + role admin)      │
│  /api/v1/subscriptions/* — gestão de planos (JWT auth)      │
│  /api/docs           — Swagger UI                           │
│  /health             — health check                         │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              Controllers (req/res handling)                  │
│  Validação de input via Zod schemas                         │
│  Extração de parâmetros e autenticação do request           │
│  Formatação de resposta (success/error)                     │
│  NÃO contém lógica de negócio                               │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│               Services (Business Logic)                      │
│  Regras de negócio puras (sem Express)                      │
│  Transações de banco de dados                               │
│  Integração com faster-whisper (Python subprocess)          │
│  Lançamento de erros de domínio tipados                     │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│             Repositories (Data Access Layer)                 │
│  Queries Drizzle ORM type-safe                              │
│  Mapeamento de entidades de banco para domain models        │
│  Paginação, filtros e ordenação                             │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL                              │
│  6 tabelas: users, subscriptions, api_keys,                 │
│  transcriptions, usage_logs, audit_logs                     │
└─────────────────────────────────────────────────────────────┘
```

### Fluxo de Autenticação

```
Cliente Web (Dashboard)         API Consumer (CLI/SDK)
        │                                │
   POST /auth/login              POST /v1/transcribe
        │                         Authorization: Bearer vxa_<hex>
   JWT access (15min)                    │
   + refresh token (7d)          middleware valida api_key no banco
        │                         verifica subscription ativa
   Bearer <access_token>          aplica rate limit por tier
```

### Integração com faster-whisper

```
TranscriptionService
        │
   spawn Python subprocess
        │
   python3 -c "from faster_whisper import WhisperModel; ..."
        │
   stdin: audio file bytes (ou path temporário)
        │
   stdout: JSON { text, language, confidence, duration }
        │
   cleanup temp file + persist result no banco
```

---

## 3. Tech Stack

| Tecnologia | Versão | Justificativa |
|---|---|---|
| **Node.js** | 20 LTS | Runtime estável, Event Loop ideal para I/O (uploads, DB queries) |
| **TypeScript** | 5.x | Type safety reduz bugs de produção; inference com Zod/Drizzle elimina tipos manuais |
| **Express** | 4.x | Framework leve e battle-tested; ecossistema maduro de middlewares |
| **Drizzle ORM** | latest | Schema-first, type-safe end-to-end; migrações SQL legíveis; sem magic |
| **PostgreSQL** | 15+ | ACID, suporte a JSONB, performance em queries analíticas do dashboard |
| **Zod** | 3.x | Validação em runtime com TypeScript inference; substitui class-validator |
| **JWT (jsonwebtoken)** | 9.x | Auth stateless; access token curto (15min) + refresh token longo (7d) |
| **bcryptjs** | 2.x | Hash de senhas; fator 12 (seguro sem impacto perceptível em CPU) |
| **pino** + **pino-http** | latest | Logs estruturados JSON; performance muito superior ao winston |
| **multer** | latest | Middleware para upload de arquivos multipart/form-data |
| **express-rate-limit** | latest | Rate limiting por IP/key; sliding window em memória (Redis ready) |
| **swagger-jsdoc** + **swagger-ui-express** | latest | Documentação interativa gerada a partir de JSDoc nos controllers |
| **Vitest** | latest | Test runner moderno; compatível com ESM; watch mode rápido |
| **supertest** | latest | Integração HTTP para testes de controllers sem servidor externo |
| **dotenv** | latest | Carregamento de variáveis de ambiente de `.env` |
| **Docker** + **Docker Compose** | latest | Build reproduzível; orquestração local com postgres e app |

---

## 4. Schema do Banco de Dados

```typescript
// src/db/schema.ts
import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  real,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const subscriptionTierEnum = pgEnum('subscription_tier', [
  'trial',
  'basic',
  'pro',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'expired',
  'suspended',
  'cancelled',
]);

export const apiKeyEnvironmentEnum = pgEnum('api_key_environment', [
  'production',
  'development',
]);

export const transcriptionStatusEnum = pgEnum('transcription_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const userRoleEnum = pgEnum('user_role', ['customer', 'admin']);

export const auditActionEnum = pgEnum('audit_action', [
  // Admin actions
  'admin.subscription.activate',
  'admin.subscription.suspend',
  'admin.subscription.cancel',
  'admin.subscription.change_tier',
  'admin.api_key.revoke',
  // Customer actions
  'customer.api_key.create',
  'customer.api_key.revoke',
  'customer.subscription.upgrade',
  'customer.subscription.downgrade',
  'customer.profile.update',
  'customer.password.change',
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

/**
 * users — Autenticação e perfil de todos os usuários (customers e admins)
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    role: userRoleEnum('role').notNull().default('customer'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailUniqueIdx: uniqueIndex('users_email_unique_idx').on(table.email),
  })
);

/**
 * refresh_tokens — Tokens de refresh para renovação de JWT sem re-login
 * Armazenados como hash SHA-256 para segurança
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(), // SHA-256 hash do token real
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index('refresh_tokens_user_id_idx').on(table.userId),
    tokenHashUniqueIdx: uniqueIndex('refresh_tokens_token_hash_unique_idx').on(
      table.tokenHash
    ),
  })
);

/**
 * subscriptions — Planos de assinatura por usuário
 * Cada usuário tem no máximo uma assinatura ativa por vez
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tier: subscriptionTierEnum('tier').notNull(),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    startsAt: timestamp('starts_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }), // null = mensal sem expiração definida
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }), // apenas para tier=trial
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedReason: text('suspended_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index('subscriptions_user_id_idx').on(table.userId),
    statusIdx: index('subscriptions_status_idx').on(table.status),
  })
);

/**
 * api_keys — Chaves de autenticação para consumo da API
 * O token real (vxa_<hex>) é exibido apenas na criação; apenas o hash é armazenado
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(
      () => subscriptions.id,
      { onDelete: 'set null' }
    ),
    label: varchar('label', { length: 100 }).notNull(),
    environment: apiKeyEnvironmentEnum('environment')
      .notNull()
      .default('production'),
    keyHash: text('key_hash').notNull(), // SHA-256 do token completo vxa_<hex>
    keyPrefix: varchar('key_prefix', { length: 12 }).notNull(), // primeiros 12 chars para identificação: vxa_abc123...
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index('api_keys_user_id_idx').on(table.userId),
    keyHashUniqueIdx: uniqueIndex('api_keys_key_hash_unique_idx').on(
      table.keyHash
    ),
    keyPrefixIdx: index('api_keys_key_prefix_idx').on(table.keyPrefix),
  })
);

/**
 * transcriptions — Histórico completo de transcrições realizadas
 * Cada chamada a POST /v1/transcribe gera um registro
 */
export const transcriptions = pgTable(
  'transcriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    apiKeyId: uuid('api_key_id').references(() => apiKeys.id, {
      onDelete: 'set null',
    }),
    status: transcriptionStatusEnum('status').notNull().default('pending'),
    // Input metadata
    originalFilename: varchar('original_filename', { length: 255 }),
    fileSizeBytes: integer('file_size_bytes'),
    mimeType: varchar('mime_type', { length: 100 }),
    audioDurationSeconds: real('audio_duration_seconds'),
    // Output
    transcribedText: text('transcribed_text'),
    detectedLanguage: varchar('detected_language', { length: 10 }),
    languageConfidence: real('language_confidence'),
    // Performance
    processingTimeMs: integer('processing_time_ms'),
    // Error info
    errorMessage: text('error_message'),
    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    userIdIdx: index('transcriptions_user_id_idx').on(table.userId),
    createdAtIdx: index('transcriptions_created_at_idx').on(table.createdAt),
    userIdCreatedAtIdx: index('transcriptions_user_id_created_at_idx').on(
      table.userId,
      table.createdAt
    ),
  })
);

/**
 * usage_logs — Log granular de uso para rate limiting e métricas de billing
 * Uma linha por request autenticado à API
 */
export const usageLogs = pgTable(
  'usage_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    apiKeyId: uuid('api_key_id').references(() => apiKeys.id, {
      onDelete: 'set null',
    }),
    transcriptionId: uuid('transcription_id').references(
      () => transcriptions.id,
      { onDelete: 'set null' }
    ),
    endpoint: varchar('endpoint', { length: 100 }).notNull(),
    httpMethod: varchar('http_method', { length: 10 }).notNull(),
    statusCode: integer('status_code').notNull(),
    requestIp: varchar('request_ip', { length: 45 }),
    userAgent: text('user_agent'),
    responseTimeMs: integer('response_time_ms'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index('usage_logs_user_id_idx').on(table.userId),
    createdAtIdx: index('usage_logs_created_at_idx').on(table.createdAt),
    // Índice para rate limiting: user + window de tempo
    userIdCreatedAtIdx: index('usage_logs_user_id_created_at_idx').on(
      table.userId,
      table.createdAt
    ),
  })
);

/**
 * audit_logs — Registro imutável de ações críticas para compliance e segurança
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorRole: userRoleEnum('actor_role').notNull(),
    targetUserId: uuid('target_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: auditActionEnum('action').notNull(),
    resourceType: varchar('resource_type', { length: 50 }),
    resourceId: uuid('resource_id'),
    metadata: text('metadata'), // JSON stringificado com detalhes da ação
    requestIp: varchar('request_ip', { length: 45 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    actorIdIdx: index('audit_logs_actor_id_idx').on(table.actorId),
    targetUserIdIdx: index('audit_logs_target_user_id_idx').on(
      table.targetUserId
    ),
    createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
  })
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many, one }) => ({
  refreshTokens: many(refreshTokens),
  subscription: one(subscriptions, {
    fields: [users.id],
    references: [subscriptions.userId],
  }),
  apiKeys: many(apiKeys),
  transcriptions: many(transcriptions),
  usageLogs: many(usageLogs),
}));

export const subscriptionsRelations = relations(
  subscriptions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [subscriptions.userId],
      references: [users.id],
    }),
    apiKeys: many(apiKeys),
  })
);

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
  subscription: one(subscriptions, {
    fields: [apiKeys.subscriptionId],
    references: [subscriptions.id],
  }),
  transcriptions: many(transcriptions),
  usageLogs: many(usageLogs),
}));

export const transcriptionsRelations = relations(transcriptions, ({ one }) => ({
  user: one(users, {
    fields: [transcriptions.userId],
    references: [users.id],
  }),
  apiKey: one(apiKeys, {
    fields: [transcriptions.apiKeyId],
    references: [apiKeys.id],
  }),
}));

export const usageLogsRelations = relations(usageLogs, ({ one }) => ({
  user: one(users, {
    fields: [usageLogs.userId],
    references: [users.id],
  }),
  apiKey: one(apiKeys, {
    fields: [usageLogs.apiKeyId],
    references: [apiKeys.id],
  }),
  transcription: one(transcriptions, {
    fields: [usageLogs.transcriptionId],
    references: [transcriptions.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorId],
    references: [users.id],
  }),
  targetUser: one(users, {
    fields: [auditLogs.targetUserId],
    references: [users.id],
  }),
}));
```

---

## 5. Estrutura de Pastas

```
voxa-api/
├── src/
│   ├── app.ts                      # Configuração do Express (middlewares, rotas, error handler)
│   ├── server.ts                   # Entry point: inicia o servidor, graceful shutdown
│   │
│   ├── config/
│   │   ├── env.ts                  # Validação de env vars com Zod (falha hard se inválido)
│   │   └── db.ts                   # Configuração da conexão Drizzle + PostgreSQL
│   │
│   ├── db/
│   │   ├── schema.ts               # Schema Drizzle completo (tabelas, enums, relations)
│   │   ├── migrate.ts              # Script de migração programática
│   │   └── seed.ts                 # Seed inicial (admin user, planos de teste)
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts      # POST /register, /login, /refresh, /logout
│   │   │   ├── auth.controller.ts  # Validação Zod, chamada ao service
│   │   │   ├── auth.service.ts     # Lógica de registro, login, refresh tokens
│   │   │   ├── auth.repository.ts  # Queries de users e refresh_tokens
│   │   │   ├── auth.schemas.ts     # Zod schemas: RegisterDto, LoginDto
│   │   │   └── auth.test.ts        # Testes unitários e de integração
│   │   │
│   │   ├── transcription/
│   │   │   ├── transcription.routes.ts     # POST /v1/transcribe
│   │   │   ├── transcription.controller.ts
│   │   │   ├── transcription.service.ts    # Integração faster-whisper, validações
│   │   │   ├── transcription.repository.ts # CRUD transcriptions + usage_logs
│   │   │   ├── transcription.schemas.ts
│   │   │   └── transcription.test.ts
│   │   │
│   │   ├── api-keys/
│   │   │   ├── api-keys.routes.ts          # GET/POST/DELETE /v1/keys
│   │   │   ├── api-keys.controller.ts
│   │   │   ├── api-keys.service.ts         # Geração vxa_<hex>, hash SHA-256
│   │   │   ├── api-keys.repository.ts
│   │   │   ├── api-keys.schemas.ts
│   │   │   └── api-keys.test.ts
│   │   │
│   │   ├── subscriptions/
│   │   │   ├── subscriptions.routes.ts     # GET/POST /v1/subscriptions
│   │   │   ├── subscriptions.controller.ts
│   │   │   ├── subscriptions.service.ts    # Trial criação, upgrade/downgrade
│   │   │   ├── subscriptions.repository.ts
│   │   │   ├── subscriptions.schemas.ts
│   │   │   └── subscriptions.test.ts
│   │   │
│   │   ├── dashboard/
│   │   │   ├── dashboard.routes.ts         # GET /v1/dashboard/* (customer)
│   │   │   ├── dashboard.controller.ts
│   │   │   ├── dashboard.service.ts        # Agregações de uso, histórico
│   │   │   ├── dashboard.repository.ts
│   │   │   └── dashboard.test.ts
│   │   │
│   │   └── admin/
│   │       ├── admin.routes.ts             # GET/POST/PATCH /v1/admin/*
│   │       ├── admin.controller.ts
│   │       ├── admin.service.ts            # Gestão de clientes, audit log
│   │       ├── admin.repository.ts
│   │       ├── admin.schemas.ts
│   │       └── admin.test.ts
│   │
│   ├── middlewares/
│   │   ├── authenticate.ts         # Verifica JWT Bearer token
│   │   ├── authenticate-api-key.ts # Verifica API Key vxa_* no header
│   │   ├── authorize.ts            # Guard de role (customer/admin)
│   │   ├── page-guard.ts           # Bloqueia acesso sem assinatura ativa
│   │   ├── rate-limit.ts           # Rate limiting por tier de assinatura
│   │   ├── request-id.ts           # Injeta x-request-id em cada request
│   │   └── error-handler.ts        # Handler global de erros tipados
│   │
│   ├── lib/
│   │   ├── logger.ts               # Instância pino configurada
│   │   ├── jwt.ts                  # Helpers signAccessToken, signRefreshToken, verify
│   │   ├── crypto.ts               # generateApiKey(), hashToken(), compareToken()
│   │   ├── whisper.ts              # Wrapper para subprocess faster-whisper
│   │   └── errors.ts               # Classes de erro de domínio tipadas
│   │
│   └── types/
│       ├── express.d.ts            # Extensão do Request (user, subscription, apiKey)
│       └── index.ts                # Tipos de domínio compartilhados
│
├── tests/
│   ├── helpers/
│   │   ├── test-db.ts              # Setup/teardown do banco de testes
│   │   ├── factories.ts            # Factories para criar entidades nos testes
│   │   └── app-instance.ts         # Instância Express para supertest
│   └── integration/
│       └── transcription.integration.test.ts
│
├── drizzle/
│   └── migrations/                 # Arquivos SQL gerados pelo Drizzle Kit
│
├── docker/
│   ├── Dockerfile                  # Multi-stage build (builder + runtime)
│   └── docker-compose.yml          # App + PostgreSQL + volumes
│
├── .github/
│   └── workflows/
│       └── ci.yml                  # Lint + build + test em cada PR
│
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── vitest.config.ts
├── .env.example
├── .eslintrc.json
├── .prettierrc
└── CLAUDE.md
```

---

## 6. Workflow de Desenvolvimento

### Criando um Novo Módulo

Siga este template para cada novo módulo. Exemplo com módulo `payments` (hipotético):

#### 1. Repository — Acesso ao banco

```typescript
// src/modules/payments/payments.repository.ts
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/db';
import { payments, NewPayment, Payment } from '../../db/schema';

export class PaymentsRepository {
  async findById(id: string): Promise<Payment | undefined> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .limit(1);
    return payment;
  }

  async findByUserId(userId: string): Promise<Payment[]> {
    return db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt));
  }

  async create(data: NewPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values(data).returning();
    return payment;
  }

  async update(id: string, data: Partial<Payment>): Promise<Payment> {
    const [payment] = await db
      .update(payments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
    return payment;
  }
}
```

#### 2. Service — Lógica de negócio

```typescript
// src/modules/payments/payments.service.ts
import { PaymentsRepository } from './payments.repository';
import { NotFoundError, ValidationError } from '../../lib/errors';

export class PaymentsService {
  constructor(private readonly paymentsRepo: PaymentsRepository) {}

  async getPaymentById(id: string, requestingUserId: string) {
    const payment = await this.paymentsRepo.findById(id);
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }
    if (payment.userId !== requestingUserId) {
      throw new ValidationError('Access denied');
    }
    return payment;
  }
}
```

#### 3. Controller — Req/Res handling

```typescript
// src/modules/payments/payments.controller.ts
import { Request, Response, NextFunction } from 'express';
import { PaymentsService } from './payments.service';
import { GetPaymentSchema } from './payments.schemas';

export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = GetPaymentSchema.parse(req.params);
      const payment = await this.paymentsService.getPaymentById(
        id,
        req.user.id
      );
      return res.json({ data: payment });
    } catch (error) {
      next(error);
    }
  }
}
```

#### 4. Routes — Registro de rotas

```typescript
// src/modules/payments/payments.routes.ts
import { Router } from 'express';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { authenticate } from '../../middlewares/authenticate';

const repo = new PaymentsRepository();
const service = new PaymentsService(repo);
const controller = new PaymentsController(service);

export const paymentsRouter = Router();

paymentsRouter.use(authenticate); // protege todas as rotas deste módulo

paymentsRouter.get('/:id', controller.getById.bind(controller));
```

#### 5. Registro em app.ts

```typescript
// src/app.ts
import { paymentsRouter } from './modules/payments/payments.routes';

app.use('/api/v1/payments', paymentsRouter);
```

### Erros de Domínio

```typescript
// src/lib/errors.ts
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}
```

---

## 7. Padrões de API

### Convenções RESTful

| Método | Rota | Ação |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Criar conta |
| `POST` | `/api/v1/auth/login` | Login, retorna JWT |
| `POST` | `/api/v1/auth/refresh` | Renovar access token |
| `POST` | `/api/v1/auth/logout` | Revogar refresh token |
| `POST` | `/api/v1/transcribe` | Criar transcrição (API Key) |
| `GET` | `/api/v1/keys` | Listar API Keys do usuário |
| `POST` | `/api/v1/keys` | Criar nova API Key |
| `DELETE` | `/api/v1/keys/:id` | Revogar API Key |
| `GET` | `/api/v1/dashboard/usage` | Uso do mês atual |
| `GET` | `/api/v1/dashboard/transcriptions` | Histórico de transcrições |
| `GET` | `/api/v1/dashboard/transcriptions/:id` | Detalhe de uma transcrição |
| `GET` | `/api/v1/dashboard/profile` | Perfil do usuário |
| `PUT` | `/api/v1/dashboard/profile` | Atualizar perfil |
| `GET` | `/api/v1/subscriptions/current` | Assinatura ativa |
| `POST` | `/api/v1/subscriptions/upgrade` | Upgrade de plano |
| `GET` | `/api/v1/admin/customers` | Listar todos clientes |
| `GET` | `/api/v1/admin/customers/:id` | Detalhe de um cliente |
| `PATCH` | `/api/v1/admin/customers/:id/subscription` | Alterar assinatura |
| `GET` | `/api/v1/admin/audit-logs` | Log de auditoria |
| `GET` | `/health` | Health check (público) |

### Formato de Resposta — Sucesso

```json
// Recurso único
{
  "data": {
    "id": "uuid",
    "transcribedText": "Olá, este é o texto transcrito...",
    "detectedLanguage": "pt",
    "languageConfidence": 0.98,
    "audioDurationSeconds": 142.5,
    "processingTimeMs": 3200,
    "createdAt": "2026-02-21T00:00:00.000Z"
  }
}

// Lista com paginação
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 87,
    "totalPages": 5
  }
}

// Ação sem retorno de dado
{
  "message": "API key revoked successfully"
}
```

### Formato de Resposta — Erro

```json
// Erro simples
{
  "error": "Unauthorized",
  "code": "UNAUTHORIZED"
}

// Erro de validação com detalhes
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "field": "email", "message": "Invalid email format" },
    { "field": "password", "message": "Password must be at least 8 characters" }
  ]
}

// Rate limit
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 60
}
```

### Headers de Rate Limit

Todo response do endpoint `/v1/transcribe` inclui:

```
X-RateLimit-Limit: 60         # limite do tier
X-RateLimit-Remaining: 45     # requests restantes na janela atual
X-RateLimit-Reset: 1740095460 # Unix timestamp do reset da janela
```

### Autenticação

```
# Dashboard e gestão de keys (JWT)
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

# Endpoint de transcrição (API Key)
Authorization: Bearer vxa_a1b2c3d4e5f6...
# ou via header customizado:
X-API-Key: vxa_a1b2c3d4e5f6...
```

---

## 8. Sprint Plan

| Sprint | Issue | Título | Modo | Estimativa | Dependências |
|--------|-------|--------|------|------------|--------------|
| **Sprint 1** | #1 | [SETUP] Configuração inicial do projeto: TypeScript, linting, testes e CI/CD | sequential | 2 dias | — |
| **Sprint 1** | #2 | [DATABASE] Schema do banco de dados: usuários, assinaturas, API keys, transcrições e logs | sequential | 2 dias | #1 |
| **Sprint 1** | #3 | [AUTH] Autenticação JWT, roles (customer/admin) e proteção contra brute-force | sequential | 3 dias | #1, #2 |
| **Sprint 2** | #4 | [FEATURE] Endpoint core de transcrição de áudio via faster-whisper (POST /v1/transcribe) | parallel | 4 dias | #1, #2, #3 |
| **Sprint 2** | #5 | [FEATURE] Gerenciamento de API Keys: geração segura, listagem, rotulagem e revogação | parallel | 2 dias | #1, #2, #3 |
| **Sprint 2** | #9 | [FEATURE] Sistema de assinaturas: trial, planos, page guard e controle de acesso | parallel | 3 dias | #1, #2, #3 |
| **Sprint 2** | #6 | [FEATURE] Rate limiting por tier de assinatura com headers X-RateLimit-* padronizados | sequential (blocked) | 2 dias | #4, #5 |
| **Sprint 2** | #7 | [FEATURE] Dashboard do cliente: uso, histórico de transcrições e gerenciamento de perfil | sequential (blocked) | 3 dias | #4, #5 |
| **Sprint 3** | #8 | [FEATURE] Dashboard admin: gestão de clientes, controle de assinaturas e audit log | sequential | 3 dias | #7, #5, #9 |
| **Sprint 3** | #10 | [DEVOPS] Docker, logs estruturados com pino, health checks e graceful shutdown | sequential | 2 dias | todos acima |
| **Sprint 3** | #11 | [DOCS] Swagger/OpenAPI completo e landing page do produto | sequential | 3 dias | todos acima |

**Total:** 11 issues | 3 sprints | ~29 dias de desenvolvimento

### Grafo de Dependências

```
#1 (SETUP)
    ├── #2 (DATABASE)
    │       └── #3 (AUTH)
    │               ├── #4 (TRANSCRIBE) ──┬── #6 (RATE LIMIT)
    │               ├── #5 (API KEYS)  ──┘└── #7 (DASH CLIENT)
    │               └── #9 (SUBSCRIPTIONS)          └── #8 (ADMIN DASH)
    │                                                        └── #10 (DEVOPS)
    │                                                                └── #11 (DOCS)
```

---

## 9. Variáveis de Ambiente

```bash
# .env.example

# ─── Server ───────────────────────────────────────────────────
PORT=3000                           # Obrigatório | Porta HTTP do servidor
NODE_ENV=development                # Obrigatório | development | production | test

# ─── Database ─────────────────────────────────────────────────
DATABASE_URL=postgresql://voxa:voxa_password@localhost:5432/voxa_db
                                    # Obrigatório | Connection string PostgreSQL completa

# ─── JWT ──────────────────────────────────────────────────────
JWT_SECRET=your_super_secret_key_min_32_chars_here
                                    # Obrigatório | Mínimo 32 caracteres; gerar com: openssl rand -hex 32
JWT_ACCESS_TOKEN_EXPIRES_IN=15m     # Opcional  | Default: 15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d     # Opcional  | Default: 7d

# ─── Whisper ──────────────────────────────────────────────────
WHISPER_MODEL=small                 # Opcional  | tiny | base | small | medium | large-v3
WHISPER_DEVICE=cpu                  # Opcional  | cpu | cuda
WHISPER_COMPUTE_TYPE=int8           # Opcional  | int8 | int8_float16 | float16

# ─── Rate Limiting ────────────────────────────────────────────
RATE_LIMIT_TRIAL_RPM=20             # Opcional  | Default: 20 req/min para tier trial
RATE_LIMIT_BASIC_RPM=60             # Opcional  | Default: 60 req/min para tier basic
RATE_LIMIT_PRO_RPM=300              # Opcional  | Default: 300 req/min para tier pro

# ─── Subscriptions ────────────────────────────────────────────
TRIAL_DURATION_DAYS=7               # Opcional  | Default: 7 dias

# ─── Logging ──────────────────────────────────────────────────
LOG_LEVEL=info                      # Opcional  | trace | debug | info | warn | error

# ─── API Keys ─────────────────────────────────────────────────
API_KEY_PREFIX=vxa_                 # Opcional  | Default: vxa_
API_KEY_LENGTH=32                   # Opcional  | Default: 32 bytes hex = 64 chars
```

### Validação de Env (fail-fast no start)

```typescript
// src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().transform(Number).default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  WHISPER_MODEL: z.enum(['tiny', 'base', 'small', 'medium', 'large-v3']).default('small'),
  RATE_LIMIT_TRIAL_RPM: z.string().transform(Number).default('20'),
  RATE_LIMIT_BASIC_RPM: z.string().transform(Number).default('60'),
  RATE_LIMIT_PRO_RPM: z.string().transform(Number).default('300'),
  TRIAL_DURATION_DAYS: z.string().transform(Number).default('7'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
```

---

## 10. Setup Local

### Pré-requisitos

- Node.js 20+
- PostgreSQL 15+
- Python 3.9+ com `faster-whisper` instalado
- `gh` CLI autenticado (para clonar repositório privado)

### Passo a Passo

```bash
# 1. Clonar o repositório
git clone https://github.com/AndreClawdTeam/voxa-api.git
cd voxa-api

# 2. Instalar dependências Node.js
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações locais:
# - DATABASE_URL com sua instância PostgreSQL
# - JWT_SECRET (min 32 chars): openssl rand -hex 32

# 4. Instalar faster-whisper (Python)
pip install faster-whisper
# Ou em ambiente isolado:
python3 -m venv .venv && source .venv/bin/activate && pip install faster-whisper

# 5. Criar banco de dados PostgreSQL
createdb voxa_db
# Ou via psql:
psql -c "CREATE DATABASE voxa_db;"

# 6. Rodar migrações
npm run db:migrate
# Gera e aplica as migrações do Drizzle para o banco

# 7. Popular dados iniciais (seed)
npm run db:seed
# Cria: admin user (admin@voxa.dev / admin123), planos de teste

# 8. Iniciar servidor em modo desenvolvimento
npm run dev
# Servidor disponível em http://localhost:3000
# Swagger UI disponível em http://localhost:3000/api/docs

# ─── Scripts disponíveis ──────────────────────────────────────

npm run dev          # Inicia com tsx watch (hot reload)
npm run build        # Compila TypeScript para dist/
npm start            # Inicia o build compilado (produção)
npm test             # Roda todos os testes com Vitest
npm run test:watch   # Testes em modo watch
npm run test:coverage # Relatório de cobertura
npm run lint         # ESLint
npm run lint:fix     # ESLint com auto-fix
npm run format       # Prettier
npm run db:generate  # Gera migrações Drizzle a partir do schema
npm run db:migrate   # Aplica migrações pendentes
npm run db:studio    # Abre Drizzle Studio (GUI do banco)
npm run db:seed      # Popula banco com dados iniciais

# ─── Com Docker Compose ──────────────────────────────────────
docker compose up -d          # Sobe PostgreSQL + App
docker compose logs -f app    # Logs do app
docker compose down -v        # Para e remove volumes
```

### Verificação Rápida

```bash
# Health check
curl http://localhost:3000/health
# { "status": "ok", "uptime": 42, "database": "connected", "whisper": "available" }

# Registrar usuário
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Dev User","email":"dev@test.com","password":"senha123"}'

# Login e obter JWT
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@test.com","password":"senha123"}'
```

---

## 11. Testes

### Estratégia

```
┌─────────────────────────────────────────────────────────────────┐
│                    Pirâmide de Testes                            │
│                                                                  │
│                        ╔═══════╗                                 │
│                        ║  E2E  ║  (opcional — Playwright)        │
│                      ╔═╩═══════╩═╗                              │
│                      ║INTEGRATION║  supertest + test DB          │
│                    ╔═╩═══════════╩═╗                            │
│                    ║     UNIT      ║  services + repos mockados  │
│                    ╚═══════════════╝                            │
└─────────────────────────────────────────────────────────────────┘
```

- **Unit Tests** — testam Services isolados com repositories mockados via `vi.mock()`
- **Integration Tests** — testam Controllers via supertest com banco PostgreSQL de teste real
- **Cobertura mínima:** 80% em statements, branches e functions
- **Banco de teste:** variável `DATABASE_URL` com `_test` suffix, resetada antes de cada suite

### Exemplo Concreto — TranscriptionService

```typescript
// src/modules/transcription/transcription.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranscriptionService } from './transcription.service';
import { TranscriptionRepository } from './transcription.repository';
import { WhisperClient } from '../../lib/whisper';
import { ForbiddenError, ValidationError } from '../../lib/errors';

// Mock das dependências externas
vi.mock('./transcription.repository');
vi.mock('../../lib/whisper');

describe('TranscriptionService', () => {
  let service: TranscriptionService;
  let repoMock: TranscriptionRepository;
  let whisperMock: WhisperClient;

  beforeEach(() => {
    repoMock = new TranscriptionRepository() as jest.Mocked<TranscriptionRepository>;
    whisperMock = new WhisperClient() as jest.Mocked<WhisperClient>;
    service = new TranscriptionService(repoMock, whisperMock);
  });

  describe('transcribe()', () => {
    const mockUser = {
      id: 'user-uuid',
      subscription: { tier: 'basic' as const, status: 'active' as const },
    };

    const mockFile = {
      originalname: 'audio.mp3',
      mimetype: 'audio/mpeg',
      size: 1024 * 1024, // 1MB
      buffer: Buffer.from('fake audio data'),
    };

    it('should transcribe audio and persist result', async () => {
      const whisperResult = {
        text: 'Olá, este é o texto transcrito.',
        language: 'pt',
        confidence: 0.97,
        durationSeconds: 45.2,
      };

      vi.mocked(whisperMock.transcribe).mockResolvedValue(whisperResult);
      vi.mocked(repoMock.create).mockResolvedValue({
        id: 'transcription-uuid',
        userId: mockUser.id,
        status: 'completed',
        transcribedText: whisperResult.text,
        detectedLanguage: whisperResult.language,
        languageConfidence: whisperResult.confidence,
        audioDurationSeconds: whisperResult.durationSeconds,
        processingTimeMs: 1500,
        createdAt: new Date(),
        completedAt: new Date(),
      } as any);

      const result = await service.transcribe(mockUser, mockFile as any, 'key-uuid');

      expect(whisperMock.transcribe).toHaveBeenCalledWith(
        mockFile.buffer,
        mockFile.mimetype
      );
      expect(repoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          status: 'completed',
          transcribedText: whisperResult.text,
        })
      );
      expect(result.transcribedText).toBe(whisperResult.text);
      expect(result.detectedLanguage).toBe('pt');
    });

    it('should reject files larger than 25MB', async () => {
      const largeFile = { ...mockFile, size: 26 * 1024 * 1024 };

      await expect(
        service.transcribe(mockUser, largeFile as any, 'key-uuid')
      ).rejects.toThrow(ValidationError);

      expect(whisperMock.transcribe).not.toHaveBeenCalled();
    });

    it('should reject unsupported audio formats', async () => {
      const invalidFile = { ...mockFile, mimetype: 'video/avi' };

      await expect(
        service.transcribe(mockUser, invalidFile as any, 'key-uuid')
      ).rejects.toThrow(ValidationError);
    });

    it('should reject request if subscription is suspended', async () => {
      const suspendedUser = {
        ...mockUser,
        subscription: { tier: 'basic' as const, status: 'suspended' as const },
      };

      await expect(
        service.transcribe(suspendedUser, mockFile as any, 'key-uuid')
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
```

### Exemplo — Integration Test com supertest

```typescript
// tests/integration/transcription.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { createTestDb, teardownTestDb, seedTestUser } from '../helpers/test-db';

describe('POST /api/v1/transcribe (integration)', () => {
  let apiKey: string;

  beforeAll(async () => {
    await createTestDb();
    const { user, key } = await seedTestUser({ tier: 'pro' });
    apiKey = key.rawToken; // Token completo vxa_... retornado apenas no seed
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('should return 401 without API key', async () => {
    const res = await request(app)
      .post('/api/v1/transcribe')
      .attach('audio', Buffer.from('fake'), 'test.mp3');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('should return 400 for invalid audio format', async () => {
    const res = await request(app)
      .post('/api/v1/transcribe')
      .set('Authorization', `Bearer ${apiKey}`)
      .attach('audio', Buffer.from('fake'), { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return rate limit headers on successful request', async () => {
    // Note: requires faster-whisper available in test environment or mocked
    const res = await request(app)
      .post('/api/v1/transcribe')
      .set('Authorization', `Bearer ${apiKey}`)
      .attach('audio', 'tests/fixtures/sample.mp3');

    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });
});
```

### Comandos

```bash
npm test                    # Todos os testes (unit + integration)
npm run test:watch          # Watch mode para desenvolvimento
npm run test:coverage       # Cobertura com relatório em /coverage
npm run test:unit           # Apenas testes unitários (src/**/*.test.ts)
npm run test:integration    # Apenas testes de integração (tests/integration/)
```

---

## 12. Decisões Técnicas

### ADR-001: Express sobre Fastify

**Status:** Aceito

**Contexto:** Fastify tem performance superior (2-3x throughput) mas curva de aprendizado maior para plugins e decorators.

**Decisão:** Express — ecossistema maduro, maior familiaridade do time, e a performance do throughput HTTP não é gargalo para este produto (o gargalo é a CPU do faster-whisper).

**Consequências:** Código mais simples, maior quantidade de exemplos e stackoverflow, mas sem suporte nativo a async/await no router (precisa de try/catch explícito ou wrapper asyncHandler).

---

### ADR-002: Drizzle ORM sobre Prisma

**Status:** Aceito

**Contexto:** Prisma é mais popular, tem CLI excelente e model layer intuitivo. Drizzle é mais recente.

**Decisão:** Drizzle ORM — schema definido em TypeScript (não em um DSL proprietário), migrações em SQL puro (legíveis e versionáveis), sem geração de código em runtime, sem `prisma generate`. O tipo inferido do Drizzle é idêntico ao schema — zero boilerplate de sincronização.

**Consequências:** Queries mais verbosas que Prisma mas 100% type-safe. Sem query builder mágico — o que você vê no código é exatamente o SQL gerado.

---

### ADR-003: Faster-whisper via subprocess Python

**Status:** Aceito

**Contexto:** Existem bindings Node.js para whisper (whisper.cpp via N-API), mas são instáveis e com suporte limitado a modelos recentes.

**Decisão:** Chamar faster-whisper via subprocess Python. O script Python é simples (< 20 linhas), a comunicação é via stdin/stdout JSON, e o modelo faster-whisper roda eficientemente em CPU com CTranslate2.

**Consequências:** Dependência de Python no ambiente de produção. Custo de fork de processo por transcrição (~50ms). Isolamento total — um crash no whisper não derruba o processo Node.js. Versionamento independente do modelo Whisper.

---

### ADR-004: JWT stateless com refresh tokens no banco

**Status:** Aceito

**Contexto:** Access tokens de longa duração são simples mas inseguros (não é possível revogar sem blacklist). Tokens 100% stateful requerem lookup no banco a cada request.

**Decisão:** Padrão híbrido — access token JWT de 15 minutos (verificado apenas com a secret, sem DB), refresh token de 7 dias armazenado como hash SHA-256 no banco. Revogação de sessão individual possível via refresh token. Balance correto entre performance e segurança.

**Consequências:** Dashboard e painel admin usam JWT. API de transcrição usa API Key (lookup no banco a cada request, necessário para verificar tier e subscription status). Dois sistemas de auth separados por contexto de uso.

---

### ADR-005: Rate limiting em memória (sem Redis)

**Status:** Aceito (com revisão planejada para v2)

**Contexto:** Redis adiciona complexidade operacional significativa. Rate limiting em memória não funciona com múltiplas instâncias horizontais.

**Decisão:** Para v1, implementar rate limiting com `express-rate-limit` em memória. A arquitetura de deployment inicial é single-instance (CPU para whisper é um gargalo natural — escalar horizontalmente requer fila de jobs).

**Consequências:** Se escalar horizontalmente na v2, será necessário migrar para Redis com `rate-limit-redis`. A interface do `express-rate-limit` suporta stores customizáveis — a migração é cirúrgica (trocar a store, não reescrever a lógica).

---

### ADR-006: Zod para validação de input e env vars

**Status:** Aceito

**Contexto:** Alternativas: class-validator (require decorators e instâncias de classe), joi (sem TypeScript inference nativa), yup (similar ao Zod mas com API menos ergonômica).

**Decisão:** Zod — inferência TypeScript automática (`z.infer<typeof schema>`), validação de env vars no startup com fail-fast, schemas como single source of truth para tipos de DTO. Compatível com ESM sem configurações especiais.

**Consequências:** Tipos de request/response são derivados automaticamente dos schemas Zod. Mudança de schema reflete automaticamente nos tipos TypeScript — zero drift entre validação e tipos.

---

### ADR-007: PostgreSQL sobre MongoDB

**Status:** Aceito

**Contexto:** MongoDB seria mais flexível para o objeto de transcrição (campos variáveis por idioma/modelo).

**Decisão:** PostgreSQL — as entidades são bem estruturadas (users, subscriptions, api_keys são relacionais por natureza), queries do dashboard (agregações por período, joins entre transcriptions e usage_logs) são muito mais eficientes com SQL. O JSONB do PostgreSQL absorve qualquer necessidade de campos semi-estruturados.

**Consequências:** Schema migration necessária para mudanças de estrutura. Mas migrações Drizzle são SQL puro — legíveis, versionáveis e reversíveis. Para escala de API com transcrições, PostgreSQL com índices bem definidos é suficiente para milhões de registros.

---

### ADR-008: Pino sobre Winston para logging

**Status:** Aceito

**Contexto:** Winston é a biblioteca de logging mais popular do ecossistema Node.js.

**Decisão:** Pino — 5-10x mais rápido que Winston em benchmarks de throughput (crítico para logging síncrono em cada request), JSON estruturado nativo, integração perfeita com pino-http para correlation ID automático por request.

**Consequências:** Logs são JSON puro em produção (amigável para ELK/Grafana Loki). Em desenvolvimento, usar `pino-pretty` para output legível. O `requestId` (UUID v4 por request) é injetado automaticamente em todos os logs via `pino-http` — rastreabilidade total sem código manual.
