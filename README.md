# ClassDesk

> This is a generic, open-source version of [BoolaBot](https://www.boolabot.ai), an AI assistant originally built by Bryan Owens for the Yale Class of 2021 reunion. This repository contains the template/scaffold for building your own agentic AI assistant with hybrid RAG capabilities.

ClassDesk is an AI assistant built with Next.js, Express, and Claude. It consolidates information from multiple sources into one searchable, interactive AI assistant with form automation capabilities.

## Features

### User-Facing Features

- **🤖 Interactive Chatbot**: Agentic AI assistant powered by Claude Haiku 4.5
- **📚 Hybrid RAG Search**: Combines vector semantic search + fuzzy keyword matching for maximum recall
- **📖 Document Retrieval**: Searchable knowledge base of class documents with auto-generated [N] citations
- **🔍 Web Search**: Live internet search capability within conversations (up to 3 uses per response)
- **🌐 URL Fetching**: Scrape and cite content from web pages with intelligent caching
- **📋 Form Automation**: Auto-fill external forms (e.g., Monday.com) on behalf of users
- **🎨 Dark Mode**: Fully themed dark/light mode support with persistent preference
- **📄 Dynamic Documentation**: Browse class documents with full-text search support
- **💬 Conversation History**: Multi-turn conversations with context preservation

### Admin Features

- **📊 Admin Console**: Google SSO-protected dashboard with 4 management panels:
  - **Documents Panel**: Upload, edit, and manage class documents
  - **Prompts Panel**: Version control for AI system prompts with Langfuse integration
  - **Stats Panel**: View real-time usage metrics and performance analytics
  - **Admins Panel**: Manage admin email whitelist (environment + database-based)
- **👮 Role-Based Access**: Email-based authentication with admin role enforcement
- **🔐 Session Security**: Supabase Google OAuth + JWT token authentication
- **⚙️ Setup**: Requires Google OAuth configuration in Google Cloud Console (free tier)

### Technical Features

- **⚡ Modern Frontend**: Next.js 15+ with React 19, TypeScript 5+, and Tailwind CSS
- **🚀 Robust Backend**: Express 5 with Node.js, TypeScript, and async/await support
- **🛡️ Type Safety**: Zod validation for all API requests and responses
- **💾 Database**: Supabase PostgreSQL with pgvector for embeddings
- **⚙️ Caching**: Redis for API caching, deduplication, and rate limiting
- **📈 Observability**: Langfuse tracing for all LLM calls with prompt versioning
- **🔄 Graceful Degradation**: Works without Redis or embeddings service (degraded mode)
- **🧪 Code Quality**: Biome linting/formatting, TypeScript type checking, pre-commit validation
- **🏗️ Deployment Ready**: Pre-configured for Vercel (frontend) and Railway (backend + Redis)

## AI Architecture: Agentic Assistant with Hybrid RAG

**The One-Liner:**
Claude Haiku 4.5 powered agentic chatbot with hybrid RAG (vector + fuzzy search), multi-tool orchestration, and Langfuse observability.

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT LAYER                                      │
│                                                                              │
│  ┌──────────────────────┐         ┌──────────────────────┐                 │
│  │   Web Browser        │         │   Mobile App         │                 │
│  │  (Next.js Frontend)  │         │   (OAuth Login)      │                 │
│  └──────────┬───────────┘         └──────────┬───────────┘                 │
│             │                                │                             │
│             └────────────────┬───────────────┘                             │
└──────────────────────────────┼────────────────────────────────────────────┘
                               │ HTTP/WebSocket
┌──────────────────────────────┼────────────────────────────────────────────┐
│                    EXPRESS BACKEND (Node.js)                              │
│                                                                            │
│  ┌────────────────────────────┬──────────────────────────────────────┐   │
│  │                  ROUTING & MIDDLEWARE                            │   │
│  │  • CORS, Auth, Error Handling                                   │   │
│  │  • Request Validation (Zod)                                     │   │
│  └──────────────────────┬─────────────────────────────────────────┘   │
│                         │                                               │
│  ┌──────────────────────┴────────────────────────────────────────┐    │
│  │                    CHAT ROUTE                                │    │
│  │  ┌─────────────────────────────────────────────────────────┐ │    │
│  │  │  AGENTIC LOOP (Anthropic SDK)                          │ │    │
│  │  │                                                         │ │    │
│  │  │  1. Parse user query                                  │ │    │
│  │  │  2. Call Claude with system prompt + tools            │ │    │
│  │  │  3. LLM decides which tools to invoke                 │ │    │
│  │  │  4. Execute tools (max 5 iterations)                 │ │    │
│  │  │  5. Return final response with citations             │ │    │
│  │  └────────────────┬────────────────────────────────────┘ │    │
│  │                   │                                       │    │
│  │  ┌────────────────┴───────────────────────────────────┐  │    │
│  │  │          AGENTIC TOOLS                            │  │    │
│  │  │                                                    │  │    │
│  │  │  ┌─────────────────────────────────────────────┐  │  │    │
│  │  │  │ search_documents (Hybrid RAG)              │  │  │    │
│  │  │  │  ├─ Vector Search (Semantic)               │  │  │    │
│  │  │  │  │  └─ PostgreSQL pgvector + HNSW index   │  │  │    │
│  │  │  │  └─ Fuzzy Search (Keyword)                 │  │  │    │
│  │  │  │     └─ PostgreSQL trigrams + full-text    │  │  │    │
│  │  │  └─────────────────────────────────────────────┘  │  │    │
│  │  │  ┌─────────────────────────────────────────────┐  │  │    │
│  │  │  │ fetch_url (Web Scraping)                  │  │  │    │
│  │  │  │  └─ Cheerio + Redis cache                 │  │  │    │
│  │  │  └─────────────────────────────────────────────┘  │  │    │
│  │  │  ┌─────────────────────────────────────────────┐  │  │    │
│  │  │  │ web_search (Internet Search)              │  │  │    │
│  │  │  │  └─ Claude native web search (3 uses/max) │  │  │    │
│  │  │  └─────────────────────────────────────────────┘  │  │    │
│  │  │  ┌─────────────────────────────────────────────┐  │  │    │
│  │  │  │ fill_form (Form Automation)               │  │  │    │
│  │  │  │  └─ Playwright + Monday.com API           │  │  │    │
│  │  │  └─────────────────────────────────────────────┘  │  │    │
│  │  └────────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              DATA & STATE SERVICES                         │  │
│  │                                                             │  │
│  │  ┌────────────────────┐    ┌────────────────────────────┐ │  │
│  │  │  Supabase Service  │    │  Embeddings Service       │ │  │
│  │  │  • Database        │    │  • OpenAI API             │ │  │
│  │  │  • Authentication  │    │  • Model: embed-3-small   │ │  │
│  │  │  • RLS Policies    │    │  • 1536 dimensions        │ │  │
│  │  └────────────────────┘    └────────────────────────────┘ │  │
│  │  ┌────────────────────┐    ┌────────────────────────────┐ │  │
│  │  │  Langfuse Service  │    │  Redis Service            │ │  │
│  │  │  • LLM Tracing     │    │  • Response caching       │ │  │
│  │  │  • Prompt storage  │    │  • Rate limiting          │ │  │
│  │  │  • Analytics       │    │  • Deduplication         │ │  │
│  │  └────────────────────┘    └────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
         │              │                      │           │
         ▼              ▼                      ▼           ▼
    ┌─────────┐   ┌──────────┐          ┌──────────┐  ┌────────┐
    │PostgreSQL  │   │  Redis   │          │ Langfuse │  │Mailgun │
    │           │   │          │          │          │  │        │
    │pgvector   │   │ Cache    │          │ Tracing  │  │ Email  │
    │HNSW index │   │ Rate Lim │          │ Prompts  │  │ Conf   │
    └─────────┘   └──────────┘          └──────────┘  └────────┘
```

### Data Flow: Chat Message Processing

```
User Query
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Message arrives at /chat endpoint                        │
│    - Validate with Zod schema                               │
│    - Start Langfuse trace                                   │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Claude Haiku receives prompt with context                │
│    - System prompt (from Langfuse)                          │
│    - User message + conversation history                    │
│    - Available tools (search_documents, fetch_url, etc)     │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. LLM Decides: Which tools to call?                        │
│    - Option A: search_documents (if embeddings available)   │
│    - Option B: fetch_url (if URL mentioned)                 │
│    - Option C: web_search (if needed)                       │
│    - Option D: fill_form (if user asks)                     │
└─────────────────────────────────────────────────────────────┘
    │
    ├─── search_documents ─┐
    │                      ▼
    │         ┌──────────────────────────────┐
    │         │ Vector Search (pgvector)     │
    │         │ + Fuzzy Search (trigrams)    │
    │         │ Returns: chunks + snippets   │
    │         └──────────────────────────────┘
    │
    ├─── fetch_url ────────┐
    │                      ▼
    │         ┌──────────────────────────────┐
    │         │ Cheerio scrapes URL          │
    │         │ Redis checks cache (5min)    │
    │         │ Returns: page content        │
    │         └──────────────────────────────┘
    │
    ├─── web_search ───────┐
    │                      ▼
    │         ┌──────────────────────────────┐
    │         │ Claude web search (max 3)    │
    │         │ Returns: search results      │
    │         └──────────────────────────────┘
    │
    └─── fill_form ────────┐
                           ▼
              ┌──────────────────────────────┐
              │ Playwright automation        │
              │ Monday.com form submit       │
              │ Returns: confirmation        │
              └──────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Tool results → Back to Claude                            │
│    - LLM reads all tool outputs                             │
│    - Decides: continue loop or send final response?         │
│    - Max 5 iterations per request                           │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Generate final response with citations                   │
│    - [1] → document source                                  │
│    - [2] → web source                                       │
│    - Stream response back to client                         │
│    - Log to Langfuse                                        │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
  User sees AI response with clickable citations
```

### Core AI Stack

- **Model**: Claude Haiku 4.5 via Anthropic SDK
- **Framework**: Vercel AI SDK with agentic loop (`streamText` for web, `generateText` for non-streamed responses)
- **LLM Observability**: Langfuse for tracing, prompt management, and decision logging
- **Agentic Tools** (max 5 invocations per request):
  - `search_documents` — Hybrid RAG returning vector similarity results + fuzzy keyword snippets
  - `fetch_url` — Web page scraping with Redis caching (Cheerio)
  - `web_search` — Live internet search via Claude's native web search (limited to 3 uses per response)
  - `fill_form` — External form automation (e.g., Monday.com) with dry-run mode for testing

### RAG Pipeline Architecture

**Vector Search (Semantic)**

- **Embeddings Model**: OpenAI `text-embedding-3-small` (1536 dimensions)
- **Vector Database**: PostgreSQL with pgvector extension
- **Index Type**: HNSW (Hierarchical Navigable Small World) for O(log N) fast cosine-similarity lookups
- **Chunking**: Documents split into 800-character overlapping chunks, each with separate embedding
- **Similarity Threshold**: 0.4 (filters low-relevance results)
- **Results**: Top 3 chunk matches per document with combined content

**Fuzzy Search (Keyword-Based)**

- **Method**: PostgreSQL trigram similarity (`pg_trgm`) with word_similarity for typo tolerance
- **Fallback**: Full-text search (tsvector) for broader matching
- **Context Windows**: 40-word windows (20 before + 20 after) around each match
- **Date Extraction**: Automatic extraction of dates found in matched documents

**Result Merging**

- Vector results used for semantic understanding and broad context
- Fuzzy results used for exact wording, specific facts, and deadline detection
- Document chunks grouped by source (max 3 per document)
- Deduplication to avoid returning same content multiple times

### Prompt Engineering & Context

- **Dynamic System Prompts**: Versioned in Langfuse with variable substitution (current date injection)
- **Intelligent Tool Selection**: LLM autonomously decides which tools to invoke based on query intent
- **Preferred Search Order**: System prompt encourages searching documents first, then URLs, then web search
- **Contradiction Resolution**: Prefers most recent information when documents conflict
- **Citation System**: Automatic [N] markers in responses linking to sources with remark plugin
- **Multi-Turn Context**: Conversation history preserved across turns with recursive token counting

### Tool Orchestration Features

✅ **Grounded Responses**: LLM must search documents before answering (no hallucinations allowed)
✅ **Intelligent Tool Selection**: LLM decides which tools to invoke and in what order
✅ **Streaming Support**: Web chat gets streamed responses with real-time token delivery
✅ **Rate Limiting**: Redis-based rate limiting (10 msgs/60s per user)
✅ **Error Resilience**: Graceful fallbacks if embeddings or services unavailable
✅ **Privacy**: Form submissions handled server-side, tokens never exposed to client

## API Endpoints

### Chat Endpoints

- `POST /chat` - Submit message and get streamed AI response with tool results

### Knowledge Base Endpoints

- `GET /docs` - List all available documents
- `GET /docs/:slug` - Get full document content
- `GET /documents` - List documents (admin endpoint)
- `POST /documents` - Upload new document (admin endpoint)
- `PUT /documents/:id` - Update document (admin endpoint)
- `DELETE /documents/:id` - Delete document (admin endpoint)

### Configuration Endpoints

- `GET /prompts` - List available prompts (admin endpoint)
- `GET /prompts/:name` - Get prompt by name (admin endpoint)
- `PUT /prompts/:name` - Update/version prompt (admin endpoint)

### Admin Endpoints

- `GET /admin-emails` - Check admin status and list admins
- `POST /admin-emails` - Add admin email (admin endpoint)
- `DELETE /admin-emails/:email` - Remove admin (admin endpoint)

### Observability Endpoints

- `GET /` - API info and status
- `GET /health` - Detailed health check (Redis, Supabase, uptime)
- `GET /metrics` - Usage metrics and performance stats

## Tech Stack

### Frontend

- **Framework**: Next.js 15+
- **UI Library**: React 19
- **Language**: TypeScript 5+
- **Styling**: Tailwind CSS
- **Authentication**: Supabase Auth (OAuth)
- **Markdown**: React-Markdown with Remark/Rehype plugins
- **Deployment**: Vercel

### Backend

- **Framework**: Express 5
- **Language**: TypeScript (Node.js 22+)
- **Database**: Supabase (PostgreSQL with pgvector)
- **Cache**: Redis with ioredis
- **Validation**: Zod for type-safe schemas
- **AI SDK**: Anthropic SDK + Vercel AI SDK
- **Observability**: Langfuse for LLM tracing
- **Embeddings**: OpenAI `text-embedding-3-small`
- **Web Scraping**: Cheerio
- **Form Automation**: Playwright
- **Email**: Mailgun API
- **Deployment**: Railway

## Project Structure

```
.
├── apps/
│   ├── web/                  # Next.js frontend (React + TypeScript)
│   │   ├── app/              # Next.js app router pages
│   │   │   ├── page.tsx      # Chat interface (home)
│   │   │   ├── login/        # Authentication page
│   │   │   ├── console/      # Admin dashboard (protected)
│   │   │   ├── docs/         # Document viewer
│   │   │   └── about/        # About page
│   │   ├── components/       # React components
│   │   │   ├── Chatbot.tsx   # Main chat interface
│   │   │   ├── chat/         # Chat UI subcomponents
│   │   │   ├── console/      # Admin panel components
│   │   │   └── ...
│   │   ├── lib/              # Utilities and helpers
│   │   │   ├── supabase/     # Supabase clients (server/client)
│   │   │   ├── api-auth.ts   # Authenticated API calls
│   │   │   ├── remarkCitations.ts  # Markdown citation plugin
│   │   │   └── ...
│   │   ├── package.json
│   │   └── .env.example
│   │
│   └── api/                  # Express backend (Node.js + TypeScript)
│       ├── src/
│       │   ├── index.ts      # Express app and server startup
│       │   ├── config/       # Environment validation with Zod
│       │   ├── middleware/   # CORS, auth, error handling
│       │   ├── routes/       # API route handlers
│       │   │   ├── chat.ts   # Agentic chat with tool orchestration
│       │   │   ├── documents.ts  # Document CRUD
│       │   │   ├── prompts.ts    # Prompt management
│       │   │   ├── admin-emails.ts  # Admin role management
│       │   │   ├── metrics.ts    # Usage analytics
│       │   │   └── ...
│       │   ├── services/     # Core business logic
│       │   │   ├── embeddings.ts  # OpenAI embedding generation
│       │   │   ├── langfuse.ts    # LLM observability setup
│       │   │   ├── redis.ts       # Caching and rate limiting
│       │   │   ├── supabase.ts    # Database client
│       │   │   ├── fetchUrl.ts    # Web scraping with caching
│       │   │   ├── formFiller.ts  # Form automation logic
│       │   │   └── ...
│       │   └── types/        # Zod schemas and TypeScript types
│       ├── supabase/
│       │   ├── types.ts      # Generated Supabase TypeScript types
│       │   └── migrations/   # SQL migrations for schema changes
│       ├── package.json
│       ├── tsconfig.json
│       ├── railway.json      # Railway deployment config
│       ├── .env.example      # Environment variable template
│       └── .railwayignore
│
├── docs/
│   └── AGENTS_APPENDLOG.md   # Decision log for architectural choices
├── CLAUDE.md                 # AI-assisted development guidelines
├── AGENTS.md                 # Universal agent entry point
├── vercel.json               # Vercel frontend deployment config
├── package.json              # Root monorepo scripts (lint, format, build, typecheck)
├── biome.json                # Linting and formatting configuration
└── README.md                 # This file
```

## Quick Start

### Prerequisites

- Node.js 22.0.0 or higher
- npm or yarn
- [Supabase account](https://supabase.com) (free tier available)

### Supabase Setup

1. **Create a Supabase project**:
   - Go to [https://app.supabase.com](https://app.supabase.com)
   - Click "New Project"
   - Choose an organization, project name, database password, and region

2. **Get your credentials**:
   - Go to Project Settings → API
   - Copy your `Project URL` (SUPABASE_URL)
   - Copy your `publishable` key (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
   - Copy your `secret` key (SUPABASE_SECRET_KEY) - **Keep this secret!**

3. **Set up Google OAuth** (for admin console access):
   - Go to [Google Cloud Console → OAuth Clients](https://console.cloud.google.com/auth/clients)
   - Create a new OAuth 2.0 Client ID for a Web application
   - Add authorized JavaScript origins:
     - `http://localhost:3000` (local development)
     - `https://your-vercel-domain.vercel.app` (production frontend URL)
   - Add authorized redirect URIs:
     - `http://localhost:3000/auth/callback` (local development)
     - `https://your-supabase-project.supabase.co/auth/v1/callback` (Supabase callback)
     - `https://your-vercel-domain.vercel.app/auth/callback` (production)
   - Copy the **Client ID** and **Client Secret**
   - In Supabase dashboard: Go to Authentication → Providers → Google
   - Paste your Client ID and Client Secret
   - Enable the provider

4. **Add to `.env` file** (see Backend Setup below)

### Frontend Setup

```bash
cd apps/web
npm install
cp .env.example .env
# Add your Supabase credentials to .env
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

### Backend Setup

```bash
cd apps/api
npm install
cp .env.example .env
# Add your Supabase credentials and API keys to .env

# Run API in development mode
npm run dev
```

Your API will be available at [http://localhost:8080](http://localhost:8080)

### Redis Setup (Optional for Local Development)

The API uses Redis for caching and rate limiting. For local development, you can either:

**Option 1: Run Redis locally**

```bash
# macOS (using Homebrew)
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:latest
```

**Option 2: Skip Redis locally**

The API gracefully degrades if Redis is unavailable. You can develop without Redis, and it will simply skip caching operations.

**Test Connections**

Once both services are running, test connectivity:

```bash
# Check API info
curl http://localhost:8080/

# Check overall health and service status
curl http://localhost:8080/health
```

The health endpoint shows Redis, Supabase, and uptime status.

## Deployment

### Frontend (Vercel)

1. Connect your repository to Vercel (via GitHub integration)
2. **Important: Set the root directory to `apps/web`** in Vercel project settings
   - Go to Project Settings → General
   - Set "Root Directory" to `apps/web`
3. Vercel will automatically detect the `vercel.json` configuration
4. Set environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Your Supabase publishable key
   - `NEXT_PUBLIC_API_URL`: Your deployed API URL (e.g., https://api.example.com)
5. Deploy

The `vercel.json` is configured to:

- Build the frontend from `apps/web`
- Deploy on pushes to `main` branch
- Ignore deployments when only backend files change

### Backend (Railway)

Each service under `apps/` can be deployed independently to Railway.

**Deploying the API service:**

1. Create a new service in Railway
2. Connect your repository (via GitHub integration)
3. **Important: Set the root directory to `/apps/api`** in Railway service settings
   - Go to Service Settings → General
   - Set "Root Directory" to `/apps/api`
   - This tells Railway where to find `railway.json` and `package.json`
4. Railway will automatically detect `railway.json` and `nixpacks.toml` in the `apps/api` directory
5. **Add Redis plugin**: Click "New" → "Database" → "Add Redis"
   - Railway will automatically set the `REDIS_URL` environment variable
6. **Set all required environment variables** in Railway dashboard:
   - **Supabase**:
     - `SUPABASE_URL`: Your Supabase project URL
     - `SUPABASE_SECRET_KEY`: Your Supabase secret key
   - **AI/LLM**:
     - `ANTHROPIC_API_KEY`: Your Anthropic API key
     - `OPENAI_API_KEY`: Your OpenAI API key (for embeddings)
   - **Observability**:
     - `LANGFUSE_PUBLIC_KEY`: Langfuse public key
     - `LANGFUSE_SECRET_KEY`: Langfuse secret key
     - `LANGFUSE_BASE_URL`: Langfuse base URL (e.g., https://us.cloud.langfuse.com)
   - **Email**:
     - `MAILGUN_API_KEY`: Mailgun sending key
     - `MAILGUN_DOMAIN`: Mailgun verified sending domain
     - `MAILGUN_FROM`: Sender address (e.g., "ClassDesk <noreply@example.com>")
   - **Networking**:
     - `CORS_ORIGINS`: Comma-separated allowed frontend origins (e.g., https://example.com,https://www.example.com)

#### Email Setup (Mailgun)

To enable email functionality:

1. **Create Mailgun account**: Sign up at [https://mailgun.com](https://mailgun.com)
2. **Add verified domain**: Go to Sending → Domains and add your domain
3. **Configure DNS records**:
   - Use Mailgun UI to set up automatic **SPF**, **DKIM**, and **DMARC** records
   - **Important**: Combine all SPF records into a single TXT record in your domain DNS (SPF records cannot be duplicated)
   - This ensures emails pass spam checks and improves deliverability
4. **Get API credentials**:
   - Go to API → Sending Key and copy your sending key (for `MAILGUN_API_KEY`)
   - Your sending domain should be configured in `MAILGUN_DOMAIN`
5. **Set environment variables** in Railway dashboard with the values from above
6. Deploy

The `railway.json` is configured for:

- Automatic health checks at `/health`
- Automatic restarts on failure
- Graceful service degradation

## Code Quality & Development

### Pre-Commit Validation

The project includes comprehensive pre-commit validation that runs in order:

1. **Type Checking** (`npm run typecheck`) — Catches TypeScript errors early
2. **Building** (`npm run build`) — Ensures both apps compile successfully
3. **Formatting** (`npm run format`) — Auto-fixes code style
4. **Linting** (`npm run lint`) — Enforces code quality rules

This ensures errors are caught before any auto-formatting is applied.

### Scripts

**Root level** (monorepo-wide):

```bash
npm run typecheck    # Check TypeScript types in both apps
npm run build        # Build both apps
npm run format       # Auto-format code (Biome + sql-formatter + shfmt + Prettier for .md)
npm run lint         # Check code quality (Biome + shellcheck)
```

**Frontend** (`apps/web`):

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run type-check   # Check TypeScript types
```

**Backend** (`apps/api`):

```bash
npm run dev          # Start development server with hot reload
npm run build        # Compile TypeScript to JavaScript
npm run type-check   # Check TypeScript types
```

### Code Style

#### JavaScript/TypeScript

- Use arrow functions: `const foo = () => {}`
- Use modern ES6+ syntax (destructuring, spread, optional chaining)
- Prefer `const` over `let`, never use `var`
- Use async/await instead of promise chains
- Enforce with Biome linter

#### Database

- Supabase migrations for schema changes
- SQL formatted with sql-formatter

## Environment Variables

All environment variables are documented in `.env.example` files with:

- `[REQUIRED]` or `[OPTIONAL]` indicator
- Description of what each variable is used for
- Default values where applicable
- Links to where to get API keys

### Frontend (`apps/web/.env`)

See `apps/web/.env.example` for complete documentation.

### Backend (`apps/api/.env`)

See `apps/api/.env.example` for complete documentation.

## Development Guidelines

### AI-Assisted Development

This template includes comprehensive documentation for AI-assisted development:

- **CLAUDE.md**: Comprehensive development guidelines, coding standards, workflows, and best practices
- **AGENTS.md**: Universal entry point for AI agents (redirects to CLAUDE.md)
- **docs/AGENTS_APPENDLOG.md**: Decision log for tracking architectural choices and learnings

When working with AI assistants, they should:

1. Read `CLAUDE.md` for complete development guidelines
2. Read `README.md` for project overview and setup
3. Read `docs/AGENTS_APPENDLOG.md` (last ~100 lines) for recent changes
4. Log significant decisions in `docs/AGENTS_APPENDLOG.md`

### Testing

Frontend:

```bash
cd apps/web
npm test
```

Backend:

```bash
cd apps/api
npm test
```

## Troubleshooting

### Build Errors

- Frontend: Ensure all TypeScript errors are resolved with `npm run typecheck` and `npm run build`
- Backend: Check Node.js version and dependencies with `npm run typecheck` and `npm run build`

### CORS Issues

If you encounter CORS errors, update `CORS_ORIGINS` in `apps/api/.env`:

```bash
CORS_ORIGINS=http://localhost:3000,https://yourapp.vercel.app
```

### Type Errors

Run type checking to catch issues early:

```bash
npm run typecheck
```

This checks both frontend and backend TypeScript.

### Redis Connection Issues

Check Redis is running:

```bash
redis-cli ping
```

If Redis is unavailable, the API will log warnings but continue operating in degraded mode (without caching).

### Google OAuth / Admin Console Authentication

If you see OAuth errors when accessing the console:

1. **Missing Google OAuth credentials**: Set up Google OAuth in Google Cloud Console at https://console.cloud.google.com/auth/clients
2. **Callback URL mismatch**: Ensure redirect URIs in Google Cloud include your frontend URL and Supabase callback URL
3. **Not in admin list**: Verify your email is in the `ADMIN_EMAILS` environment variable on the backend
4. **Supabase provider disabled**: Check that Google OAuth provider is enabled in Supabase Authentication settings

## Contributing

1. Follow the coding standards in `CLAUDE.md`
2. Log significant decisions in `docs/AGENTS_APPENDLOG.md`
3. Test changes thoroughly before committing
4. Keep commits focused and atomic
5. Ensure pre-commit validation passes

## License

MIT License - Feel free to use this template for your projects.

## Support

For issues and questions:

- Check the documentation in `docs/`
- Review `CLAUDE.md` for coding guidelines
- Review `AGENTS_APPENDLOG.md` for recent architectural decisions
- Open an issue in the repository
