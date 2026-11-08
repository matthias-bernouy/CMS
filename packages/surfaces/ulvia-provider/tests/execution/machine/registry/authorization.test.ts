import { expect, test } from "bun:test";
import { repositoryServices } from "./services";
import { repositoryTransport } from "./transport";

test("Repository resolves only the verified account alias and refuses foreign instances before mutation", async () => {
    const writes: unknown[] = [];
    let resolutions = 0;
    const call = await repositoryTransport(
        repositoryServices({
            namespaces: {
                claim: async (input, accountId) => {
                    writes.push({ input, accountId });
                    return {
                        namespace: input.namespace,
                        revision: 1,
                        state: "active",
                        updatedAt: new Date().toISOString(),
                    };
                },
            },
        }),
        async (alias) => {
            resolutions++;
            return alias === "provider-user" ? "owner-account" : null;
        },
    );
    for (const options of [
        { authenticated: false },
        { claims: { instanceId: "instance-b" } },
        { claims: { actorKind: "anonymous" as const } },
        { claims: { subjectId: "unknown-alias" } },
    ]) {
        expect((await call("namespace-claim", { namespace: "community" }, options)).status).toBeGreaterThanOrEqual(400);
    }
    expect((await call("namespace-claim", { namespace: "community", accountId: "foreign" })).status).toBe(400);
    expect(writes).toEqual([]);
    expect(resolutions).toBe(1);
    expect(
        (await call("namespace-claim", { namespace: "community" }, { headers: { "x-account-id": "foreign" } })).status,
    ).toBe(200);
    expect(writes).toEqual([{ input: { namespace: "community" }, accountId: "owner-account" }]);
    expect(resolutions).toBe(2);
});

test("Repository catalogue delegates one bounded page and invalid input performs no reads or account resolution", async () => {
    const reads: unknown[] = [];
    let resolutions = 0;
    const call = await repositoryTransport(
        repositoryServices({
            reads: {
                catalogue: async (input) => {
                    reads.push(input);
                    return { releases: [], nextCursor: "next-page" };
                },
            },
        }),
        async () => {
            resolutions++;
            return "owner-account";
        },
    );
    const input = { kind: "contract", limit: 2, cursor: "previous", channel: "stable" };
    const response = await call("catalogue-list", input);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ releases: [], nextCursor: "next-page" });
    expect(reads).toEqual([input]);
    for (const limit of [0, 257]) {
        expect((await call("catalogue-list", { kind: "contract", limit })).status).toBe(400);
    }
    expect(reads).toHaveLength(1);
    expect(resolutions).toBe(0);
});
