import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type EntityKey =
    | `page:${string}`
    | `template:${string}`
    | `file:${string}`
    | `integration:${string}`
    | "system";

export type EntityState = {
    /** Hash of the local payload at last successful push/pull. */
    hash:           string;
    /** Hash of the remote payload at last successful push/pull. */
    lastSeenRemote: string;
};

export type PushState = {
    tenant:     string;
    lastPulled: string;
    entities:   Partial<Record<EntityKey, EntityState>>;
};

const STATE_FILE = ".p9r-state.json";

const EMPTY: PushState = { tenant: "", lastPulled: "", entities: {} };

/**
 * Load the local sync state. Missing or malformed file yields an empty
 * state — the CLI proceeds as if nothing has been pushed before.
 */
export async function loadState(siteDir: string): Promise<PushState> {
    const path = join(siteDir, STATE_FILE);
    if (!existsSync(path)) return { ...EMPTY };
    try {
        const raw = JSON.parse(await readFile(path, "utf-8")) as Partial<PushState>;
        return {
            tenant:     typeof raw.tenant     === "string" ? raw.tenant     : "",
            lastPulled: typeof raw.lastPulled === "string" ? raw.lastPulled : "",
            entities:   raw.entities && typeof raw.entities === "object" ? raw.entities : {},
        };
    } catch {
        return { ...EMPTY };
    }
}

export async function saveState(siteDir: string, state: PushState): Promise<void> {
    const path = join(siteDir, STATE_FILE);
    await writeFile(path, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

/**
 * Returns "conflict" when the remote hash has drifted away from what we
 * last saw — typically because someone edited the page via the UI between
 * two pushes. `--force` bypasses the check.
 */
export function detectConflict(
    state: PushState,
    key: EntityKey,
    remoteHash: string | null,
): boolean {
    const seen = state.entities[key]?.lastSeenRemote;
    if (!seen) return false;          // never pushed → not a conflict
    if (remoteHash === null) return false; // remote gone → caller treats as new
    return seen !== remoteHash;
}
