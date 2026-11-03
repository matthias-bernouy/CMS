import { expect, test } from "bun:test";
import { RepositoryDiscovery, RepositoryDiscoveryError } from "@bernouy/cms-repository/repository/search";
import { HttpRepositoryDiscovery } from "@bernouy/cms-repository/repository/search/http";
import { row } from "./fixture";

function client(status: number, body?: unknown) {
    return new RepositoryDiscovery([
        new HttpRepositoryDiscovery("configured", "https://repository.test", {
            request: async () =>
                body === undefined ? new Response(null, { status }) : Response.json(body, { status }),
        }),
    ]);
}
const read = { repositoryId: "configured", reference: row().reference };

test("remote absence, transport failure, conflict and invalid input retain distinct domain classifications", async () => {
    for (const [status, code] of [
        [404, "NOT_FOUND"],
        [503, "CORE_UNAVAILABLE"],
        [409, "REVISION_CONFLICT"],
        [422, "INVALID_INPUT"],
    ] as const) {
        await expect(client(status).get(read)).rejects.toMatchObject({ code });
    }
    await expect(
        client(409, { error: { code: "RELEASE_MISMATCH", message: "private remote diagnostics" } }).get(read),
    ).rejects.toMatchObject({ code: "RELEASE_MISMATCH", message: "RELEASE_MISMATCH" });
    await expect(client(409, { error: { code: "CATALOGUE_TOO_LARGE" } }).get(read)).rejects.toMatchObject({
        code: "CATALOGUE_TOO_LARGE",
    });
    await expect(client(200, { kind: "collection" }).get(read)).rejects.toMatchObject({ code: "RELEASE_MISMATCH" });
    expect((await client(404).search({ query: "shop" })).unavailableRepositories).toEqual(["configured"]);
    expect(new RepositoryDiscoveryError("NOT_FOUND").name).toBe("RepositoryDiscoveryError");
});

test("malformed and oversized remote error bodies cannot escape the typed transport boundary", async () => {
    for (const text of ['{"error":', JSON.stringify({ error: { code: "RELEASE_MISMATCH", text: "x".repeat(5000) } })]) {
        let cancelled = false;
        const source = new HttpRepositoryDiscovery("configured", "https://repository.test", {
            request: async () =>
                new Response(
                    new ReadableStream({
                        start(controller) {
                            controller.enqueue(new TextEncoder().encode(text));
                        },
                        cancel() {
                            cancelled = true;
                        },
                    }),
                    { status: 503, headers: { "Content-Type": "application/json" } },
                ),
        });
        await expect(new RepositoryDiscovery([source]).get(read)).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
        expect(cancelled).toBe(true);
    }
});
