import { describe, expect, test } from "bun:test";
import { clientFixture } from "./providerClient.fixture";

describe("Provider-backed actor resolution", () => {
    test("resolves anonymous, user and administrator actors through the Access capability", async () => {
        let response = { state: "anonymous" } as Record<string, unknown>;
        const { client, requests } = clientFixture(() => Response.json(response));

        expect(await client.resolveActor(new Request("https://kernel.test/admin"))).toEqual({ kind: "anonymous" });

        response = {
            state: "authenticated",
            subjectId: "subject-a",
            administrator: false,
            authorizationRevision: 3,
        };
        expect(
            await client.resolveActor(
                new Request("https://kernel.test/admin", {
                    headers: { authorization: "Bearer actor-token", cookie: "cms-session=session-a" },
                }),
            ),
        ).toEqual({ kind: "user", subjectId: "subject-a" });

        response = { ...response, administrator: true };
        expect(await client.resolveActor(new Request("https://kernel.test/admin"))).toEqual({
            kind: "administrator",
            subjectId: "subject-a",
        });

        expect(
            requests.every((request) => request.url.pathname.endsWith("/ulvia.cms.access/resolve-actor")),
        ).toBeTrue();
        expect(requests.every((request) => request.init.method === "GET")).toBeTrue();
        const forwarded = new Headers(requests[1]?.init.headers);
        expect(forwarded.get("authorization")).toBe("Bearer provider-token-at-least-twenty");
        expect(forwarded.get("x-ulvia-actor-authorization")).toBe("Bearer actor-token");
        expect(forwarded.get("cookie")).toBe("cms-session=session-a");
    });

    test("fails closed when Access is unavailable or returns an invalid actor", async () => {
        const unavailable = clientFixture(() => new Response("Unavailable", { status: 503 })).client;
        await expect(unavailable.resolveActor(new Request("https://kernel.test/admin"))).rejects.toThrow(
            "Provider query failed (503)",
        );

        const invalid = clientFixture(() => Response.json({ state: "authenticated", subjectId: "subject-a" })).client;
        await expect(invalid.resolveActor(new Request("https://kernel.test/admin"))).rejects.toThrow(
            "Access actor response is invalid",
        );
    });
});
