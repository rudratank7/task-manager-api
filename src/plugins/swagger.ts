/**
 * SWAGGER / OPENAPI PLUGIN  (src/plugins/swagger.ts)
 *
 * WHY SWAGGER?
 * Swagger (OpenAPI 3.0) gives you an interactive UI at /docs where you can
 * read every endpoint, see its inputs/outputs, and test it directly in the browser
 * — no Postman needed.
 *
 * HOW IT WORKS WITH FASTIFY + ZOD:
 * We DISABLE Fastify's built-in JSON-schema validation (setValidatorCompiler)
 * because Zod already handles all validation in our route handlers.
 * The `schema` objects on routes are used ONLY for generating the Swagger docs —
 * they never actually validate anything at runtime.
 *
 * FLOW:
 *   request → Fastify router → route handler → Zod validates → service → response
 *                          ↑
 *                  (schema used for docs only, NOT validation)
 */
import fp from 'fastify-plugin';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

export const swaggerPlugin = fp(async (fastify: FastifyInstance) => {
  // Disable Fastify's built-in schema validator — Zod handles all validation
  fastify.setValidatorCompiler(() => () => true);

  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title:       'Task Manager API',
        description: `
RESTful task management API.

**Auth flow:**
1. \`POST /auth/register\` — create org + admin user, receive access + refresh tokens
2. Add \`Authorization: Bearer <accessToken>\` header to all protected requests
3. When access token expires (15 min), call \`POST /auth/refresh\`
        `,
        version: '1.0.0',
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Local development' },
      ],
      components: {
        securitySchemes: {
          // Every protected route declares: security: [{ bearerAuth: [] }]
          bearerAuth: {
            type:         'http',
            scheme:       'bearer',
            bearerFormat: 'JWT',
            description:  'Access token from /auth/login or /auth/register',
          },
        },
      },
      tags: [
        { name: 'Health',   description: 'Service health' },
        { name: 'Auth',     description: 'Register, login, token refresh' },
        { name: 'Projects', description: 'Project CRUD (write ops: admin only)' },
        { name: 'Tasks',    description: 'Task CRUD + bulk update + full-text search' },
        { name: 'Comments', description: 'Comments on tasks' },
      ],
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking:  true,
      filter:       true,     // search bar in the UI
    },
    staticCSP: true,
  });
});
