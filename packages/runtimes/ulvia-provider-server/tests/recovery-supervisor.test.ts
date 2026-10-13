import { expect, test } from "bun:test";
import { RecoverySupervisor } from "../src/runtime/recovery/RecoverySupervisor";

test("recovery drains every initial batch", async () => {
    const results = [2, 2, 1];
    const calls: number[] = [];
    const supervisor = new RecoverySupervisor(
        async (limit) => {
            calls.push(limit);
            return results.shift() ?? 0;
        },
        60_000,
        2,
    );

    await supervisor.start();
    await supervisor.stop();

    expect(calls).toEqual([2, 2, 2]);
});

test("recovery keeps scanning for work that expires after startup", async () => {
    let recoverable = false;
    let recovered = 0;
    const supervisor = new RecoverySupervisor(
        async () => {
            if (recoverable) {
                recoverable = false;
                recovered += 1;
                return 1;
            }
            return 0;
        },
        2,
        2,
    );

    await supervisor.start();
    recoverable = true;
    await waitUntil(() => recovered === 1);
    await supervisor.stop();

    expect(recovered).toBe(1);
});

async function waitUntil(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 200;
    while (!predicate()) {
        if (Date.now() >= deadline) {
            throw new Error("Timed out waiting for recovery");
        }
        await Bun.sleep(2);
    }
}
