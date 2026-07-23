import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsTriggerRepository } from "cms-cli/dev-server/stores/triggers";

describe("LocalFsTriggerRepository scheduled claims", () => {
    test("coordinates concurrent local runtime instances through the shared store", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-triggers-"));
        const first = new LocalFsTriggerRepository(siteDir);
        const second = new LocalFsTriggerRepository(siteDir);
        await first.createTrigger({
            id: "scheduled-test",
            enabled: true,
            event: { kind: "schedule", intervalMs: 60_000 },
            task: { id: "test.task" },
            scheduleState: { nextRunAt: "2026-07-23T10:00:00.000Z" },
        });

        const [left, right] = await Promise.all([
            first.claimDueScheduledTriggers(request("worker-a", ["token-a", "run-a"])),
            second.claimDueScheduledTriggers(request("worker-b", ["token-b", "run-b"])),
        ]);

        expect([...left, ...right]).toHaveLength(1);
        const claim = [...left, ...right][0]!;
        expect((await first.getTrigger("scheduled-test"))?.scheduleState?.running?.runId).toBe(claim.runId);
        expect(await second.getAllTriggers()).toEqual([
            expect.not.objectContaining({ _claimToken: expect.anything(), _claimOwner: expect.anything() }),
        ]);
    });
});

function request(owner: string, values: string[]) {
    let index = 0;
    return {
        owner,
        now: "2026-07-23T10:00:00.000Z",
        leaseMs: 60_000,
        limit: 10,
        makeId: () => values[index++] ?? `generated-${index}`,
    };
}
