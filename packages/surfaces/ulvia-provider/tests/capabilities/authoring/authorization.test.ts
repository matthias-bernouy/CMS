import { expect, test } from "bun:test";
import { authoringTransport } from "./transport";

test("signed Authoring requests refuse non-administrators, foreign instances and malformed inputs before any service call", async () => {
    const changes: string[] = [];
    const token = "pat_" + "x".repeat(43);
    const { call } = await authoringTransport({
        configureConnection: async (value) => {
            changes.push(value);
            return { configured: true, repositoryUrl: "https://repository.test", repositoryId: "repo" };
        },
    });
    expect((await call("configure-connection", { token }, { authenticated: false })).status).toBe(401);
    for (const actorKind of ["anonymous", "user"] as const) {
        expect((await call("configure-connection", { token }, { claims: { actorKind } })).status).toBe(403);
    }
    expect((await call("configure-connection", { token }, { claims: { instanceId: "foreign" } })).status).toBe(401);
    expect((await call("configure-connection", { token, namespace: "forged" })).status).toBe(400);
    expect((await call("configure-connection", { token: "" })).status).toBe(400);
    expect(changes).toEqual([]);
    const result = await call("configure-connection", { token });
    expect(result.status).toBe(200);
    const publicOutput = await result.text();
    expect(publicOutput).toContain('"configured":true');
    expect(publicOutput).not.toContain(token);
    expect(changes).toEqual([token]);
});

test("Authoring namespace inventory performs one service query per requested page and refuses excessive limits before reading", async () => {
    const requested: unknown[] = [];
    let loaded = 0;
    const { call } = await authoringTransport({
        listNamespaces: async (input) => {
            requested.push(input);
            const namespace = input?.cursor ? "second" : "first";
            loaded++;
            return {
                items: [
                    {
                        namespace,
                        repositoryId: "repo",
                        access: "owned",
                        revision: 1,
                        checkedAt: "2026-11-08T12:00:00.000Z",
                    },
                ],
                nextCursor: input?.cursor ? null : "next",
            };
        },
    });
    expect((await call("list-namespaces", { limit: 33 })).status).toBe(400);
    expect(requested).toHaveLength(0);
    const first = await call("list-namespaces", { limit: 1 });
    expect(first.status).toBe(200);
    expect((await first.json()).nextCursor).toBe("next");
    const second = await call("list-namespaces", { limit: 1, cursor: "next" });
    expect(second.status).toBe(200);
    expect((await second.json()).nextCursor).toBeNull();
    expect(requested).toEqual([{ limit: 1 }, { limit: 1, cursor: "next" }]);
    expect(loaded).toBe(2);
});

test("unexpected Authoring failures expose a generic localized refusal and no private exception data", async () => {
    const secret = "private-token-and-filesystem-path";
    const { call } = await authoringTransport({
        configureConnection: async () => {
            throw new Error(secret);
        },
    });
    const response = await call(
        "configure-connection",
        { token: "pat_" + "x".repeat(43) },
        { headers: { "accept-language": "fr" } },
    );
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain("CORE_UNAVAILABLE");
    expect(response.headers.get("content-language")).toBe("fr");
    expect(JSON.parse(text).error.output.message).toContain("temporairement indisponible");
    expect(text).not.toContain(secret);
});
