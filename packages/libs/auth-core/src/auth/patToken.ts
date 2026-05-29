import { randomBytes, createHash } from "node:crypto";

/**
 * The Personal Access Token format, defined ONCE so every `PatRepository` impl
 * mints + hashes identically (the `pat_` prefix + 256-bit body is a contract —
 * splitting it across impls invites drift).
 *
 * Only the hash is ever persisted; the plaintext is returned to the user once.
 */
export const mintPatToken = (): string => `pat_${randomBytes(32).toString("base64url")}`;

export const hashPatToken = (token: string): string =>
    createHash("sha256").update(token).digest("hex");
