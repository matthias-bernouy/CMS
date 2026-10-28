import { McpAuthorization, InMemoryOAuthStore, OAuthError } from "@bernouy/cms-auth/oauth";
import { createCmsMcpHandler } from "@bernouy/cms-edge";
import { createMcpTestContract } from "./contracts";
import type { GatewayActor, GatewayInvocation, GatewayInvoker, GatewayResult } from "@bernouy/cms-gateway";
import { createHash } from "node:crypto";

export async function cmsMcpFixture() {
    let administrator = true;
    const resource = "http://127.0.0.1:5100/.cms/mcp";
    const store = new InMemoryOAuthStore();
    const authorization = new McpAuthorization(
        store,
        { canConnect: async (id) => id === "admin" && administrator },
        resource,
        new TextEncoder().encode("x".repeat(32)),
    );
    const withCommand = await createMcpTestContract();
    const mutations: { contractId: string; capabilityId: string }[] = [];
    const invocations: GatewayInvocation[] = [];
    const invoker: GatewayInvoker = {
        async invoke(call): Promise<GatewayResult> {
            invocations.push(call);
            if (call.capabilityId === "login-password") {
                if ((call.input as { password: string }).password !== "valid-password") {
                    return {
                        kind: "declared-error",
                        requestId: "login",
                        errorCode: "INVALID_CREDENTIALS",
                        retryable: false,
                    };
                }
                return {
                    kind: "success",
                    requestId: "login",
                    output: { subjectId: "admin", administrator },
                    responseEffect: {
                        type: "session",
                        operation: "establish",
                        token: "session-token",
                        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
                    },
                };
            }
            if (call.contractId === "test.cms") {
                if (call.actor.kind !== "administrator") {
                    throw new Error("Untrusted actor");
                }
                return { kind: "success", requestId: "echo", output: { ok: true } };
            }
            if (call.contractId === "ulvia.cms.files" && call.capabilityId === "upload.write") {
                return { kind: "success", requestId: "upload", output: {} };
            }
            if (call.contractId === "ulvia.cms.installations") {
                return { kind: "success", requestId: "collections", output: { revision: 1, items: [] } };
            }
            const input = JSON.parse((call.input as { requestJson: string }).requestJson);
            let result: unknown;
            try {
                const sub = call.actor.kind === "administrator" ? call.actor.subjectId : "member";
                switch (call.capabilityId) {
                    case "register-mcp-client":
                        result = await authorization.register(input);
                        break;
                    case "prepare-mcp-authorization":
                        result = await authorization.prepare(input);
                        break;
                    case "authorize-mcp-connection":
                        result = await authorization.authorize(input.requestId, sub);
                        break;
                    case "deny-mcp-authorization":
                        result = await authorization.deny(input.requestId);
                        break;
                    case "exchange-mcp-token":
                        result = await authorization.exchange(input);
                        break;
                    case "resolve-mcp-connection":
                        result = { ...(await authorization.resolve(input.token)), authorizationRevision: 3 };
                        break;
                    case "list-mcp-connections":
                        result = await authorization.list(sub, input);
                        break;
                    case "revoke-mcp-connection":
                        result = await authorization.revoke(input.id, sub);
                        break;
                    default:
                        throw new Error("Unexpected capability");
                }
            } catch (error) {
                if (!(error instanceof OAuthError)) {
                    throw error;
                }
                result = { error: error.code, status: error.status };
            }
            return { kind: "success", requestId: "access", output: { resultJson: JSON.stringify(result) } };
        },
    };
    const handle = createCmsMcpHandler({
        publicUrl: resource,
        invoker,
        contracts: async () => [withCommand],
        onMutationSuccess: (event) => {
            mutations.push(event);
        },
        resolveActor: async (request): Promise<GatewayActor> =>
            request.headers.get("cookie")?.includes("cms-session=session-token")
                ? { kind: administrator ? "administrator" : "user", subjectId: "admin" }
                : { kind: "anonymous" },
    });
    const request = async (path: string, init?: RequestInit) => {
        const result = await handle(new Request(new URL(path, resource), init));
        if (!result) {
            throw new Error("Route not mounted");
        }
        return result;
    };
    const connect = async () => {
        const registration = await request("/.cms/oauth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_name: "Claude <script>",
                redirect_uris: ["https://client.example/callback"],
            }),
        });
        const client = (await registration.json()) as { client_id: string };
        const verifier = "v".repeat(64);
        const params = {
            client_id: client.client_id,
            redirect_uri: "https://client.example/callback",
            resource,
            response_type: "code",
            code_challenge_method: "S256",
            code_challenge: createHash("sha256").update(verifier).digest("base64url"),
            state: "expected-state",
        };
        const consent = await request(`/.cms/oauth/authorize?${new URLSearchParams(params)}`);
        const html = await consent.text();
        const flow = consent.headers.get("set-cookie")!.split(";")[0]!;
        const requestId = /name="requestId" value="([^"]+)"/u.exec(html)![1]!;
        return { client, verifier, consent, html, flow, requestId };
    };
    return {
        request,
        authorization,
        store,
        handle,
        resource,
        invocations,
        mutations,
        connect,
        demote: () => {
            administrator = false;
        },
    };
}
