import type { Request } from 'express';
import { RequestActor, SystemActorRole } from './request-actor.types';

const SYSTEM_ROLES = new Set<SystemActorRole>(['SYSTEM_ADMIN', 'SERVICE']);

function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function extractRequestActor(request: Request): RequestActor {
  const userId = getHeaderValue(request.headers['x-user-id'])?.trim();
  const systemRoleHeader = getHeaderValue(request.headers['x-system-role'])?.trim();
  const actorName = getHeaderValue(request.headers['x-actor-name'])?.trim();

  const systemRole =
    systemRoleHeader && SYSTEM_ROLES.has(systemRoleHeader as SystemActorRole)
      ? (systemRoleHeader as SystemActorRole)
      : undefined;

  return {
    userId: userId || undefined,
    systemRole,
    name: actorName || undefined,
  };
}
