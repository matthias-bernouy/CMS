// Bearer store for the `p9r` CLI. The bearer is a CMS Personal Access Token
// (`pat_...`), created in the admin Profile page and sent as
// `Authorization: Bearer <pat>`. It is provider-agnostic: it authenticates as
// the issuing user no matter how they log in to the CMS.
//
// Supply the PAT one of two ways:
//   - `P9R_TOKEN=pat_...` in the environment / .env, or
//   - an entry in `~/.config/p9r/credentials.json` (see `CredentialEntry`),
//     keyed by CMS base URL so one machine can hold tokens for several
//     deployments side by side.

import { homedir } from "node:os";
import { join } from "node:path";

export type CredentialEntry = {
    cmsUrl: string;
    /** A CMS Personal Access Token (`pat_...`). */
    token: string;
};

type Store = { version: 1; entries: Record<string, CredentialEntry> };

const STORE_PATH = join(homedir(), ".config", "p9r", "credentials.json");

function normalize(url: string): string {
    return url.replace(/\/+$/, "");
}

async function readStore(): Promise<Store> {
    try {
        const parsed = JSON.parse(await Bun.file(STORE_PATH).text()) as Store;
        if (parsed && parsed.version === 1 && parsed.entries) {
            return parsed;
        }
    } catch {
        /* missing / unreadable / corrupt → empty store */
    }
    return { version: 1, entries: {} };
}

/**
 * Resolves the bearer for `cmsUrl`: a stored `credentials.json` entry first,
 * then the `P9R_TOKEN` env var. Returns `null` when neither is set — callers
 * should hint the user to create a token in the CMS Profile page.
 */
export async function getAccessToken(cmsUrl: string): Promise<string | null> {
    const store = await readStore();
    const entry = store.entries[normalize(cmsUrl)];
    return entry?.token ?? Bun.env.P9R_TOKEN ?? null;
}
