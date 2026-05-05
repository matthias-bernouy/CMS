// `p9r login [--url=...]` — interactive Keycloak Device Authorization Grant
// flow. Polls Keycloak's /token endpoint until the user completes the
// browser step, then persists the result via `credentials.ts`.
//
// Usage:
//   p9r login                         # uses P9R_URL from env / .env
//   p9r login --url=https://test-cms.bernouy.com/cms

import { saveCredentials, deleteCredentials } from "./credentials";

type Discovery = { issuer: string; clientId: string };
type DeviceCodeResponse = {
    device_code:               string;
    user_code:                 string;
    verification_uri:          string;
    verification_uri_complete?: string;
    expires_in:                number;
    interval:                  number;
};

export default async function CLI_login(args: string[]): Promise<void> {
    const cmsUrl = parseUrlArg(args) ?? Bun.env.P9R_URL;
    if (!cmsUrl) {
        console.error("✖ Provide a CMS URL via --url=... or set P9R_URL.");
        process.exit(2);
    }

    const discovery = await discover(cmsUrl);
    const device = await mintDeviceCode(discovery);
    promptUser(device);

    const tokens = await pollForTokens(discovery, device);
    await saveCredentials({
        cmsUrl,
        issuer:        discovery.issuer,
        clientId:      discovery.clientId,
        accessToken:   tokens.access_token,
        refreshToken:  tokens.refresh_token,
        expiresAt:     Date.now() + tokens.expires_in * 1000,
    });
    console.log(`✔ Logged in to ${cmsUrl}`);
}

export async function CLI_logout(args: string[]): Promise<void> {
    const cmsUrl = parseUrlArg(args) ?? Bun.env.P9R_URL;
    if (!cmsUrl) {
        console.error("✖ Provide a CMS URL via --url=... or set P9R_URL.");
        process.exit(2);
    }
    await deleteCredentials(cmsUrl);
    console.log(`✔ Removed credentials for ${cmsUrl}`);
}

function parseUrlArg(args: string[]): string | undefined {
    const flag = args.find(a => a.startsWith("--url="));
    return flag?.slice("--url=".length);
}

async function discover(cmsUrl: string): Promise<Discovery> {
    const url = `${cmsUrl.replace(/\/+$/, "")}/api/auth/discovery`;
    const res = await fetch(url);
    if (!res.ok) {
        console.error(`✖ Discovery failed (${res.status}) at ${url}.`);
        console.error("  Server probably not running cms-control 0.1.8+ with bearer auth wired.");
        process.exit(3);
    }
    return await res.json() as Discovery;
}

async function mintDeviceCode(d: Discovery): Promise<DeviceCodeResponse> {
    const res = await fetch(`${d.issuer}/protocol/openid-connect/auth/device`, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    new URLSearchParams({ client_id: d.clientId }),
    });
    if (!res.ok) {
        console.error(`✖ Keycloak device endpoint refused (${res.status}). Check that client "${d.clientId}" has Device Authorization Grant enabled.`);
        process.exit(4);
    }
    return await res.json() as DeviceCodeResponse;
}

function promptUser(d: DeviceCodeResponse): void {
    const url = d.verification_uri_complete ?? `${d.verification_uri}?user_code=${d.user_code}`;
    console.log("");
    console.log("→ Open this URL in your browser to confirm the login:");
    console.log(`  ${url}`);
    console.log("");
    console.log(`  (or visit ${d.verification_uri} and enter code: ${d.user_code})`);
    console.log("");
    console.log("Waiting…");
}

async function pollForTokens(
    d: Discovery,
    device: DeviceCodeResponse,
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
    const intervalMs = Math.max(device.interval, 1) * 1000;
    const deadline = Date.now() + device.expires_in * 1000;

    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, intervalMs));
        const res = await fetch(`${d.issuer}/protocol/openid-connect/token`, {
            method:  "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body:    new URLSearchParams({
                grant_type:  "urn:ietf:params:oauth:grant-type:device_code",
                client_id:   d.clientId,
                device_code: device.device_code,
            }),
        });
        if (res.ok) return await res.json() as { access_token: string; refresh_token?: string; expires_in: number };

        // Standard device-flow polling errors — keep waiting.
        const err = await res.json().catch(() => ({})) as { error?: string };
        if (err.error === "authorization_pending" || err.error === "slow_down") continue;

        console.error(`✖ Authorization failed: ${err.error ?? res.statusText}`);
        process.exit(5);
    }
    console.error("✖ Authorization timed out — please run `p9r login` again.");
    process.exit(6);
}
