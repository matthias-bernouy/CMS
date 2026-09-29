import { canonicalIJsonBytes } from "./canonical";

/** Canonical SHA-256 revision for catalogue state. */
export async function catalogueRevision(value: unknown): Promise<string> {
    const bytes = canonicalIJsonBytes(value, 8);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
    return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
