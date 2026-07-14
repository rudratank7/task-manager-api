import Fastify from 'fastify';
import { env } from './config/env.js';
import { swaggerConfig } from './config/swagger.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRoutes } from './routes/public/auth.routes.js';
import { projectRoutes } from './routes/private/project.routes.js';
import { taskRoutes } from './routes/private/task.routes.js';
import { commentRoutes } from './routes/private/comment.routes.js';

export const app = Fastify({
  logger: {
    transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  },
});

// ── Middleware ─────────────────────────────────────────────────────────────────
app.setErrorHandler(errorHandler);
app.register(swaggerConfig);
app.register(authMiddleware);

// ── Routes ────────────────────────────────────────────────────────────────────
app.register(authRoutes, { prefix: '/auth' });

app.register(async (privateInstance) => {
  privateInstance.addHook('preHandler', privateInstance.authenticate);
  privateInstance.register(projectRoutes, { prefix: '/projects' });
  privateInstance.register(taskRoutes,    { prefix: '/tasks' });
  privateInstance.register(commentRoutes, { prefix: '/comments' });
});

// ── Root → Docs redirect ───────────────────────────────────────────────────────
app.get('/', async (_request, reply) => reply.redirect('/docs'));
app.get('/favicon.ico', async (_request, reply) => reply.status(204).send());
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
