# Workion

A client management platform built on top of [Docmost](https://github.com/docmost/docmost) — an open-source collaborative wiki and documentation engine. Workion layers client-centric features (client spaces, project tracking, kanban boards, per-client access control, and client portals) on top of the Docmost document backbone.

---

## Features

**Inherited from Docmost**
- Real-time collaborative editing
- Hierarchical pages and spaces
- Comments, page history, and file attachments
- Diagrams (Draw.io, Excalidraw, Mermaid)
- Groups and role-based permissions
- Search and embeds

**Added in this fork**
- **Kanban board page** — drag-and-drop board as a page type; columns, cards, assignees, due dates, and priorities stored per-page
- **Whiteboard page** — full-screen tldraw canvas as a page type with real-time multi-user live cursors (Yjs-backed)
- **AI chat (BYOK)** — per-workspace OpenRouter API key; streaming chat panel with current-page context injection and auto-generated thread titles
- Per-client spaces with scoped access control
- Client portal (planned)
- Client user invitations (planned)
- Activity feed per client (planned)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | NestJS |
| Database | PostgreSQL |
| Query builder | Kysely |
| Cache | Redis |
| Job queue | BullMQ |
| Real-time | Hocuspocus + Yjs |
| Whiteboard | tldraw |
| AI | OpenRouter (BYOK) |
| Frontend | React 18 + Vite |
| UI library | Mantine |
| Editor | TipTap |
| Auth | JWT + CASL |

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker (for PostgreSQL and Redis)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/rakibj/workion.git
cd workion

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env with your values

# 3. Install dependencies
pnpm install

# 4. Start PostgreSQL and Redis
docker compose up -d

# 5. Run database migrations
pnpm --filter server run migration:latest

# 6. Start the development server
pnpm run dev
```

App runs at `http://localhost:3000`.

### Environment Variables

```env
APP_URL=http://localhost:3000
APP_SECRET=<long-random-string>
DATABASE_URL=postgresql://docmost:docmost_dev_pass@localhost:5432/docmost
REDIS_URL=redis://localhost:6379
```

---

## Development

```bash
# Start backend only (with watch)
pnpm run server:dev

# Start frontend only
pnpm run client:dev

# Run backend tests
pnpm --filter server run test

# Run frontend tests
pnpm --filter client run test

# Create a new migration
pnpm --filter server run migration:create

# Roll back last migration
pnpm --filter server run migration:down
```

---

## Project Structure

```
docmost/
├── apps/
│   ├── server/          # NestJS backend
│   ├── client/          # React + Vite frontend
│   ├── editor-ext/      # TipTap extensions
│   └── ee/              # Enterprise Edition modules
├── packages/            # Shared packages
├── docker-compose.yml   # Dev: starts PostgreSQL + Redis only
└── docker-compose.prod.yml
```

---

## License

The Docmost core is licensed under [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html).  
Enterprise features in `apps/server/src/ee`, `apps/client/src/ee`, and `packages/ee` are licensed under the Docmost Enterprise license.

This fork's additions are for private use.
