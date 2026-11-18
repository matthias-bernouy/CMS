import { isolatedOrigin, responseBytes } from "../transport/http";
import { ClientFailure } from "./failure";

type Token = { access_token: string; refresh_token: string; expires_in: number };
type Session = Readonly<{ origin: string; clientId: string; token: Token }>;
type Ports = Readonly<{ fetch: (input: string, init: RequestInit) => Promise<Response>; now: () => number }>;

/** Renew only in scenario preparation; token exchange never inflates measured capability latency. */
export function mcpTokenRefresh(session: Session, ports: Ports = { fetch, now: Date.now }) {
    const origin = isolatedOrigin(session.origin);
    let expiresAt = ports.now() + session.token.expires_in * 1_000;
    let pending: Promise<void> | undefined;
    const refresh = async () => {
        try {
            const response = await ports.fetch(`${origin}/.cms/oauth/token`, {
                method: "POST",
                redirect: "error",
                signal: AbortSignal.timeout(15_000),
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    grant_type: "refresh_token",
                    client_id: session.clientId,
                    resource: `${origin}/.cms/mcp`,
                    refresh_token: session.token.refresh_token,
                }),
            });
            if (!response.ok) {
                await response.body?.cancel();
                throw new Error("Token exchange refused");
            }
            const value = JSON.parse(new TextDecoder().decode(await responseBytes(response, 16 * 1024))) as Token;
            if (
                ![value.access_token, value.refresh_token].every(
                    (token) => typeof token === "string" && token.length > 0 && token.length <= 8192,
                ) ||
                !Number.isSafeInteger(value.expires_in) ||
                value.expires_in < 1 ||
                value.expires_in > 86_400
            ) {
                throw new Error("Invalid token exchange result");
            }
            session.token.access_token = value.access_token;
            session.token.refresh_token = value.refresh_token;
            session.token.expires_in = value.expires_in;
            expiresAt = ports.now() + value.expires_in * 1_000;
        } catch {
            throw new ClientFailure("fixture-mcp-token-refresh-failed");
        }
    };
    return async (minimumValidityMs = 60_000) => {
        if (expiresAt - ports.now() > minimumValidityMs) {
            return;
        }
        pending ??= refresh().finally(() => {
            pending = undefined;
        });
        await pending;
    };
}
