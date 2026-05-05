// Credentials store for the `p9r` CLI. One JSON file per user at
// `~/.config/p9r/credentials.json`, keyed by CMS base URL so a single
// machine can hold tokens for multiple deployments side-by-side.
//
// Tokens are Keycloak access tokens minted via the Device Authorization
// Grant — see `CLI_login.ts`. The refresh token is stored alongside so the
// CLI can roll forward without re-prompting the user every 5 minutes.

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

export type CredentialEntry = {
    cmsUrl:        string;
    issuer:        string;
    clientId:      string;
    accessToken:   string;
    refreshToken?: string;
    /** Epoch milliseconds. */
    expiresAt:     number;
};

type Store = { version: 1; entries: Record<string, CredentialEntry> };

const STORE_DIR  = join(homedir(), ".config", "p9r");
const STORE_PATH = join(STORE_DIR, "credentials.json");

function normalize(url: string): string {
    return url.replace(/\/+$/, "");
}

async function readStore(): Promise<Store> {
    try {
        const raw = await Bun.file(STORE_PATH).text();
        const parsed = JSON.parse(raw) as Store;
        if (parsed && parsed.version === 1 && parsed.entries) return parsed;
    } catch { /* missing / unreadable / corrupt → empty store */ }
    return { version: 1, entries: {} };
}

async function writeStore(store: Store): Promise<void> {
    await mkdir(STORE_DIR, { recursive: true, mode: 0o700 });
    await Bun.write(STORE_PATH, JSON.stringify(store, null, 2));
}

export async function saveCredentials(entry: CredentialEntry): Promise<void> {
    const store = await readStore();
    store.entries[normalize(entry.cmsUrl)] = { ...entry, cmsUrl: normalize(entry.cmsUrl) };
    await writeStore(store);
}

export async function loadCredentials(cmsUrl: string): Promise<CredentialEntry | null> {
    const store = await readStore();
    return store.entries[normalize(cmsUrl)] ?? null;
}

export async function deleteCredentials(cmsUrl: string): Promise<void> {
    const store = await readStore();
    delete store.entries[normalize(cmsUrl)];
    await writeStore(store);
}

/**
 * Fetches a fresh access token for `cmsUrl` if the cached one is close to
 * expiry. Falls back to `P9R_TOKEN` env var when no entry exists (legacy
 * static-token mode kept for backwards compatibility).
 *
 * Returns `null` when neither a valid stored entry nor an env-var token
 * is available — callers should print a "run `p9r login`" hint.
 */
export async function getAccessToken(cmsUrl: string): Promise<string | null> {
    const env = Bun.env.P9R_TOKEN;
    const entry = await loadCredentials(cmsUrl);
    if (!entry) return env ?? null;

    // Refresh ~30 s before actual expiry so a slow first request still
    // lands on a valid token.
    const safeExpiry = entry.expiresAt - 30_000;
    if (Date.now() < safeExpiry) return entry.accessToken;

    if (!entry.refreshToken) return env ?? null;
    const refreshed = await refreshTokens(entry);
    if (!refreshed) return env ?? null;
    await saveCredentials(refreshed);
    return refreshed.accessToken;
}

async function refreshTokens(entry: CredentialEntry): Promise<CredentialEntry | null> {
    const body = new URLSearchParams({
        grant_type:    "refresh_token",
        client_id:     entry.clientId,
        refresh_token: entry.refreshToken!,
    });
    const res = await fetch(`${entry.issuer}/protocol/openid-connect/token`, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!res.ok) return null;
    const json = await res.json() as {
        access_token:  string;
        refresh_token?: string;
        expires_in:    number;
    };
    return {
        ...entry,
        accessToken:   json.access_token,
        refreshToken:  json.refresh_token ?? entry.refreshToken,
        expiresAt:     Date.now() + json.expires_in * 1000,
    };
}
