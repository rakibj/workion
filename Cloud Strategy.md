# Cloud Strategy

> Created: 2026-06-02. Updated: 2026-06-02. Update this when infrastructure decisions change.

---

## Project Architecture Summary

### What it is
A fork of [Docmost](https://github.com/docmost/docmost) repurposed as a **client management platform**. Docmost provides the document/wiki backbone; client-centric features (client spaces, portals, project tracking, kanban, access control) are layered on top.

### Monorepo structure
```
docmost/
├── apps/
│   ├── server/       # NestJS backend (primary work area)
│   ├── client/       # React + Vite frontend (primary work area)
│   ├── editor-ext/   # TipTap extensions (black box)
│   └── ee/           # Enterprise Edition modules (black box)
├── packages/         # Shared DB types, editor config
├── docker-compose.yml          # Dev: starts Postgres + Redis only
└── docker-compose.prod.yml     # Prod: full stack with built image
```

### Tech stack
| Layer | Technology |
|---|---|
| Backend | NestJS (modular, DI-based) |
| Database | PostgreSQL |
| Cache / Queue | Redis (BullMQ + cache-manager) |
| Frontend | React 18 + Vite |
| UI | Mantine |
| Editor | TipTap (black box) |
| Real-time collab | Hocuspocus + Yjs (black box) |
| Auth | JWT + CASL (RBAC) |
| Storage | S3-compatible via `StorageService` abstraction |

### Deploy workflow (current)
```
1. git push (local)
2. git pull on server
3. docker compose -f docker-compose.prod.yml up -d --build
4. pnpm --filter server run migration:latest   # only if schema changed
```

### Deploy workflow (future — zero downtime)
```
1. git push → GitHub Actions builds image → pushes to GitHub Container Registry
2. Server pulls prebuilt image (fast, 30-60s downtime vs 5-10min)
3. docker compose up -d
4. migration:latest if schema changed
```
Worth setting up before real clients are on it.

---

## Cloud Strategy

### Architecture decision: stateless VPS + managed services

Running Postgres + Redis + NestJS on a single VPS creates a fragile server — any restart risks data loss or forced downtime. The correct model:

```
VPS (stateless)          Managed services
─────────────────        ──────────────────────────
NestJS app only    →     Postgres (Neon)
+ other apps       →     Redis (Upstash)
                   →     File storage (Cloudflare R2)
```

**Benefits:**
- Server is disposable — if it dies, spin up a new one, point at same managed services, back online in under an hour. No data at risk.
- Managed services handle backups and failover
- Smaller, cheaper VPS needed
- Multiple apps can share the same VPS behind a reverse proxy

---

## Provider Decisions (Locked)

### VPS — Contabo Cloud VPS 10

**Why Contabo over Hetzner:** Hetzner account locked due to verification issues. Contabo resolves this immediately.

| Spec | Value |
|---|---|
| vCPU | 4 cores |
| RAM | 8 GB |
| Storage | 150 GB SSD |
| Cost | ~$5-6/mo |
| Contract | 12 month |

**Headroom:** At idle, NestJS uses ~200-300MB RAM. 8GB comfortably runs 4-6 apps of similar weight alongside Docmost. No upgrade needed for a long time.

**Tradeoff acknowledged:** Contabo benchmarks lower than Hetzner on raw performance. Irrelevant at this scale — the bottleneck will never be the VPS CPU.

**Future migration:** If Hetzner verification resolves, migrating is trivial — app is stateless, data lives on managed services. New server, same setup commands, done.

---

### Managed Postgres — Neon (free tier)

| Detail | Value |
|---|---|
| Storage | 0.5 GB |
| Cost | $0 |
| Upgrade | $19/mo (Neon paid)

**Watch for:** Cold start delays after inactivity on the free tier. First request after a period of no use may take 2-5 seconds while Neon wakes up. Acceptable for now, upgrade when it becomes noticeable to clients.

**Rule:** Never point dev or test `DATABASE_URL` at Neon. Local dev uses the Docker Postgres container. Tests use a separate local database (`docmost_test`). Production is the only thing that touches Neon.

---

### Managed Redis — Upstash (free tier)

| Detail | Value |
|---|---|
| Limit | 10,000 commands/day |
| Cost | $0 |
| Upgrade | $0.20 per 100K commands (pay-per-use) |

**Watch for:** Live cursor / whiteboard features broadcast position updates constantly via Socket.io → Redis pub/sub. This will burn the 10K daily limit fast during active sessions. Monitor from day one via the Upstash dashboard. Upgrade cost is negligible when needed.

---

### File Storage — Cloudflare R2 (free tier → B2 + Cloudflare later)

| Detail | Value |
|---|---|
| Free tier | 10 GB |
| Storage cost | $0.015/GB |
| Egress | $0 (zero egress fees) |
| S3-compatible | Yes |

**Why R2 now:** Zero egress fees, zero CDN setup, works with existing `StorageService` abstraction. Simplest path to production.

**Migration to B2 + Cloudflare when storage exceeds ~50GB:**

B2 storage is $0.006/GB vs R2's $0.015/GB — less than half the cost at scale. B2 egress via Cloudflare is free (bandwidth alliance partnership).

```
Migration path (half a day, no code changes):
1. Create B2 bucket, get credentials
2. rclone copy r2:bucket b2:bucket
3. Point subdomain to Cloudflare, configure B2 pull zone
4. Swap env vars: S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY
5. Restart app — done
```

Both are S3-compatible. `StorageService` abstraction handles it. No code changes needed.

---

## Recommended Stack (Locked)

| Component | Provider | Cost |
|---|---|---|
| App server | Contabo Cloud VPS 10 | ~$5-6/mo |
| Postgres | Neon free tier | $0 |
| Redis | Upstash free tier | $0 |
| File storage | Cloudflare R2 free tier | $0 |
| **Total** | | **~$5-6/mo** |

---

## Multi-app Strategy

The Contabo VPS runs multiple apps behind a single reverse proxy (Caddy). Caddy handles SSL automatically for all domains via Let's Encrypt.

```
Internet
    ↓
Caddy (port 80/443)
    ├── projects.gameloops.io   → Docmost (port 3000)
    ├── n8n.yourdomain.com      → n8n instance (port 5678)
    └── other.yourdomain.com    → future apps (port 3002+)
```

Each app lives in its own directory with its own `docker-compose.yml`. Restarting one app doesn't affect others.

```
/home/user/apps/
  docmost/
    docker-compose.yml
  n8n/
    docker-compose.yml
  caddy/
    docker-compose.yml
    Caddyfile
```

**Current RAM budget (approximate):**
| App | Idle RAM |
|---|---|
| Docmost (NestJS + Hocuspocus) | ~300-500 MB |
| n8n | ~300-400 MB |
| Caddy | ~20 MB |
| Available headroom | ~6.5+ GB |

---

## Database Management Rules

1. **Schema changes always go through migration files** — never run raw SQL manually against Neon.
2. **Migration files are committed to the repo** — the migration history is the source of truth, not the database.
3. **Never edit a migration file after it has been pushed and run** — write a new migration to correct it.
4. **Three database environments, three DATABASE_URLs:**
   - `.env` → local Docker Postgres (dev)
   - `.env.test` → local Postgres `docmost_test` database (tests)
   - `.env` on server → Neon (production)
5. **Schema change deploy sequence:**
   ```
   Write migration → migration:latest → migration:codegen → write repo code → commit → push → migration:latest on server
   ```

---

## What Was Ruled Out

| Option | Reason |
|---|---|
| Oracle Free Tier | Unreliable — instances reclaimed without warning. Not acceptable for client-facing tool. |
| Hetzner | Account locked due to verification issues. Revisit if resolved. |
| Vercel for backend | Architecturally incompatible — NestJS requires a persistent server process. WebSockets, Redis pub/sub, BullMQ, and Hocuspocus all break in serverless. |
| Everything on one VPS | Data coupled to server lifecycle. Stateless app + managed services is the correct separation. |
| DigitalOcean | 3x the cost of Contabo for equivalent specs. Not justified. |

---

## Upgrade Path

| Trigger | Action |
|---|---|
| Neon cold starts noticeable to clients | Upgrade to Neon paid ($19/mo) or switch to Railway Postgres |
| Upstash 10K/day limit hit regularly | Upgrade to Upstash pay-per-use (~cents/mo at small scale) |
| R2 storage exceeds ~50GB | Migrate to B2 + Cloudflare CDN (half-day, no code changes) |
| Deploy downtime becomes unacceptable | Set up GitHub Actions → build image → push to registry → server pulls prebuilt |
| Hetzner verification resolves | Migrate VPS (trivial — stateless app, data on managed services) |