import { expect, test } from "bun:test";
import { closeInstanceComposition } from "../../../src/runtime/instances/composition/disposal";

test("instance shutdown stops work before closing services and attempts all cleanup after failures", async () => {
    const order: string[] = [];
    const recoveryFailure = new Error("recovery failed");
    const registryFailure = new Error("registry failed");
    let releaseRecovery!: () => void;
    let recoveryStarted!: () => void;
    const started = new Promise<void>((resolve) => {
        recoveryStarted = resolve;
    });
    const gate = new Promise<void>((resolve) => {
        releaseRecovery = resolve;
    });
    const close = (name: string) => ({
        close: async () => {
            order.push(name);
        },
    });
    const disposed = closeInstanceComposition({
        recovery: {
            stop: async () => {
                order.push("recovery");
                recoveryStarted();
                await gate;
                throw recoveryFailure;
            },
        },
        operations: {
            stop: async () => {
                order.push("operations");
            },
        },
        registry: {
            close: async () => {
                order.push("registry");
                throw registryFailure;
            },
        },
        documentation: close("documentation"),
        diagnostics: close("diagnostics"),
        stores: close("stores"),
    });
    const result = disposed.catch((error: unknown) => error);
    await started;
    expect(order).toEqual(["recovery"]);
    releaseRecovery();
    const error = await result;
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([recoveryFailure, registryFailure]);
    expect(order).toEqual(["recovery", "operations", "registry", "documentation", "diagnostics", "stores"]);
});

test("failed instance assembly can dispose only the services already created", async () => {
    const closed: string[] = [];
    await closeInstanceComposition({
        diagnostics: {
            close: async () => {
                closed.push("diagnostics");
            },
        },
        stores: {
            close: async () => {
                closed.push("stores");
            },
        },
    });
    expect(closed).toEqual(["diagnostics", "stores"]);
});
