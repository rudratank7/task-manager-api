import { FastifyInstance } from 'fastify';
import * as authController from '../controllers/auth.controller.js';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', {
    schema: { tags: ['Auth'], summary: 'Register a new organization + admin user' },
  }, authController.register);

  fastify.post('/login', {
    schema: { tags: ['Auth'], summary: 'Login and receive access + refresh tokens' },
  }, authController.login);

  fastify.post('/refresh', {
    schema: { tags: ['Auth'], summary: 'Rotate refresh token' },
  }, authController.refresh);
}
