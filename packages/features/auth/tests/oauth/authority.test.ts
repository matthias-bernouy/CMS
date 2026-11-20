import { expect, test } from "bun:test";
import type { AccessServices } from "auth/application/interfaces/AccessServices";
import { executeMcp } from "auth/application/core/access/mcp";
import { oauthFixture } from "./fixture";

test("MCP resolution reuses one live authority decision and keeps its public envelope unchanged", async () => {
    let revision: number | null = 7;
    let reads = 0;
    const f = await oauthFixture({
        canConnect: async () => true,
        inspectAuthority: async () => {
            reads++;
            return revision === null ? null : { revision };
        },
    });
    const token = await f.exchange(await f.code());
    const services = {
        mcpAuthorization: f.authorization,
        governance: {
            administrators: {
                get: async () => {
                    throw new Error("duplicate authority read");
                },
            },
        },
    } as unknown as AccessServices;
    const resolve = async () =>
        JSON.parse(
            (await executeMcp("resolve", JSON.stringify({ token: token.access_token }), services, {})).resultJson,
        );
    const first = await resolve();
    expect(first).toEqual({
        subjectId: "admin",
        connectionId: expect.any(String),
        mode: "full_access",
        authorizationRevision: 7,
    });
    revision = 8;
    expect(await resolve()).toEqual({ ...first, authorizationRevision: 8 });
    expect(reads).toBe(2);
    revision = null;
    expect(await resolve()).toEqual({ error: "invalid_token", status: 401 });
    revision = 9;
    await f.authorization.revoke(first.connectionId, "admin");
    await expect(f.authorization.resolveWithAuthority(token.access_token)).rejects.toThrow("invalid_token");
    expect(reads).toBe(3);
});

test("legacy policies retain the governance read and expired tokens never inspect authority", async () => {
    const f = await oauthFixture();
    const token = await f.exchange(await f.code());
    let reads = 0;
    const services = {
        mcpAuthorization: f.authorization,
        governance: {
            administrators: {
                get: async () => {
                    reads++;
                    return { enabled: true, revision: 12 };
                },
            },
        },
    } as unknown as AccessServices;
    const resolve = () => executeMcp("resolve", JSON.stringify({ token: token.access_token }), services, {});
    expect(JSON.parse((await resolve()).resultJson).authorizationRevision).toBe(12);
    expect(reads).toBe(1);
    f.advance(901_000);
    expect(JSON.parse((await resolve()).resultJson)).toEqual({ error: "invalid_token", status: 401 });
    expect(reads).toBe(1);
});
