# SupportDesk

SupportDesk is a full-stack customer-support workspace for teams to manage tickets, conversations, assignments, and response-time SLAs. Ticket updates are broadcast to active browser sessions, so the inbox refreshes itself without a page reload.

## Features

- Live ticket inbox with search, status and priority filters
- Overview dashboard with open, urgent, breached-SLA, and resolved ticket metrics
- Create, read, update, and delete tickets
- Assign tickets to workspace agents and manage status/priority
- Ticket conversations, internal notes, and saved replies
- SLA deadlines set automatically by priority
- Workspace-scoped data and owner, agent, and read-only viewer roles
- Responsive interface with readable typography
- Local PostgreSQL-compatible PGlite database; persisted in `server/data`

## Requirements

- Node.js 20.19 or newer
- npm

## Run locally

```bash
npm install
```

Copy `.env.example` to `.env` and set a unique `JWT_SECRET`. Then start both services:

```bash
npm run dev
```

Open the Vite URL printed in the terminal (usually `http://localhost:5173`). The development server starts the API and local PGlite database automatically. The API listens on port `4003`.

## Demo logins

The seeded demo accounts use the same password, `SupportDesk!2026`:

| Role | Email |
| --- | --- |
| Owner | `owner@supportdesk.local` |
| Agent | `priya@supportdesk.local` |
| Agent | `jordan@supportdesk.local` |
| Read-only viewer | `viewer@supportdesk.local` |

Use the owner account to create and delete tickets. Viewers can browse tickets but cannot make changes.

## Verify

```bash
npm run build
npm run test:api
```

The API smoke test expects the development stack to be running. It checks authentication, roles, dashboard data, search and filters, ticket creation, SLA calculation, updates, comments, deletion, and the live event stream.

## Architecture

- **Frontend:** React 19, TypeScript, Vite
- **API:** Node.js, Express 5, Zod validation, JWT session cookies
- **Database:** PGlite with a PostgreSQL wire-protocol socket and `pg` client
- **Live updates:** Server-sent events (SSE)

## API overview

- `GET /api/health`
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/dashboard`, `GET /api/agents`, `GET /api/canned-responses`
- `GET /api/tickets`, `POST /api/tickets`, `GET /api/tickets/:id`
- `PATCH /api/tickets/:id`, `DELETE /api/tickets/:id`
- `POST /api/tickets/:id/comments`
- `GET /api/events` (authenticated SSE stream)

Ticket list query parameters include `q`, `status`, `priority`, `mine=true`, and `view=attention`.

## Notes

The demo seed is inserted only when missing, so restarting the app preserves changes. Keep `.env` and `server/data` out of source control. Set a strong `JWT_SECRET` before deploying and use a production PostgreSQL service for a multi-instance deployment.
