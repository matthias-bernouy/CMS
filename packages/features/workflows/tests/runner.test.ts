import { expect, test } from "bun:test";
import { definition, fixture } from "./support/fixture";
async function start(f: ReturnType<typeof fixture>) {
    await f.definitions.create("workflow", JSON.stringify(definition), "{}");
    await f.definitions.publish("workflow", 1);
    await f.runs.start("run", "workflow", 1, "admin", { id: "order" });
}

test("published workflows execute conditions and retain successful checkpoints across host recreation", async () => {
    const f = fixture();
    await start(f);
    for (let index = 0; index < 6; index++) {
        await f.runner().runOne();
    }
    const run = await f.runs.get("run");
    expect(run.status).toBe("succeeded");
    expect(f.calls.map(({ id }) => id)).toEqual(["orders.read", "orders.notify"]);
    expect(await f.store.get(run.id, run.resultRef!)).toBe(true);
    expect(await f.runner().runOne()).toBe(false);
});

test("lost keyed replies reuse the same logical key, while unknown non-idempotent commands suspend", async () => {
    const f = fixture();
    const base = f.services.execution.invoke;
    let notifications = 0;
    const keys = new Set<string>();
    f.services.execution.invoke = async (...args) => {
        if (args[0].capability.id === "orders.notify") {
            notifications++;
            keys.add(args[3]!);
            if (notifications === 1) {
                throw new Error("Reply lost after side effect");
            }
        }
        return base(...args);
    };
    await start(f);
    for (let index = 0; index < 8; index++) {
        await f.runner().runOne();
        f.advance();
    }
    expect((await f.runs.get("run")).status).toBe("succeeded");
    expect(notifications).toBe(2);
    expect(keys.size).toBe(1);
    const none = fixture();
    none.capabilities["orders.notify"]!.capability = {
        ...none.capabilities["orders.notify"]!.capability,
        behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: false },
    };
    let attempts = 0;
    const invoke = none.services.execution.invoke;
    none.services.execution.invoke = async (...args) => {
        if (args[0].capability.id === "orders.notify") {
            attempts++;
            throw new Error("Unknown");
        }
        return invoke(...args);
    };
    await start(none);
    for (let index = 0; index < 8; index++) {
        await none.runner().runOne();
        none.advance();
    }
    expect((await none.runs.get("run")).status).toBe("outcomeUnknown");
    expect(attempts).toBe(1);
});

test("revoked administrator authority pauses before business calls; retired plans reject new starts", async () => {
    const f = fixture();
    await start(f);
    f.revoke();
    await f.runner().runOne();
    const waiting = await f.runs.get("run");
    expect(waiting.status).toBe("waiting");
    expect(f.calls).toEqual([]);
    await f.definitions.retire("workflow", 1);
    await expect(f.runs.start("other", "workflow", 1, "admin", { id: "order" })).rejects.toHaveProperty(
        "code",
        "INVALID_STATE",
    );
    f.allow();
    await f.runs.resume("run", waiting.revision, "admin", "retry");
    for (let index = 0; index < 6; index++) {
        await f.runner().runOne();
    }
    expect((await f.runs.get("run")).status).toBe("succeeded");
    expect((await f.runs.get("run")).failureCode).toBeUndefined();
});

test("operation handles wait for the original terminal result without redispatching the step", async () => {
    const f = fixture();
    const current = f.capabilities["orders.notify"]!;
    current.capability = {
        ...current.capability,
        behavior: { effect: "command", execution: "operation", idempotency: "keyed", sensitive: false },
    };
    const invoke = f.services.execution.invoke;
    let dispatched = 0;
    f.services.execution.invoke = async (...args) => {
        if (args[0].capability.id !== "orders.notify") {
            return invoke(...args);
        }
        dispatched++;
        return {
            kind: "success",
            requestId: "request",
            output: { operationId: "12345678-1234-4234-8234-123456789012" },
        };
    };
    let polls = 0;
    f.services.execution.operation = async (_target, id) => {
        expect(id).toBe("12345678-1234-4234-8234-123456789012");
        return ++polls === 1 ? { state: "waiting" } : { state: "succeeded", output: true };
    };
    await start(f);
    for (let index = 0; index < 10; index++) {
        await f.runner().runOne();
        f.advance();
    }
    expect((await f.runs.get("run")).status).toBe("succeeded");
    expect(dispatched).toBe(1);
    expect(polls).toBe(2);
});

test("declared errors follow the typed error branch and exhausted safe retries stop dispatching", async () => {
    const f = fixture();
    f.capabilities["orders.read"]!.capability = {
        ...f.capabilities["orders.read"]!.capability,
        errors: [{ code: "MISSING", retryable: false }],
    };
    const errorFlow = {
        ...definition,
        steps: [
            { ...definition.steps[0]!, next: null, onError: { MISSING: "notify" } },
            { ...definition.steps[2]!, input: { kind: "literal", value: { email: "fallback@example.test" } } },
        ],
    };
    const invoke = f.services.execution.invoke;
    f.services.execution.invoke = async (...args) =>
        args[0].capability.id === "orders.read"
            ? { kind: "declared-error", requestId: "request", errorCode: "MISSING", retryable: false }
            : invoke(...args);
    await f.definitions.create("errors", JSON.stringify(errorFlow), "{}");
    await f.definitions.publish("errors", 1);
    await f.runs.start("run", "errors", 1, "admin", { id: "order" });
    for (let count = 0; count < 5; count++) {
        await f.runner().runOne();
    }
    expect((await f.runs.get("run")).status).toBe("succeeded");
    expect(f.calls.map(({ id }) => id)).toEqual(["orders.notify"]);
    const exhausted = fixture();
    let attempts = 0;
    exhausted.services.execution.invoke = async () => {
        attempts++;
        throw new Error("Unavailable");
    };
    await start(exhausted);
    for (let count = 0; count < 10; count++) {
        await exhausted.runner().runOne();
        exhausted.advance();
    }
    expect(attempts).toBe(3);
    expect((await exhausted.runs.get("run")).failureCode).toBe("RETRY_EXHAUSTED");
});

test("nested workflow starts preserve publication ancestry and refuse recursive runs before persisting values", async () => {
    const f = fixture();
    await start(f);
    const parent = await f.runs.get("run");
    await expect(
        f.runs.start("recursive", "workflow", 1, "admin", { id: "order" }, parent.causation),
    ).rejects.toHaveProperty("code", "INVALID_STATE");
    await f.definitions.create("other", JSON.stringify(definition), "{}");
    await f.definitions.publish("other", 1);
    const child = await f.runs.start("child", "other", 1, "admin", { id: "order" }, parent.causation);
    expect(child.causation).toHaveLength(2);
    await expect(
        f.runs.start("cycle", "workflow", 1, "admin", { id: "order" }, child.causation),
    ).rejects.toHaveProperty("code", "INVALID_STATE");
    expect((await f.store.runs(undefined, 100)).items.map(({ id }) => id)).toEqual(["child", "run"]);
});

test("a temporary authority lookup failure retries without requiring manual role restoration", async () => {
    const f = fixture();
    const check = f.services.authority.assertAdministrator;
    let available = false;
    f.services.authority.assertAdministrator = async (id) => {
        if (!available) {
            throw new Error("Access temporarily unavailable");
        }
        await check(id);
    };
    await start(f);
    await f.runner().runOne();
    expect((await f.runs.get("run")).failureCode).toBe("AUTHORITY_UNAVAILABLE");
    expect(f.calls).toEqual([]);
    available = true;
    f.advance();
    for (let count = 0; count < 5; count++) {
        await f.runner().runOne();
    }
    expect((await f.runs.get("run")).status).toBe("succeeded");
    expect((await f.runs.get("run")).failureCode).toBeUndefined();
});

test("incompatible future calls suspend accepted runs and resume from the existing checkpoint after repair", async () => {
    const f = fixture();
    await start(f);
    await f.runner().runOne();
    const before = (await f.store.run("run"))!;
    expect(before.steps.read!.state).toBe("succeeded");
    const original = f.capabilities["orders.notify"]!.capability;
    f.capabilities["orders.notify"]!.capability = {
        ...original,
        input: { type: "object", properties: { count: { type: "integer" } }, required: ["count"] },
    };
    await f.runner().runOne();
    await f.runner().runOne();
    const suspended = (await f.store.run("run"))!;
    expect(suspended.status).toBe("suspended");
    expect(suspended.failureCode).toBe("CAPABILITY_SCHEMA_CHANGED");
    expect(suspended.failurePath).toContain("steps.notify.input");
    expect(f.calls.map((call) => call.id)).toEqual(["orders.read"]);
    expect(await f.runner().runOne()).toBe(false);
    await expect(f.runs.resume("run", suspended.revision, "admin", "retry")).rejects.toHaveProperty(
        "code",
        "CAPABILITY_SCHEMA_CHANGED",
    );
    f.capabilities["orders.notify"]!.capability = original;
    await f.runs.resume("run", suspended.revision, "admin", "retry");
    for (let index = 0; index < 4; index++) {
        await f.runner().runOne();
    }
    expect((await f.store.run("run"))!.status).toBe("succeeded");
    expect(f.calls.map((call) => call.id)).toEqual(["orders.read", "orders.notify"]);
});

test("a temporary capability lookup failure retries without marking a run as broken or dispatching a call", async () => {
    const f = fixture();
    await start(f);
    const original = f.services.contracts.resolve;
    f.services.contracts.resolve = async () => {
        throw new Error("Network unavailable");
    };
    await f.runner().runOne();
    expect((await f.store.run("run"))!.status).toBe("waiting");
    expect(f.calls).toEqual([]);
    f.services.contracts.resolve = original;
    f.advance();
    for (let index = 0; index < 6; index++) {
        await f.runner().runOne();
    }
    expect((await f.store.run("run"))!.status).toBe("succeeded");
});

test("run identifiers cannot share definition or installation value scopes", async () => {
    const f = fixture();
    await f.definitions.create("orders", JSON.stringify(definition), "{}");
    await f.definitions.publish("orders", 1);
    const before = f.store.values.size;
    for (const id of ["definition:orders", "installation:orders"]) {
        await expect(f.runs.start(id, "orders", 1, "admin", { id: "order" })).rejects.toHaveProperty(
            "code",
            "INVALID_INPUT",
        );
    }
    expect(f.store.runRecords.size).toBe(0);
    expect(f.store.values.size).toBe(before);
});
