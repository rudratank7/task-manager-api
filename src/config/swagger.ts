import fp from 'fastify-plugin';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

/**
 * SWAGGER CONFIG  (src/config/swagger.ts)
 *
 * Registers the OpenAPI 3.0 documentation at /docs.
 * Disables Fastify's built-in JSON-schema validation because
 * Zod already handles all validation in controllers.
 */
export const swaggerConfig = fp(async (fastify: FastifyInstance) => {
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
      filter:       true,
    },
    staticCSP: true,
  });
});
