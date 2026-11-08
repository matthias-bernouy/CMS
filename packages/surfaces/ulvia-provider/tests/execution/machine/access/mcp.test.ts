import { expect, test } from "bun:test";
import { OAuthError } from "@bernouy/auth/oauth";
import { accessServices } from "./services";
import { accessTransport } from "./transport";

test("Access MCP delegates each action and keeps OAuth refusals in successful protocol result documents", async () => {
    const ports = accessServices();
    const actions: string[] = [];
    ports.governance.identities.resolve = async () => "member";
    ports.governance.administrators.get = async (sub) => ({ sub, enabled: true, revision: 7, bootstrap: false });
    ports.mcpAuthorization.deny = async (id) => {
        actions.push(`deny:${id}`);
        throw new OAuthError("access_denied", 403);
    };
    ports.mcpAuthorization.register = async () => {
        actions.push("register");
        return { client_id: "client" } as never;
    };
    ports.mcpAuthorization.prepare = async () => {
        actions.push("prepare");
        return { requestId: "prepared" } as never;
    };
    ports.mcpAuthorization.exchange = async () => {
        actions.push("exchange");
        return { access_token: "opaque-private" } as never;
    };
    ports.mcpAuthorization.resolve = async () => {
        actions.push("resolve");
        return { subjectId: "member", authorizationRevision: 1 } as never;
    };
    ports.mcpAuthorization.authorize = async (id, sub) => {
        actions.push(`authorize:${id}:${sub}`);
        return { code: "code" } as never;
    };
    ports.mcpAuthorization.list = async (sub) => {
        actions.push(`list:${sub}`);
        return [] as never;
    };
    ports.mcpAuthorization.revoke = async (id, sub) => {
        actions.push(`revoke:${id}:${sub}`);
        return { revoked: true } as never;
    };
    const { call } = await accessTransport(ports);
    for (const [id, request] of [
        ["deny-mcp-authorization", { requestId: "denied" }],
        ["register-mcp-client", {}],
        ["prepare-mcp-authorization", {}],
        ["exchange-mcp-token", {}],
        ["resolve-mcp-connection", { token: "opaque-private" }],
        ["authorize-mcp-connection", { requestId: "reviewed" }],
        ["list-mcp-connections", {}],
        ["revoke-mcp-connection", { id: "grant" }],
    ] as const) {
        const response = await call(id, { requestJson: JSON.stringify(request) }, { subjectId: "trusted-alias" });
        expect(response.status, id).toBe(200);
        const result = JSON.parse((await response.json()).resultJson);
        if (id === "deny-mcp-authorization") {
            expect(result).toEqual({ error: "access_denied", status: 403 });
        }
        if (id === "resolve-mcp-connection") {
            expect(result.authorizationRevision).toBe(7);
        }
    }
    expect(actions).toEqual([
        "deny:denied",
        "register",
        "prepare",
        "exchange",
        "resolve",
        "authorize:reviewed:member",
        "list:member",
        "revoke:grant:member",
    ]);
    const before = actions.length;
    for (const requestJson of ["[]", "null", '{"a":1,"a":2}', "{".repeat(18)]) {
        expect((await call("register-mcp-client", { requestJson })).ok).toBe(false);
    }
    expect(actions).toHaveLength(before);
    ports.governance.administrators.get = async (sub) => ({ sub, enabled: false, revision: 8, bootstrap: false });
    const revoked = await call("resolve-mcp-connection", { requestJson: JSON.stringify({ token: "opaque-private" }) });
    expect(revoked.status).toBe(200);
    expect(JSON.parse((await revoked.json()).resultJson)).toEqual({ error: "access_denied", status: 403 });
});
