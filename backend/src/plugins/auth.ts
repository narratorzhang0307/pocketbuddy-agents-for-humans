import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendError } from '../lib/errors.js';

export interface AuthIdentity { uid: string }
export type TokenVerifier = (token: string) => Promise<AuthIdentity>;

export function productionTokenVerifier(): TokenVerifier {
  if (!getApps().length) initializeApp({ credential: applicationDefault() });
  return async (token) => {
    const decoded = await getAuth().verifyIdToken(token, true);
    return { uid: decoded.uid };
  };
}

export function configuredTokenVerifier(env: NodeJS.ProcessEnv = process.env): TokenVerifier {
  if (env.NODE_ENV !== 'production' && env.ALLOW_DEV_AUTH === 'true') {
    const accepted = env.SKILL_DEV_AUTH_TOKEN || 'pocketbuddy-local-dev';
    return async (token) => {
      if (token !== accepted) throw new Error('invalid_dev_token');
      return { uid: env.SKILL_DEV_UID || 'local-dev-user' };
    };
  }
  return productionTokenVerifier();
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  verifyToken: TokenVerifier,
): Promise<AuthIdentity | null> {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    sendError(reply, 401, 'unauthenticated', 'Firebase ID Token required');
    return null;
  }
  try {
    return await verifyToken(token);
  } catch {
    sendError(reply, 401, 'unauthenticated', 'Firebase ID Token invalid or expired');
    return null;
  }
}
