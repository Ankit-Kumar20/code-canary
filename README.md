# 🐦 Dependency Canary

AI-powered dependency vulnerability analysis and supply chain security platform. Analyzes your project's entire dependency graph (SBOM) to flag vulnerabilities, supply-chain risks, and generate minimal patch plans.

Won 1st Place Overall + 2nd Place Modal Prize at the [AI Agent & Infra Hackathon](https://ai-agent-infra.devpost.com/) (by Lux Capital, Modal, Cognition, AWS, and Ramp)

Demo video link: https://youtu.be/eLHv1lriGms  
Devpost link: https://devpost.com/software/code-canary

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Modal/Mock    │
│  (Next.js)      │───▶│  API Routes     │───▶│   Services      │
│                 │    │                 │    │                 │
│ • Upload Form   │    │ • /api/scan     │    │ • SBOM Extract  │
│ • Results View  │    │ • /api/enrich   │    │ • Vuln Enrich   │
│ • Dep Graph     │    │ • /api/ask      │    │ • Multi-lang    │
│ • Q&A Panel     │    │ • /api/report   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   AI Agent      │
                       │                 │
                       │ • RAG Pipeline  │
                       │ • Vector Store  │
                       │ • LLM Reasoning │
                       │ • Patch Plans   │
                       └─────────────────┘
```

## 📦 Monorepo Structure

```
dependency-canary/
├── apps/
│   ├── web/                 # Next.js frontend (port 3000)
│   └── api/                 # API backend (port 3001)
├── packages/
│   ├── shared/              # TypeScript types & API clients
│   └── agent/               # RAG agent & vector processing
└── README.md
```

## 🚀 Getting Started (Contributors)

### Prerequisites

- Node.js 18+
- pnpm 8+ (`corepack enable` or `npm i -g pnpm@8`)
- Python 3.10+ (`python3` must be on your PATH; the API calls it for real repo scans)
- Git
- Optional: OpenAI API key, Modal account

### 1. Clone and install JavaScript dependencies

```bash
git clone <your-repo-url>
cd code-canary
pnpm install
```

### 2. Set up Python (used by the API's scanner bridge)

In development the API runs `python3 apps/api/python/bridge.py` to analyze real repositories, so install its dependencies in a virtualenv:

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r apps/api/requirements.txt
```

Keep the virtualenv activated in the terminal where you run `pnpm dev`, so the API spawns the right `python3`. If the bridge fails, the API falls back to mock data.

### 3. Configure environment variables

Next.js reads env files from each app's own folder, not the repo root. Copy the template into both apps:

```bash
cp .env.example apps/api/.env.local
cp .env.example apps/web/.env.local
```

`DATABASE_URL` and `BETTER_AUTH_SECRET` are required (see steps 4 and 5). Everything else is optional; leave it empty to run on mock data.

| Variable | Purpose |
|---|---|
| `MODAL_BASE_URL`, `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` | Real Modal scan services |
| `OPENAI_API_KEY` | Real embeddings and LLM answers (otherwise mocked) |
| `VECTOR_STORE_TYPE` | Vector store for `pnpm seed:mock` only: `memory` (default), `sqlite`, or `pinecone`. The API always uses Postgres |
| `SQLITE_DB_PATH` | SQLite file when using `sqlite` |
| `PINECONE_API_KEY`, `PINECONE_INDEX` | Pinecone settings |
| `USE_PYTHON_BRIDGE` | `true` to use the Python scanner outside development |
| `SKIP_EMBEDDINGS` | `true` to skip embedding generation |
| `DATABASE_URL` | PostgreSQL connection string (users, sessions, scanned SBOMs) |
| `BETTER_AUTH_SECRET` | Secret for signing sessions; generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | API base URL that serves `/api/auth` (default `http://localhost:3001`) |
| `WEB_ORIGIN` | Web app origin allowed to call the API with cookies (default `http://localhost:3000`) |
| `NEXT_PUBLIC_API_URL` | Web app: API base URL (default `http://localhost:3001`) |

Never commit `.env` or `.env.local` files; they are gitignored.

### 4. Set up PostgreSQL

The API stores users, sessions, scan jobs, scanned SBOMs, and their RAG embeddings in PostgreSQL through [Drizzle ORM](https://orm.drizzle.team). Install PostgreSQL natively (no Docker needed); on macOS:

```bash
brew install postgresql@17
brew services start postgresql@17
psql postgres -c "CREATE ROLE canary LOGIN PASSWORD 'canary';"
psql postgres -c "CREATE DATABASE canary OWNER canary;"
```

Set `DATABASE_URL` in `apps/api/.env.local` (for example `postgres://canary:canary@localhost:5432/canary`), then apply the migrations:

```bash
pnpm db:migrate
```

The schema lives in `apps/api/src/db/schema.ts` and migrations in `apps/api/drizzle/`. After changing the schema, run `db:generate` to create a migration and `db:migrate` to apply it; `db:studio` opens Drizzle Studio.

### 5. Set up authentication

Sign-in uses [Better Auth](https://www.better-auth.com) with email and password. The API app hosts the auth endpoints at `/api/auth/*` and stores accounts in Postgres; the web app shows a sign-in page at `/sign-in` and redirects there when you aren't signed in. All other API routes return `401` without a session.

Add a secret to `apps/api/.env.local`:

```bash
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> apps/api/.env.local
```

The auth tables live in `apps/api/src/db/auth-schema.ts` and are created by `db:migrate`. If you add Better Auth plugins that need new tables, regenerate that file with `npx auth@latest generate --config src/lib/auth.ts --output src/db/auth-schema.ts`, then run `db:generate` and `db:migrate`.

### 6. Build, seed, and run

```bash
pnpm -r build      # build shared packages
pnpm seed:mock     # load mock data
pnpm dev           # web on http://localhost:3000, API on http://localhost:3001
```

Run one app at a time with:

```bash
pnpm --filter @dependency-canary/web dev
pnpm --filter @dependency-canary/api dev
```

### 7. Check your changes before opening a PR

```bash
pnpm typecheck
pnpm lint
pnpm test
```

### Contribution workflow

1. Create a branch: `git checkout -b feature/short-description`
2. Make your changes and run the checks above
3. Commit with a clear message and push your branch
4. Open a pull request describing what changed and how you tested it

Don't commit build output, `node_modules/`, `.venv/`, `__pycache__/`, or secrets.

## 🎯 Usage Workflow

### 1. Upload Project
Navigate to http://localhost:3000 and either:
- Enter a GitHub repository URL
- Upload a ZIP file URL 
- Specify a container image

### 2. Scan & Analysis
The system will:
- Generate SBOM (Software Bill of Materials)
- Enrich with CVE data from NVD, OSV, GHSA
- Analyze supply chain risks
- Index into vector database

### 3. Interactive Analysis
- **KPI Dashboard**: View vulnerability counts, risk scores
- **Dependency Graph**: Interactive visualization with severity color-coding
- **AI Q&A**: Ask natural language questions about vulnerabilities
- **Remediation Plans**: Get prioritized upgrade recommendations

### 4. Generate Reports
Download comprehensive PDF or Markdown reports with:
- Executive summary
- Detailed vulnerability analysis
- Remediation roadmap
- Package inventory

## 🤖 Sample Questions for AI Agent

Try asking these questions in the Q&A panel:

- "What single upgrade removes the most critical CVEs?"
- "Which packages pose the highest supply chain risk?"
- "What are the most dangerous vulnerabilities in my direct dependencies?"
- "How can I reduce my attack surface with minimal changes?"
- "What abandoned packages should I replace first?"
- "Which vulnerabilities have public exploits available?"

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run smoke tests specifically
pnpm --filter @dependency-canary/agent test

# Test with verbose output
pnpm test -- --reporter=verbose
```

### Smoke Test Coverage
- ✅ Mock SBOM generation with realistic vulnerabilities
- ✅ Vector store operations and filtering
- ✅ Agent Q&A functionality with remediation plans
- ✅ End-to-end workflow validation
- ✅ Embedding consistency and document processing

## 📊 Mock Data Details

The mock service provides a realistic test dataset with:
- **8 packages** across npm, PyPI ecosystems
- **5 vulnerabilities** (1 Critical, 2 High, 2 Medium)
- **3 services** (web, api, worker)
- **Supply chain risks** (prototype pollution, SSRF, ReDoS)

Key test packages:
- `axios@0.21.1` - Critical SSRF vulnerability (CVE-2021-3749)
- `lodash@4.17.19` - Prototype pollution (CVE-2020-8203)  
- `urllib3@1.26.5` - ReDoS vulnerability (CVE-2021-33503)

## 🔧 Development

### Adding New Vector Stores

```typescript
// packages/agent/src/vector-stores/custom-store.ts
import { VectorStore, VectorDocument, VectorSearchResult } from '@dependency-canary/shared';

export class CustomVectorStore implements VectorStore {
  async addDocuments(documents: VectorDocument[]): Promise<void> {
    // Implementation
  }
  
  async search(query: VectorStoreQuery): Promise<VectorSearchResult[]> {
    // Implementation
  }
  
  async clear(): Promise<void> {
    // Implementation
  }
}
```

### Adding New Embedders

```typescript
// packages/agent/src/embedders/custom-embedder.ts
import { Embedder } from '@dependency-canary/shared';

export class CustomEmbedder implements Embedder {
  async embed(text: string): Promise<number[]> {
    // Implementation
  }
  
  async embedBatch(texts: string[]): Promise<number[][]> {
    // Implementation
  }
}
```

## 🔗 API Contracts

### Modal Integration Points

```typescript
// Scan endpoint
POST /api/scan
Body: { projectRef: string, refType: "git"|"zip"|"image", ref: string }
Response: { jobId: string }

// Enrich endpoint  
GET /api/enrich?jobId=<jobId>
Response: EnrichedSBOM (see types/sbom.ts)
```

### Internal API Routes

```typescript
// Ask the AI agent
POST /api/ask
Body: { projectId: string, question: string }
Response: AgentAnswer (see types/api.ts)

// Generate reports
GET /api/report?projectId=<id>&format=pdf|markdown
Response: PDF blob or Markdown text
```

## 📈 Performance Notes

- **Vector Store**: The API stores embeddings in Postgres (`vector_documents`); the seed script can use memory, SQLite, or Pinecone
- **Embeddings**: ~1500 dimensions, cached per document
- **Agent Reasoning**: Context-aware RAG with metadata filtering
- **Report Generation**: Server-side PDF rendering with Puppeteer

## 🔒 Security Considerations

- Never logs or commits API keys
- Sanitizes user inputs in search queries  
- Validates SBOM schemas before processing
- Uses read-only vector operations in agent reasoning

## 🚢 Production Deployment

### Environment Setup
```bash
# Production build
pnpm build

# Set production environment variables
export MODAL_BASE_URL=https://your-modal-deployment.com
export OPENAI_API_KEY=sk-...
export VECTOR_STORE_TYPE=sqlite
export SQLITE_DB_PATH=/data/vector-store.db

# Start production servers
pnpm --filter @dependency-canary/web start
pnpm --filter @dependency-canary/api start
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN corepack enable pnpm && pnpm install --frozen-lockfile
RUN pnpm build
CMD ["pnpm", "dev"]
```

## 🤝 Integration with Real Modal Services

When your teammate's Modal services are ready:

1. Set `MODAL_BASE_URL` environment variable
2. The system automatically switches from mock to real client
3. No code changes needed - interface is identical

The Modal services should implement:
- `POST /scan` → `{ jobId }`
- `GET /enrich?jobId=...` → `EnrichedSBOM`

## 📋 Todo / Future Enhancements

- [ ] WebSocket support for real-time scan progress
- [ ] GitHub Actions integration for CI/CD scanning  
- [ ] SARIF output format support
- [ ] Multi-project comparison views
- [ ] Slack/Teams notifications for critical findings
- [ ] Custom risk scoring models
- [ ] Integration with dependency management tools

## 🐛 Troubleshooting

### Common Issues

**"No SBOM available" error:**
- Ensure you've run `pnpm seed:mock` 
- Check that both web and API servers are running

**Vector store errors:**
- Clear data: `rm -rf *.db` and re-run seed script
- Check filesystem permissions for SQLite

**PDF generation fails:**
- Install system dependencies: `apt-get install -y chromium-browser`
- For Docker: use `puppeteer/puppeteer:latest` base image

**Empty dependency graph:**
- Verify service filter selection
- Check browser console for JavaScript errors

## 🎉 Demo Walkthrough

1. **Start**: `pnpm dev` (both apps running)
2. **Seed**: `pnpm seed:mock` (populate with test data)  
3. **Upload**: Visit localhost:3000, paste `https://github.com/mock/repo`
4. **Scan**: Click "Start Security Scan" (uses mock data)
5. **Explore**: View KPIs, interact with dependency graph
6. **Ask**: "What single upgrade removes the most critical CVEs?"
7. **Report**: Download PDF with full analysis
8. **Test**: Run `pnpm test` to validate all components

---

Built with ❤️ for supply chain security. Questions? Check the code or run the smoke tests!
