import { inventoryFixture } from "./inventory";
import { coverageMatrix } from "../capabilities/coverage";
import type { RunReport } from "../reporting/types";

export async function reportFixture(): Promise<RunReport> {
    const fixture = await inventoryFixture();
    const scenarios = [fixture.scenario];
    const results = [{ scenario: fixture.scenario.id, status: "passed" as const, measurements: [fixture.measurement] }];
    return {
        format: 1,
        metadata: {
            id: "20261117T120000Z-1234567-abcdef12",
            startedAt: "2026-11-17T12:00:00.000Z",
            finishedAt: "2026-11-17T12:01:00.000Z",
            revision: "1".repeat(40),
            sourceDigest: "2".repeat(64),
            dirty: false,
            profile: {
                id: "isolated-test-profile",
                fingerprint: "3".repeat(64),
                architecture: "x64",
                platform: "linux",
                cpuModel: "fixture",
                cpuCount: 2,
                memoryBytes: 1024 ** 3,
                bunVersion: "1.4.4",
                mongoVersion: "7.0.37",
                instrumentationDigest: "4".repeat(64),
                limits: { provider: { cpus: 2, memoryBytes: 1024 ** 3 } },
            },
            images: [
                {
                    component: "provider",
                    reference: "fixture/provider:1",
                    id: `sha256:${"5".repeat(64)}`,
                    revision: "1".repeat(40),
                },
                {
                    component: "edge",
                    reference: "fixture/edge:1",
                    id: `sha256:${"6".repeat(64)}`,
                    revision: "1".repeat(40),
                },
            ],
        },
        inventory: fixture.inventory,
        scenarios,
        results,
        coverage: coverageMatrix(fixture.inventory, scenarios, results),
        findings: [{ code: "fixture-only", message: "This synthetic report is not a complete capability assessment" }],
        status: "failed",
    };
}
