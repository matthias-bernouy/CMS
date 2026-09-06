import { describe, expect, test } from "bun:test";
import { parseHealthReport } from "@bernouy/cms-integrations";
import { fixture, report } from "./fixture";
describe("integration health observations", () => {
    test("deduplicates concurrent checks and keeps installation deployment state separate", async () => {
        let calls = 0;
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const { service, installations } = await fixture(async () => {
            calls++;
            await gate;
            return report();
        });
        const first = service.health("test-management");
        const second = service.health("test-management", true);
        await Bun.sleep(5);
        expect(calls).toBe(1);
        release();
        const results = await Promise.all([first, second]);
        expect(results[0]).toEqual(results[1]);
        await service.health("test-management");
        expect(calls).toBe(1);
        expect((await installations.get("test-management"))?.status).toBe("success");
    });
    test("retains stale report on unreachable and invalid responses", async () => {
        let mode = "good";
        const { service } = await fixture(async () => {
            if (mode === "fail") {
                throw new Error("private");
            }
            return mode === "bad" ? { ok: true } : report();
        });
        expect((await service.health("test-management")).freshness).toBe("fresh");
        mode = "fail";
        const unreachable = await service.health("test-management", true);
        expect(unreachable.observation).toBe("unreachable");
        expect(unreachable.freshness).toBe("stale");
        mode = "bad";
        const invalid = await service.health("test-management", true);
        expect(invalid.observation).toBe("invalid_report");
        expect(invalid.report?.status).toBe("ready");
    });
    test("times out without inventing a ready status", async () => {
        const { service } = await fixture(() => new Promise(() => {}), { healthTimeoutMs: 5 });
        expect(await service.health("test-management")).toMatchObject({
            observation: "unreachable",
            freshness: "unavailable",
            report: null,
        });
    });
    test("rejects unsupported versions, global check statuses, unknown actions and future timestamps", () => {
        const now = new Date();
        const valid = report(now);
        for (const bad of [
            { ...valid, schemaVersion: 2 },
            { ...valid, checks: [{ id: "a", status: "ready" }] },
            { ...valid, checks: [{ id: "a", status: "ok", actionIds: ["https://bad"] }] },
            { ...valid, checkedAt: new Date(now.getTime() + 120000).toISOString() },
        ]) {
            expect(() => parseHealthReport(bad, ["retry"], now)).toThrow();
        }
    });
});
