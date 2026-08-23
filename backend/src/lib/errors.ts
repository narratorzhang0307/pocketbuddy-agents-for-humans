import type { FastifyReply } from 'fastify';

export function sendError(reply: FastifyReply, status: number, code: string, message: string, details: unknown = {}) {
  return reply.code(status).send({ error: { code, message, details } });
}

export class ServiceError extends Error {
  constructor(readonly code: string, message: string, readonly status = 500) {
    super(message);
    this.name = 'ServiceError';
  }
}
