/**
 * Owner identity — env-driven, never hardcoded chat ids in handlers.
 * OWNER_TELEGRAM_ID (numeric) and/or OWNER_USERNAME (without @).
 */

export function isOwner(userId: number | undefined, username?: string | undefined): boolean {
  if (userId == null) return false;
  const env = typeof process !== "undefined" ? process.env : undefined;
  const idRaw = env?.OWNER_TELEGRAM_ID?.trim();
  if (idRaw) {
    const id = Number(idRaw);
    if (Number.isFinite(id) && id === userId) return true;
  }
  const uname = env?.OWNER_USERNAME?.trim().replace(/^@/, "").toLowerCase();
  if (uname && username && username.toLowerCase() === uname) return true;
  return false;
}
