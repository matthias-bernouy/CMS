import { expect, test } from "bun:test";
import { mcpTokenRefresh } from "./refresh";

test("long campaigns coalesce refreshes and rotate both credentials without renewing still-valid sessions", async () => {
    let now = 0;
    let requests = 0;
    const supplied: string[] = [];
    const token = { access_token: "initial-access", refresh_token: "initial-refresh", expires_in: 900 };
    const ensure = mcpTokenRefresh(
        { origin: "http://site.localhost:5101", clientId: "test-client", token },
        {
            now: () => now,
            fetch: async (url, init) => {
                requests++;
                expect(String(url)).toBe("http://site.localhost:5101/.cms/oauth/token");
                expect(init?.redirect).toBe("error");
                const input = new URLSearchParams(String(init?.body));
                expect(input.get("grant_type")).toBe("refresh_token");
                expect(input.get("resource")).toBe("http://site.localhost:5101/.cms/mcp");
                supplied.push(input.get("refresh_token")!);
                return Response.json({
                    access_token: `access-${requests}`,
                    refresh_token: `refresh-${requests}`,
                    expires_in: 900,
                });
            },
        },
    );
    await ensure();
    expect(requests).toBe(0);
    now = 300_001;
    await Promise.all([ensure(600_000), ensure(600_000), ensure(600_000)]);
    expect(requests).toBe(1);
    expect(token.access_token).toBe("access-1");
    now += 840_001;
    await ensure();
    expect(supplied).toEqual(["initial-refresh", "refresh-1"]);
    expect(token.refresh_token).toBe("refresh-2");
});

test("a refused refresh preserves the old credentials and never discloses remote diagnostic bodies", async () => {
    let now = 0;
    const token = { access_token: "original-access", refresh_token: "original-refresh", expires_in: 900 };
    const ensure = mcpTokenRefresh(
        { origin: "http://site.localhost:5101", clientId: "test-client", token },
        {
            now: () => now,
            fetch: async () => new Response("private remote credential diagnostic", { status: 401 }),
        },
    );
    now = 900_000;
    await expect(ensure()).rejects.toThrow("fixture-mcp-token-refresh-failed");
    expect(token.access_token).toBe("original-access");
    expect(token.refresh_token).toBe("original-refresh");
});
