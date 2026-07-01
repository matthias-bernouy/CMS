import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalFsIntegrationInstanceRepository } from "cms-cli/dev-server/integrationInstances";
import type { IntegrationRun } from "@bernouy/cms-integrations";

describe("LocalFsIntegrationInstanceRepository", () => {
    test("persists integration instances across repository instances", async () => {
        const siteDir = await mkdtemp(join(tmpdir(), "p9r-integrations-"));
        const first = new LocalFsIntegrationInstanceRepository(siteDir);
        const run = runRecord(1);

        await first.create({
            id: "test:main",
            kind: "test",
            label: "Test",
            definitionVersion: "1",
            answersSnapshot: { id: "main" },
            secretRefs: { apiKey: "TEST_MAIN_API_KEY" },
            secretInputs: ["apiKey"],
            artifacts: [{ type: "source", id: "urn:main", action: "created" }],
            runs: [run],
        });

        const second = new LocalFsIntegrationInstanceRepository(siteDir);
        const loaded = await second.get("test:main");

        expect(loaded?.id).toBe("test:main");
        expect(loaded?.createdAt).toBeInstanceOf(Date);
        expect(loaded?.runs[0]?.startedAt).toBeInstanceOf(Date);
        expect((await second.list()).map(instance => instance.id)).toEqual(["test:main"]);
    });

    test("keeps only the last twenty runs on replace", async () => {
        const siteDir = await mkdtemp(join(tmpdir(), "p9r-integrations-"));
        const repo = new LocalFsIntegrationInstanceRepository(siteDir);
        const created = await repo.create({
            id: "test:main",
            kind: "test",
            label: "Test",
            definitionVersion: "1",
            answersSnapshot: {},
            secretRefs: {},
            secretInputs: [],
            artifacts: [],
            runs: [],
        });

        const replaced = await repo.replace({
            ...created,
            runs: Array.from({ length: 25 }, (_, index) => runRecord(index + 1)),
        });

        expect(replaced.runs).toHaveLength(20);
        expect(replaced.runs[0]?.runNumber).toBe(6);
    });
});

function runRecord(runNumber: number): IntegrationRun {
    const now = new Date("2026-01-01T00:00:00.000Z");
    return {
        id: `run-${runNumber}`,
        runNumber,
        status: "success",
        startedAt: now,
        finishedAt: now,
        artifacts: [],
    };
}
