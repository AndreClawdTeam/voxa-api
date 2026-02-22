# DEPLOY.md — Voxa API na VPS

## Ambiente

- **VPS IP:** `138.197.19.184`
- **Porta:** `3000`
- **URL de acesso:** `http://138.197.19.184:3000/`
- **Health check:** `http://138.197.19.184:3000/health`

---

## Banco de Dados

- **Database:** `voxa_db`
- **Engine:** PostgreSQL 16 nativo (serviço `postgresql@16-main`, porta 5432)
- **Connection string:** `postgresql://andre:***@localhost:5432/voxa_db`
- ⚠️ **NUNCA usar Docker para o banco — o PostgreSQL nativo já está rodando**

---

## Credenciais de Seed (criadas pelo `npm run db:seed`)

| Email | Senha | Role | Plan |
|-------|-------|------|------|
| `admin@voxa.dev` | `admin123` | admin | — |
| `test@voxa.dev` | `test123` | customer | basic |

---

## Serviço systemd

- **Nome:** `voxa-api.service`
- **Arquivo:** `/etc/systemd/system/voxa-api.service`
- **Usuário:** `clawdbot`
- **WorkingDirectory:** `/home/clawdbot/.openclaw/workspace/coding/voxa-api/`
- **EnvironmentFile:** `/home/clawdbot/.openclaw/workspace/coding/voxa-api/.env`

### Comandos úteis

```bash
# Status
systemctl status voxa-api

# Logs
journalctl -u voxa-api -f

# Restart
systemctl restart voxa-api
```

---

## Como Atualizar

```bash
cd /home/clawdbot/.openclaw/workspace/coding/voxa-api
git pull
npm ci
npm run build
npm run db:migrate
systemctl restart voxa-api
```

---

## Estrutura de Arquivos

```
/home/clawdbot/.openclaw/workspace/coding/voxa-api/
├── src/           # Código-fonte TypeScript
├── dist/          # Build de produção (gerado pelo npm run build)
├── migrations/    # Migrations Drizzle
├── .env           # Variáveis de ambiente (NÃO commitar)
├── DEPLOY.md      # Este arquivo
└── package.json
```

---

## ⚠️ O que JAMAIS fazer

1. **NUNCA usar Docker para o PostgreSQL** — o banco nativo está disponível e é compartilhado entre todos os projetos.
2. **NUNCA parar ou reiniciar o `postgresql@16-main`** sem autorização explícita do André.
3. **NUNCA rodar `npm run db:seed` com `NODE_ENV=production`** — o seed recusa rodar em produção por segurança.
4. **NUNCA expor a `DATABASE_URL` ou `JWT_SECRET`** — esses valores ficam apenas no `.env`.
5. **NUNCA usar a porta 3001, 3002, 5432, 8765, 8766** — já estão em uso por outros serviços.

---

## Deployment inicial (2026-02-22)

- Banco `voxa_db` criado no PostgreSQL nativo
- Migrations aplicadas com `drizzle-kit migrate`
- Seed executado com `NODE_ENV=development npm run db:seed`
- Build de produção gerado com `npm run build`
- Serviço `voxa-api.service` criado e habilitado no systemd
