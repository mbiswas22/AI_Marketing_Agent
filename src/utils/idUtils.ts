export const generateUserId = (): string =>
  "USR-" + Math.random().toString(36).slice(2, 8).toUpperCase();

export const generateBusinessId = (): string =>
  "BIZ-" + Math.random().toString(36).slice(2, 8).toUpperCase();

export const generateInvitationId = (): string => crypto.randomUUID();
