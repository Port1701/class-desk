# Claude Code Instructions

## Project Overview

ClassDesk is a generic, open-source AI assistant template built with Next.js (frontend) and Express (backend).

**Status**: Active development

### Tech Stack

- **Frontend**:
  - Next.js 15+ (App Router, React Server Components)
  - React 19
  - TypeScript 5+
  - Tailwind CSS

- **Backend**:
  - Node.js + Express 5 (TypeScript)
  - Async/await support
  - Supabase for authentication and database
  - Redis for caching

- **Deployment**:
  - Frontend: Vercel (auto-configured via vercel.json)
  - Backend: Railway (auto-configured via railway.json)

### Development Philosophy

- **Code Quality First**: Always test after changes, fix all TypeScript errors before committing
- **Modern Syntax**: Use latest ES6+ (TypeScript) and Node.js features
- **Documentation**: Log significant decisions in docs/AGENTS_APPENDLOG.md (append to that file only; don't read anything in it beyond the final/trailing 20 lines)
- **AI-Assisted**: Leverage AI for rapid development while maintaining high standards

## Development Guidelines

### Code Quality Standards

- **Always test after every change** - Run the application and verify functionality works
- **Build before committing** - Ensure builds pass without errors
- **Fix all type errors** - No ignoring TypeScript type errors
- **Never hallucinate** - Don't assume files, functions, or APIs exist. Read and verify first
- **Read before writing** - Always use Read tool to check existing code before making changes

### JavaScript/TypeScript Style

- Use **TypeScript** for all new code with proper type definitions
- Use **arrow functions** for all function expressions: `const foo = () => {}`
- Use **modern ES6+ syntax**:
  - Destructuring: `const { foo, bar } = obj`
  - Template literals: `` `Hello ${name}` ``
  - Spread operator: `{ ...obj, newProp: value }`
  - Optional chaining: `obj?.property?.nested`
  - Nullish coalescing: `value ?? defaultValue`
- Prefer `const` over `let`, never use `var`
- Use async/await instead of promise chains
- Prefer functional array methods: `map`, `filter`, `reduce`

### React Best Practices

- Use **functional components** with hooks only
- Follow React Server Components patterns where possible
- Use `"use client"` directive only when necessary (client-side interactivity required)
- Properly handle loading and error states
- Clean up effects with return functions
- Use proper dependency arrays for hooks

### Express Best Practices

- Use **middleware** for cross-cutting concerns (CORS, auth, error handling)
- Define **Zod schemas** for request/response validation
- Use **async route handlers** for I/O operations
- Include proper **status codes** in responses
- Add **comprehensive comments** for complex logic
- Handle errors with **try/catch** and pass to error middleware

### Component Development

- Place reusable UI components in appropriate directories
- Define TypeScript interfaces for all props
- Use descriptive, semantic names
- Keep components focused and single-purpose
- Follow accessibility best practices (ARIA labels, semantic HTML)

### API Development

- Create routers for logical groupings of endpoints
- Use consistent naming conventions (RESTful when appropriate)
- Version APIs when making breaking changes
- Include health check endpoint at `/health`
- Add comprehensive error handling

### Code Organization

**Frontend:**

```
apps/web/
├── app/                  # Next.js app router
│   ├── page.tsx         # Home page
│   ├── layout.tsx       # Root layout
│   └── api/             # API routes (if needed)
├── components/           # React components
├── lib/                 # Utilities and helpers (including Supabase clients)
└── types/               # TypeScript type definitions
```

**Backend:**

```
apps/api/
├── package.json          # Node.js dependencies
├── tsconfig.json         # TypeScript configuration
├── src/
│   ├── index.ts          # Express app entry
│   ├── config/           # Environment validation
│   ├── middleware/       # CORS, auth, error handling
│   ├── routes/           # API route handlers
│   ├── services/         # Redis, Supabase init
│   └── types/            # Zod schemas and TS types
├── supabase/
│   ├── types.ts          # Generated Supabase types
│   └── migrations/       # SQL migrations
├── railway.json          # Railway deployment config
├── nixpacks.toml         # Build configuration
└── .env.example          # Environment variable template
```

**Root:**

```
vercel.json            # Vercel deployment config for frontend
.vercelignore          # Vercel ignore patterns
```

### Testing Workflow

1. Make a change
2. **Test immediately** in the browser/application
3. Verify the specific functionality works
4. Check for unintended side effects
5. Run build/tests to catch errors
6. Only proceed to next change after current one works

### Error Handling

- Handle errors gracefully with try/catch (JS/TS)
- Provide meaningful error messages
- Log errors appropriately for debugging
- Don't silently swallow errors
- Return proper HTTP status codes from APIs

### Performance Considerations

- Lazy load components when appropriate
- Memoize expensive computations
- Avoid unnecessary re-renders
- Optimize images and assets
- Monitor bundle size
- Use database indexes for common queries
- Cache API responses when appropriate

### Git Workflow

- Make small, focused commits
- Write clear, descriptive commit messages
- Don't commit untested code
- Keep commits atomic and reversible
- Use conventional commit format when possible

## Common Pitfalls to Avoid

### General

- ❌ Don't assume code exists - always verify by reading files
- ❌ Don't skip testing after changes
- ❌ Don't ignore type errors
- ❌ Don't make large, multi-purpose commits
- ❌ Don't commit broken builds
- ❌ Don't duplicate code - create reusable utilities instead

### JavaScript/TypeScript

- ❌ Don't use outdated syntax (var, function declarations, etc.)
- ❌ Don't ignore TypeScript errors or use `any` without justification
- ❌ Don't forget to handle loading and error states
- ❌ Don't forget cleanup in useEffect hooks
- ❌ Don't mutate state directly (use immutable updates)

### Node.js

- ❌ Don't use blocking I/O in async functions
- ❌ Don't forget to handle Promise rejections
- ❌ Don't ignore validation errors from Zod
- ❌ Don't use bare catch clauses
- ❌ Don't forget proper cleanup in error handlers

## Decision Logging & Meta-Documentation

### Running Logs

- **docs/AGENTS_APPENDLOG.md**: Append-only log of all significant decisions (append to that file only; don't read anything in it beyond the final/trailing 20 lines)
- Log architecture choices, library selections, trade-offs
- Include timestamps in format: `YYYY-MM-DD HH:MM PT` (Pacific Time)
- Never hallucinate timestamps - ask user if current time is unknown

### What to Log

- Framework/library selection decisions
- Architecture changes
- API design choices
- Database schema decisions
- Deployment configuration changes
- Performance optimizations
- Security considerations
- Bug fixes that reveal important learnings

### Log Entry Format

```markdown
## YYYY-MM-DD HH:MM PT - Entry Title

**Type:** [Decision | Implementation | Bug Fix | Refactor]
**Change:** What was changed/decided
**Rationale:** Why this choice was made
**Alternatives Considered:** Other options (if applicable)
**Impact:** Time/complexity/features affected
**Learnings:** Insights or patterns discovered
```

### Holistic Documentation

After appending to AGENTS_APPENDLOG.md:

1. Update README.md with any user-facing changes
2. Incorporate key insights and improved workflows into CLAUDE.md for future reference

## Deployment

### Vercel (Frontend)

The `vercel.json` at the root is configured for:

- Building from `apps/web`
- Deploying on pushes to `main` branch
- Ignoring deployments when only backend files change

**Setup:**

1. Connect repository to Vercel (via GitHub integration)
2. **Important: Set the root directory to `apps/web`** in Vercel project settings
   - Go to Project Settings → General
   - Set "Root Directory" to `apps/web`
   - This tells Vercel where to find the Next.js app
3. Vercel auto-detects `vercel.json` configuration
4. Set environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Your Supabase publishable key
   - `NEXT_PUBLIC_API_URL`: Your deployed API URL
5. Deploy

### Railway (Backend)

Each service under `apps/` can be deployed independently with its own configuration files:

- `railway.json` - Deployment configuration
- `.railwayignore` - Files to exclude from deployment
- `nixpacks.toml` - Build configuration
- `.env.example` - Environment variable template

**Setup for API service:**

1. Create new Railway service
2. Connect repository (via GitHub integration)
3. **Important: Set the root directory to `/apps/api`** in Railway service settings
   - Go to Service Settings → General
   - Set "Root Directory" to `/apps/api` (with leading slash)
   - This tells Railway where to find `railway.json` and `package.json`
4. Railway will detect `railway.json` and `nixpacks.toml` in the `apps/api` directory
5. Add Redis plugin: Click "New" → "Database" → "Add Redis"
   - Railway will automatically set the `REDIS_URL` environment variable
6. Set all required environment variables in Railway dashboard:
   - **Supabase**: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
   - **AI/LLM**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
   - **Observability**: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`
   - **Email**: `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM`
   - **Networking**: `CORS_ORIGINS`
7. Deploy

**Why per-service configuration:**

- Each service has its own dependencies and configuration
- Services can be deployed and scaled independently
- Easy to add new services without affecting existing ones
- Clear separation of concerns

### Adding More Services

To add additional backend services:

1. Create new service directory under `apps/` (e.g., `apps/worker/`)
2. Add service-specific configuration files:
   - `railway.json` - Deployment config
   - `.railwayignore` - Exclude patterns
   - `nixpacks.toml` - Build config
   - `package.json` - Node.js dependencies
   - `.env.example` - Environment template
3. Create new Railway service in your project
4. Connect same repository
5. **Important: Set root directory to `/apps/worker`** in Railway settings (with leading slash)
6. Deploy independently

**Example multi-service structure:**

```
apps/
├── api/              # REST API (Node.js)
│   ├── railway.json
│   ├── package.json
│   └── ...
├── worker/           # Background jobs (Node.js)
│   ├── railway.json
│   ├── package.json
│   └── ...
└── websocket/        # WebSocket server (Node.js)
    ├── railway.json
    ├── package.json
    └── ...
```

## Project-Specific Patterns

### Environment Variables

**Frontend** (`apps/web/.env`):

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
# Public vars must be prefixed with NEXT_PUBLIC_
```

**Backend** (`apps/api/.env`):

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
API_SECRET_KEY=your_secret_here
# No special prefix needed
```

### API Integration Pattern

**Frontend calling Backend:**

```typescript
const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/endpoint`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
const result = await response.json();
```

**Backend API route:**

```typescript
import { Router } from "express";
import { z } from "zod";

const router = Router();

const UserRequestSchema = z.object({
  name: z.string(),
  email: z.email(),
});

const UserResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
});

router.post("/users", async (req, res, next) => {
  try {
    const data = UserRequestSchema.parse(req.body);
    // Business logic here
    const result = { id: 1, name: data.name, email: data.email };
    const response = UserResponseSchema.parse(result);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
```

### CORS Configuration

Handled via middleware (see `src/middleware/cors.ts`):

```typescript
import cors from "cors";
import { getCorsOrigins } from "@/config/environment.js";

const corsMiddleware = cors({
  origin: getCorsOrigins(),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
});

app.use(corsMiddleware);
```

### Database Integration

**Common patterns:**

- Use Supabase SDK or Drizzle ORM for database access
- Store connection string in environment variable (SUPABASE_URL, SUPABASE_SECRET_KEY)
- Supabase handles connection pooling automatically
- Use Supabase migrations for schema changes

### Streaming Responses

**Backend (Express):**

```typescript
router.get("/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  for (const item of items) {
    res.write(`data: ${JSON.stringify(item)}\n\n`);
  }
  res.end();
});
```

**Frontend (Next.js):**

```typescript
const response = await fetch("/api/stream");
const reader = response.body?.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // Process stream chunk
}
```

## Verification Checklist

Before considering any task complete:

### Code Quality

- [ ] Code verified by reading actual files (not assumed)
- [ ] No hallucinated functions, imports, or APIs
- [ ] Code follows style guidelines (arrow functions, type annotations, etc.)
- [ ] Types properly defined (TypeScript interfaces and type annotations)
- [ ] No unused imports or variables
- [ ] Error cases handled appropriately

### Testing

- [ ] Change tested in running application
- [ ] Functionality confirmed to work as expected
- [ ] No console errors or warnings when testing
- [ ] Build passes successfully (frontend and/or backend)
- [ ] All type errors resolved (TypeScript)
- [ ] No regressions in existing functionality

### Documentation

- [ ] Documentation updated if behavior or APIs changed
- [ ] Significant decisions logged in AGENTS_APPENDLOG.md (append to that file only; don't read anything in it beyond the final/trailing 20 lines)
- [ ] Code comments added for complex logic
- [ ] README.md updated if user-facing changes were made

### Deployment Readiness

- [ ] No secrets or credentials in code
- [ ] Environment variables properly configured
- [ ] Dependencies added to package.json and npm/yarn lock files updated

## Agent Collaboration

When multiple agents or sessions work on this project:

1. **Always read on startup:**
   - README.md for project overview and setup
   - CLAUDE.md (this file) for development guidelines
   - AGENTS_APPENDLOG.md (last ~100 lines) for recent changes

2. **Before starting work:**
   - Check `git status` to see current state
   - Review any existing todo lists
   - Search for existing patterns before creating new ones
   - Never assume what other agents have done - verify by reading files

3. **During work:**
   - Use TodoWrite to track progress on multi-step tasks
   - Test after each change, not in batches
   - Mark todos as completed immediately after finishing
   - Communicate clearly about what's being worked on

4. **After completing work:**
   - Log significant decisions in AGENTS_APPENDLOG.md
   - Update documentation if needed
   - Clear completed todos or clean up todo list
   - Don't leave work in an incomplete state

5. **Never hallucinate:**
   - Don't assume files exist - use Read tool to verify
   - Don't guess at function signatures - search and read
   - Don't invent APIs or configuration options
   - Always verify before acting

## Template Customization

When using this template for a new project:

### Initial Setup

1. Clone the template repository
2. Update `README.md` with your project name and description
3. Update this file (CLAUDE.md) "Project Overview" section with project-specific context
4. Initialize new git repository (or update remote)

### Project-Specific Configuration

1. Add project-specific environment variables to `.env.example` files
2. Configure CORS with your actual frontend URL in `apps/api/main.py`
3. Set up database schema (if using Supabase or other database)
4. Add authentication if needed (NextAuth.js, JWT, etc.)
5. Customize API routes for your specific use case

### Documentation Updates

1. Document project-specific patterns in this file (CLAUDE.md)
2. Log initial architecture decisions in `docs/AGENTS_APPENDLOG.md`
3. Update README.md with project-specific setup instructions
4. Add project-specific testing instructions

### Deployment

1. Connect repository to Vercel and Railway
2. Set up environment variables in deployment dashboards
3. Configure custom domains if needed
4. Set up monitoring/logging services if needed
5. Test deployments thoroughly before going live

## Future Enhancements

Common features to add based on project needs:

- Database integration (PostgreSQL, MongoDB, etc.)
- Authentication (NextAuth.js, JWT)
- State management (Zustand, Redux)
- Real-time features (WebSockets, Server-Sent Events)
- File uploads (S3, Cloudinary)
- Background jobs (BullMQ, Bull)
- Caching (Redis)
- Testing (Jest, Playwright)
- CI/CD pipelines
- Docker containerization
- Monitoring and logging (Sentry, LogRocket)
