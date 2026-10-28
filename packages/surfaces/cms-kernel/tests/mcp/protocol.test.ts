import { mcpActor } from "cms-kernel/http/mcp/protocol";
import { expect, test } from "bun:test";
import { cmsMcpFixture } from "./fixture";
import { connected } from "./connection";

const mcpHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-11-25",
});

test("CMS OAuth discovery, consent, authenticated tools and resources use one client-neutral endpoint", async () => {
    const f = await cmsMcpFixture();
    const unauthorized = await f.request("/.cms/mcp", { method: "POST", body: "{}" });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toContain("oauth-protected-resource");
    const metadata = (await (await f.request("/.well-known/oauth-authorization-server")).json()) as {
        code_challenge_methods_supported: string[];
    };
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
    const token = await connected(f);
    const rpc = async (method: string, params = {}) =>
        (await (
            await f.request("/.cms/mcp", {
                method: "POST",
                headers: mcpHeaders(token.access_token),
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
            })
        ).json()) as { result: any };
    expect((await rpc("initialize")).result.capabilities).toEqual({ tools: {}, resources: {} });
    const tools = (await rpc("tools/list")).result.tools;
    expect(tools).toHaveLength(2);
    expect(tools[0].outputSchema.type).toBe("object");
    expect(
        (await rpc("tools/call", { name: "echo", arguments: { input: {} } })).result.structuredContent.output.ok,
    ).toBe(true);
    expect(f.mutations).toEqual([]);
    await rpc("tools/call", { name: "update", arguments: { input: {} } });
    expect(f.mutations).toEqual([{ contractId: "test.cms", capabilityId: "update" }]);
    const invocation = f.invocations.findLast((call) => call.contractId === "test.cms")!;
    expect(invocation.actor).toEqual({ kind: "administrator", subjectId: "admin", authorizationRevision: 3 });
    expect((await rpc("resources/list")).result.resources).toHaveLength(4);
    expect(
        (await rpc("resources/read", { uri: "ulvia://cms/installed-collections" })).result.contents[0].text,
    ).toContain('"revision":1');
    f.demote();
    expect(
        (await f.request("/.cms/mcp", { method: "POST", headers: mcpHeaders(token.access_token), body: "{}" })).status,
    ).toBe(401);
});

test("consent and connection revocation require browser CSRF binding and current account authority", async () => {
    const f = await cmsMcpFixture();
    const c = await f.connect();
    const body = new URLSearchParams({ requestId: c.requestId, decision: "allow" });
    expect(
        (
            await f.request("/.cms/oauth/authorize", {
                method: "POST",
                headers: {
                    Origin: "https://attacker.example",
                    Cookie: c.flow,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body,
            })
        ).status,
    ).toBe(403);
    expect((await f.request("/.cms/connections")).status).toBe(403);
    const token = await connected(f);
    const connections = await f.request("/.cms/connections", { headers: { Cookie: "cms-session=session-token" } });
    const html = await connections.text();
    const id = /name="id" value="([^"]+)"/u.exec(html)![1]!;
    const csrf = /name="csrf" value="([^"]+)"/u.exec(html)![1]!;
    const cookie = connections.headers.get("set-cookie")!.split(";")[0]!;
    const revoked = await f.request("/.cms/connections", {
        method: "POST",
        headers: {
            Origin: "http://127.0.0.1:5100",
            Cookie: `cms-session=session-token; ${cookie}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ csrf, id }),
    });
    expect(revoked.status).toBe(303);
    expect(
        (await f.request("/.cms/mcp", { method: "POST", headers: mcpHeaders(token.access_token), body: "{}" })).status,
    ).toBe(401);
});

test("MCP delegation context rejects missing or invalid authorization revisions", () => {
    for (const authorizationRevision of [undefined, null, -1, 1.5, "3"]) {
        expect(() => mcpActor({ subjectId: "admin", authorizationRevision })).toThrow("invalid_token");
    }
    expect(mcpActor({ subjectId: "admin", authorizationRevision: 3 })).toEqual({
        kind: "administrator",
        subjectId: "admin",
        authorizationRevision: 3,
    });
});
