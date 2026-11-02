import { expect, test } from "bun:test";
import { DocumentationPreparationQueue } from "../../../src/runtime/instances/composition/DocumentationPreparationQueue";
import { observeSelectionCommits } from "../../../src/runtime/stores/selections/notifications";
import type { StoredContractSelections } from "@bernouy/cms-repository/providers/selections";
import { NOOP_LOGGER } from "@bernouy/logging";

function gate() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve: () => resolve() };
}

test("preparation coalesces pending revisions, isolates failures and bounds queued instances", async () => {
    const started = gate();
    const finish = gate();
    const failures: unknown[] = [];
    const calls: string[] = [];
    const queue = new DocumentationPreparationQueue((_key, error) => {
        failures.push(error);
    }, 2);
    queue.request("first", async () => {
        started.resolve();
        await finish.promise;
    });
    await started.promise;
    expect(queue.contains("first")).toBe(true);
    queue.request("second", async () => {
        calls.push("old");
    });
    queue.request("second", async () => {
        calls.push("latest");
        throw new Error("Unavailable");
    });
    expect(
        queue.request("third", async () => {
            calls.push("third");
        }),
    ).toBe(true);
    expect(
        queue.request("fourth", async () => {
            calls.push("overflow");
        }),
    ).toBe(false);
    finish.resolve();
    await queue.idle();
    expect(calls).toEqual(["latest", "third"]);
    expect(failures).toHaveLength(1);
    expect(queue.contains("first")).toBe(false);
    queue.request("later", async () => {
        calls.push("later");
    });
    await queue.idle();
    expect(calls.at(-1)).toBe("later");
    await queue.close();
});

test("queue shutdown cancels pending preparations and retains the active lease until native work finishes", async () => {
    const started = gate();
    const finish = gate();
    let released = false;
    let queuedStarted = false;
    const queue = new DocumentationPreparationQueue(() => {});
    queue.request("active", async (signal) => {
        started.resolve();
        await finish.promise;
        expect(signal.aborted).toBe(true);
        released = true;
    });
    await started.promise;
    queue.request("pending", async () => {
        queuedStarted = true;
    });
    let closed = false;
    const closing = queue.close().then(() => {
        closed = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(closed).toBe(false);
    expect(released).toBe(false);
    finish.resolve();
    await closing;
    expect(released).toBe(true);
    expect(queuedStarted).toBe(false);
    expect(queue.request("late", async () => {})).toBe(false);
});

test("selection preparation observers run after a successful commit and cannot fail it", async () => {
    let committed = false;
    let notify = 0;
    let refused = true;
    const saved = { siteId: "default", revision: 2 } as StoredContractSelections;
    const store = observeSelectionCommits(
        {
            get: async () => null,
            replace: async () => {
                if (refused) {
                    throw new Error("revision conflict");
                }
                committed = true;
                return saved;
            },
        },
        NOOP_LOGGER,
        (state) => {
            expect(committed).toBe(true);
            expect(state).toBe(saved);
            notify++;
            throw new Error("Optional preparation failed");
        },
    );
    await expect(store.replace("default", [], 1)).rejects.toThrow("revision conflict");
    expect(committed).toBe(false);
    expect(notify).toBe(0);
    refused = false;
    await expect(store.replace("default", [], 1)).resolves.toBe(saved);
    expect(notify).toBe(1);
});
