import { createHash, randomBytes, randomUUID } from "node:crypto";
import { assertCondition } from "../../queries/types";
import { oauthDocument, oauthSuccess, oauthRedirect } from "./protocol";
import type { settingsTenants } from "../../content/settings/tenant";

export const OAUTH_CAPABILITIES = [
    "register-mcp-client",
    "prepare-mcp-authorization",
    "authorize-mcp-connection",
    "deny-mcp-authorization",
    "exchange-mcp-token",
    "resolve-mcp-connection",
    "list-mcp-connections",
    "revoke-mcp-connection",
] as const;
export type OAuthLease = Awaited<ReturnType<ReturnType<typeof settingsTenants>>>;

export async function oauthFixture(lease: OAuthLease, capability: string) {
    const tenant = lease.value;
    const client = tenant.client;
    const origin = tenant.session.origin;
    const callback = `http://localhost:${new URL(origin).port}/performance-oauth`;
    const verifier = randomBytes(48).toString("base64url");
    const state = randomUUID();
    const registration = { client_name: `Performance ${randomUUID()}`, redirect_uris: [callback] };
    const call = (id: string, input: Readonly<Record<string, unknown>>, assert = oauthSuccess) =>
        client("ulvia/cms.access", id, "http", { requestJson: JSON.stringify(input) }, (output) => {
            assert(output);
        });
    const checked = async (id: string, input: Readonly<Record<string, unknown>>) => {
        const result = await call(id, input);
        assertCondition(result.observation.validated);
        return oauthSuccess(result.output);
    };
    const registered = capability === "register-mcp-client" ? null : await checked("register-mcp-client", registration);
    const prepare = (clientId: unknown) => ({
        response_type: "code",
        client_id: clientId,
        redirect_uri: callback,
        resource: `${origin}/.cms/mcp`,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
        scope: "cms:full",
        state,
    });
    const prepared = !["register-mcp-client", "prepare-mcp-authorization"].includes(capability)
        ? await checked("prepare-mcp-authorization", prepare(registered!.client_id))
        : null;
    const authorized = ![
        "register-mcp-client",
        "prepare-mcp-authorization",
        "authorize-mcp-connection",
        "deny-mcp-authorization",
    ].includes(capability)
        ? await checked("authorize-mcp-connection", { requestId: prepared!.requestId })
        : null;
    const exchange = (redirect: Readonly<Record<string, unknown>>) => ({
        grant_type: "authorization_code",
        client_id: registered!.client_id,
        redirect_uri: callback,
        resource: `${origin}/.cms/mcp`,
        code: oauthRedirect(redirect, callback, state).searchParams.get("code"),
        code_verifier: verifier,
    });
    const exchanged = ["resolve-mcp-connection", "list-mcp-connections", "revoke-mcp-connection"].includes(capability)
        ? await checked("exchange-mcp-token", exchange(authorized!))
        : null;
    const grantId = exchanged ? String(exchanged.refresh_token).split(".")[0] : undefined;
    const input =
        capability === "register-mcp-client"
            ? registration
            : capability === "prepare-mcp-authorization"
              ? prepare(registered!.client_id)
              : ["authorize-mcp-connection", "deny-mcp-authorization"].includes(capability)
                ? { requestId: prepared!.requestId }
                : capability === "exchange-mcp-token"
                  ? exchange(authorized!)
                  : capability === "resolve-mcp-connection"
                    ? { token: exchanged!.access_token }
                    : capability === "revoke-mcp-connection"
                      ? { id: grantId }
                      : { limit: 100 };
    if (capability === "exchange-mcp-token") {
        const refused = await call(capability, { ...input, code_verifier: "a".repeat(64) }, oauthDocument);
        assertCondition(oauthDocument(refused.output).error === "invalid_grant");
    }
    return {
        tenant,
        call,
        checked,
        prepare,
        exchange,
        registration,
        registered,
        prepared,
        authorized,
        exchanged,
        grantId,
        input,
        callback,
        state,
    };
}
