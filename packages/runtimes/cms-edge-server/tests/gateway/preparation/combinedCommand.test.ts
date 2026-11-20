import { expect, test } from "bun:test";
import { preparedFixture } from "./fixture";

test("1.6 command preparation combines three control steps while retaining ordered audit and exact token dispatch", async () => {
    const f = await preparedFixture(true, undefined, false, true);
    try {
        expect(await f.invoke()).toMatchObject({ kind: "success", output: { items: ["authorized"] } });
        expect(f.events).toEqual(["identity", "started", "prepare", "business", "completed"]);
        expect(f.requests).toEqual(["/gateway/route-snapshot", "/gateway/commands/prepare", "/gateway/audit"]);
        expect(f.preparations[0]!.commandStart).toMatchObject({ identityRequired: true });
        expect(JSON.parse(f.preparations[0]!.commandStart.event)).toMatchObject({
            stage: "started",
            actorKind: "administrator",
            actorSubjectId: "cms-user",
            requestId: f.preparations[0]!.invocation.requestId,
        });
        expect(f.preparations[0]).not.toHaveProperty("route");
    } finally {
        f.close();
    }
});

test("identity and audit start failures never produce a business request or a terminal command audit", async () => {
    for (const stage of ["identity", "audit"] as const) {
        const f = await preparedFixture(true, undefined, false, true);
        try {
            f.failStage(stage);
            await expect(f.invoke()).rejects.toBeDefined();
            expect(f.events).toEqual(stage === "identity" ? ["identity"] : ["identity", "started"]);
            expect(f.requests).not.toContain("/gateway/audit");
        } finally {
            f.close();
        }
    }
});

test("a preparation refusal after durable start is audited as rejected and invalidates no business caches", async () => {
    let settled = 0;
    const f = await preparedFixture(
        true,
        () => {
            settled++;
        },
        false,
        true,
    );
    try {
        f.deny();
        await expect(f.invoke()).rejects.toMatchObject({ code: "not_authorized" });
        expect(f.events).toEqual(["identity", "started", "prepare", "rejected"]);
        expect(settled).toBe(0);
    } finally {
        f.close();
    }
});

test("outer control refusals cannot emit a terminal audit when command preparation never started", async () => {
    const f = await preparedFixture(true, undefined, false, true);
    try {
        for (const status of [401, 403, 404, 422, 429]) {
            f.rejectBeforeStart(status);
            await expect(f.invoke()).rejects.toMatchObject({ status });
        }
        expect(f.events).toEqual([]);
        expect(f.requests).not.toContain("/gateway/audit");
    } finally {
        f.close();
    }
});
