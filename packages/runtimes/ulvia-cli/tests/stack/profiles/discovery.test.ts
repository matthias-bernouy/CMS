import { expect, test } from "bun:test";
import { instanceProfileCoordinate, selectInstanceProfile } from "../../../src/runtime/instances/profiles";

const official = { id: "ulvia.official", version: "1.0.0" };
const registry = { id: "ulvia.repository", version: "1.0.0" };

test("profile discovery selects exact Provider references with one bounded authenticated read", async () => {
    const requests: { url: string; authorization: string | null }[] = [];
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
            requests.push({ url: request.url, authorization: request.headers.get("authorization") });
            return Response.json({ defaultProfile: official, profiles: [official, registry] });
        },
    });
    try {
        expect(await selectInstanceProfile(server.url.origin, "operator")).toEqual(official);
        expect(requests).toHaveLength(1);
        expect(new URL(requests[0]!.url).pathname).toBe("/ulvia/operator/profiles");
        expect(requests[0]!.authorization).toBe("Bearer operator");
        expect(await selectInstanceProfile(server.url.origin, "operator", "ulvia.repository@1.0.0")).toEqual(registry);
        await expect(selectInstanceProfile(server.url.origin, "operator", "ulvia.repository@2.0.0")).rejects.toThrow(
            "unavailable",
        );
        const count = requests.length;
        for (const value of [
            "ulvia.repository",
            "ulvia.repository@latest",
            "ulvia.repository@^1.0.0",
            "@1.0.0",
            "ulvia.repository@01.0.0",
        ]) {
            expect(() => instanceProfileCoordinate(value)).toThrow();
            await expect(selectInstanceProfile(server.url.origin, "operator", value)).rejects.toThrow();
        }
        expect(requests).toHaveLength(count);
    } finally {
        server.stop(true);
    }
});

test("invalid, excessive and redirected profile responses cannot select an application or forward credentials", async () => {
    let reply: () => Response = () => new Response(null, { status: 401 });
    let forwarded = 0;
    const destination = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch() {
            forwarded++;
            return new Response();
        },
    });
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => reply() });
    try {
        await expect(selectInstanceProfile(server.url.origin, "operator")).rejects.toThrow("401");
        for (const value of [
            null,
            {},
            [],
            { defaultProfile: official, profiles: [] },
            { defaultProfile: official, profiles: [registry] },
            { defaultProfile: official, profiles: [official, official] },
            { defaultProfile: official, profiles: Array.from({ length: 33 }, () => official) },
            { defaultProfile: official, profiles: [official], url: destination.url.origin },
            { defaultProfile: official, profiles: [{ ...official, url: destination.url.origin }] },
        ]) {
            reply = () => Response.json(value);
            await expect(selectInstanceProfile(server.url.origin, "operator")).rejects.toThrow();
        }
        reply = () => new Response('{"defaultProfile":null,"defaultProfile":{},"profiles":[]}');
        await expect(selectInstanceProfile(server.url.origin, "operator")).rejects.toThrow();
        reply = () => new Response(" ".repeat(16_385));
        await expect(selectInstanceProfile(server.url.origin, "operator")).rejects.toThrow();
        reply = () => Response.redirect(destination.url.origin, 307);
        await expect(selectInstanceProfile(server.url.origin, "operator")).rejects.toThrow();
        expect(forwarded).toBe(0);
    } finally {
        server.stop(true);
        destination.stop(true);
    }
});
