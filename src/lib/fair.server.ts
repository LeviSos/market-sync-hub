import { createHash, createHmac, randomBytes } from "node:crypto";

/** Provably fair: HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${round}`). */
export function newServerSeed(): { seed: string; hash: string } {
  const seed = randomBytes(32).toString("hex");
  return { seed, hash: createHash("sha256").update(seed).digest("hex") };
}

export function hashSeed(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

export function roll(serverSeed: string, clientSeed: string, nonce: number, round = 0): number {
  const hmac = createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}:${round}`)
    .digest("hex");
  // 52 bits of entropy -> [0, 1)
  return parseInt(hmac.slice(0, 13), 16) / 2 ** 52;
}
