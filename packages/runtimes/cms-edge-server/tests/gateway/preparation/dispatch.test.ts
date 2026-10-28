import { expect, test } from "bun:test";
import { preparedFixture } from "./fixture";

test("Edge queries prepare identity, delegation and signing in one control request before real HTTP dispatch", async () => {
    const f = await preparedFixture();
    try {
        expect(await f.invoke()).toMatchObject({ kind: "success", output: { items: ["authorized"] } });
        expect(f.events).toEqual(["prepare", "business", "close"]);
        expect(f.preparations[0]).toMatchObject({
            actor: { kind: "administrator", subjectId: "cms-user", authorizationRevision: 1 },
        });
        expect(f.preparations[0]!.invocation).not.toHaveProperty("subjectId");
        expect(f.preparations[0]!.invocation).not.toHaveProperty("delegation");
        expect(f.preparations[0]!.invocation).toMatchObject({
            contractId: "catalog",
            capabilityId: "item.list",
            installationId: "install-a",
            bodyBytes: 0,
        });
    } finally {
        f.close();
    }
});

test("combined command dispatch preserves identity-before-audit and audit-before-business ordering", async () => {
    const f = await preparedFixture(true);
    try {
        await f.invoke();
        expect(f.events).toEqual(["identity", "started", "prepare", "business", "completed", "close"]);
        expect(f.preparations[0]!.expectedSubjectId).toBe("alias");
        expect(f.preparations[0]!.invocation.bodyBytes).toBeGreaterThan(0);
    } finally {
        f.close();
    }
});

test("an audience mismatch closes preparation without dispatch and refusals never reach the business Provider", async () => {
    const f = await preparedFixture();
    try {
        f.wrongAudience();
        await expect(f.invoke()).rejects.toMatchObject({ code: "transport_failure" });
        expect(f.events).toEqual(["prepare", "close"]);
        f.deny();
        await expect(f.invoke()).rejects.toMatchObject({ code: "not_authorized" });
        expect(f.events).toEqual(["prepare", "close", "prepare"]);
    } finally {
        f.close();
    }
});
