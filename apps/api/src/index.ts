import express from 'express';
import { getEnvironment } from '@/config/environment.js';
import corsMiddleware from '@/middleware/cors.js';
import { errorHandler } from '@/middleware/errorHandler.js';
import adminEmailsRouter from '@/routes/admin-emails.js';
import chatRouter from '@/routes/chat.js';
import docsRouter from '@/routes/docs.js';
import documentsRouter from '@/routes/documents.js';
import healthRouter from '@/routes/health.js';
import indexRouter from '@/routes/index.js';
import metricsRouter from '@/routes/metrics.js';
import promptsRouter from '@/routes/prompts.js';
import { initEmbeddings } from '@/services/embeddings.js';
import { closeLangfuse, getSystemPrompt, initLangfuse } from '@/services/langfuse.js';
import { closeRedis, initRedis } from '@/services/redis.js';
import { initSupabase } from '@/services/supabase.js';
import { initTelemetry, shutdownTelemetry } from '@/services/telemetry.js';

const app = express();
const env = getEnvironment();

// Trust proxy (critical for correct protocol/host detection behind Railway reverse proxy)
app.set('trust proxy', 1);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use(corsMiddleware);

// Routes
app.use('/', indexRouter);
app.use('/health', healthRouter);
app.use('/chat', chatRouter);
app.use('/documents', documentsRouter);
app.use('/prompts', promptsRouter);
app.use('/metrics', metricsRouter);
app.use('/admin-emails', adminEmailsRouter);
app.use('/docs', docsRouter);

// 404 handler (after all routes)
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    status: 404,
    path: req.path,
    method: req.method,
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Server startup
let server: ReturnType<typeof app.listen>;

const startServer = async (): Promise<void> => {
  try {
    initTelemetry();
    await initRedis();
    await initSupabase();
    await initLangfuse();
    await initEmbeddings();

    // Warm the system prompt cache
    await getSystemPrompt();

    const port = env.PORT || 8000;
    server = app.listen(port, '0.0.0.0', () => {
      console.log(`API listening on port ${port}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n📍 Received ${signal}, shutting down gracefully...`);
      server.close(async () => {
        await shutdownTelemetry();
        await closeLangfuse();
        await closeRedis();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 30000); // Force after 30s
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Fatal error handlers
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
      console.error('❌ Unhandled Rejection:', reason);
      process.exit(1);
    });
  } catch (error) {
    console.error(
      '❌ Failed to start server:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
};

// Only start if this is the main module (allows importing app for tests)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  startServer();
}

export default app;
