import { createHash } from "node:crypto";
import { InMemoryOAuthStore, McpAuthorization } from "@bernouy/cms-auth/oauth";

export async function oauthFixture() {
    const store = new InMemoryOAuthStore();
    let now = Date.now();
    let administrator = true;
    const resource = "https://cms.example/.cms/mcp";
    const authorization = new McpAuthorization(
        store,
        { canConnect: async (sub) => sub === "admin" && administrator },
        resource,
        new TextEncoder().encode("x".repeat(32)),
        () => now,
    );
    const client = await authorization.register({
        client_name: "Test client",
        redirect_uris: ["https://client.example/callback"],
    });
    const verifier = "v".repeat(64);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const request = {
        client_id: client.client_id,
        redirect_uri: client.redirect_uris[0],
        resource,
        response_type: "code",
        code_challenge_method: "S256",
        code_challenge: challenge,
        state: "state-123",
        scope: "cms:full",
    };
    const prepare = () => authorization.prepare(request);
    const code = async () => {
        const pending = await prepare();
        return new URL((await authorization.authorize(pending.requestId, "admin")).redirectUri).searchParams.get(
            "code",
        )!;
    };
    const exchange = (code: string, overrides: Record<string, unknown> = {}) =>
        authorization.exchange({
            grant_type: "authorization_code",
            client_id: client.client_id,
            redirect_uri: client.redirect_uris[0],
            resource,
            code_verifier: verifier,
            code,
            ...overrides,
        });
    return {
        authorization,
        store,
        client,
        resource,
        verifier,
        request,
        prepare,
        code,
        exchange,
        advance: (milliseconds: number) => {
            now += milliseconds;
        },
        demote: () => {
            administrator = false;
        },
    };
}
