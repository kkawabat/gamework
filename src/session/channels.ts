import { EntityId } from './SessionTypes';

/**
 * Stands for the writing/reading entity's own id inside a role's channel
 * patterns. Without it a role cannot express "my own hand" — `hand:*` would
 * grant every hand, which is precisely the information a private channel
 * exists to withhold.
 */
export const SELF = '{self}';

export function resolveChannel(pattern: string, self: EntityId): string {
  return pattern.split(SELF).join(self);
}

/**
 * A pattern matches a channel exactly, or by prefix when it ends in `*`.
 * The wildcard is for roles that legitimately see everything — a dungeon
 * master, a debug spectator — and should be rare enough to notice in a diff.
 */
export function channelMatches(pattern: string, channel: string, self: EntityId): boolean {
  const resolved = resolveChannel(pattern, self);
  if (resolved.endsWith('*')) return channel.startsWith(resolved.slice(0, -1));
  return resolved === channel;
}

export function anyMatches(patterns: string[], channel: string, self: EntityId): boolean {
  return patterns.some((pattern) => channelMatches(pattern, channel, self));
}
