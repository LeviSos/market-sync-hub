/**
 * Owner identity. Staff access is bound to unique account ids, never to a
 * display name: anyone can rename themselves "levasikov", but nobody else
 * owns these ids.
 */
export const OWNER_USER_IDS = [
  "11ae2abc-3010-48c9-8f99-a3dc68ba905d",
  "44171ea3-864c-4f0a-a8ec-4c987abc2bdd",
];

export const OWNER_STEAM_IDS = ["76561198387560455"];

const norm = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();

export function isOwnerId(ids: {
  userId?: string | null;
  profileId?: string | null;
  steamId?: string | null;
}) {
  const users = OWNER_USER_IDS.map(norm);
  const steams = OWNER_STEAM_IDS.map(norm);
  return (
    users.includes(norm(ids.userId)) ||
    users.includes(norm(ids.profileId)) ||
    steams.includes(norm(ids.steamId)) ||
    steams.includes(norm(ids.profileId))
  );
}
