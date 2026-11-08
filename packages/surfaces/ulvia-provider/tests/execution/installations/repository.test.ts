import { expect, test } from "bun:test";
import { installationHost } from "./host";
const input = { expectedRevision: 1, url: "https://repo.ulvia.fr" };

test("Repository commands reject foreign instances and non-local administrators before receipts or business calls", async () => {
    const f = await installationHost();
    try {
        for (const claims of [
            { subjectId: "member-a" },
            { subjectId: undefined, actorKind: "anonymous" as const },
            { sourceInstallationId: "other-provider", rootRequestId: crypto.randomUUID() },
            { systemServiceId: "cms-gateway", subjectId: undefined, actorKind: undefined },
        ]) {
            expect((await f.call("initialization.repository.configure", input, { claims })).status).toBe(403);
            expect((await f.call("initialization.repository.create", { expectedRevision: 1 }, { claims })).status).toBe(
                403,
            );
        }
        expect(
            (
                await f.call(
                    "initialization.repository.create",
                    { expectedRevision: 1 },
                    { claims: { instanceId: "instance-b" } },
                )
            ).status,
        ).toBe(401);
        expect(
            (await f.call("initialization.repository.configure", { ...input, url: "https://user:secret@repo.example" }))
                .status,
        ).toBe(422);
        expect(f.store.receipts).toBe(0);
        expect(f.state.calls).toEqual([]);
    } finally {
        await f.executor.stop();
    }
});

test("address changes and Registry creation return their results without a second durable SDK operation", async () => {
    const f = await installationHost();
    try {
        const configured = await f.call("initialization.repository.configure", input);
        expect(configured.status).toBe(200);
        expect(await configured.json()).toMatchObject({ configured: true, url: input.url });
        const created = await f.call("initialization.repository.create", { expectedRevision: 1 });
        expect(created.status).toBe(200);
        expect(await created.json()).toMatchObject({ repositoryEnabled: true, creationStatus: "succeeded" });
        expect(f.state.calls).toEqual([
            { name: "repository-configure", input },
            { name: "repository-create", input: { expectedRevision: 1 }, administratorId: "local:admin" },
        ]);
        expect(f.store.receipts).toBe(0);
    } finally {
        await f.executor.stop();
    }
});
