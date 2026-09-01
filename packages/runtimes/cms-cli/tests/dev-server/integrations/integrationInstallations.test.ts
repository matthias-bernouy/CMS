import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalFsIntegrationInstallationRepository } from "cms-cli/dev-server/stores/integrationInstallations";
import type { IntegrationDefinition, IntegrationRun } from "@bernouy/cms-integrations";

const PACKAGE_DIGEST = "a".repeat(64);
const DEFINITION: IntegrationDefinition = {
    kind: "test",
    label: "Test",
    version: "1.0.0",
    inputs: [],
    artifacts: [],
};

describe("LocalFsIntegrationInstallationRepository", () => {
    test("persists integration installations across repository objects", async () => {
        const siteDir = await mkdtemp(join(tmpdir(), "p9r-integrations-"));
        const first = new LocalFsIntegrationInstallationRepository(siteDir);
        const run = runRecord(1);

        await first.create({
            id: "test",
            label: "Test",
            definitionVersion: "1.0.0",
            definitionSnapshot: DEFINITION,
            packageDigest: PACKAGE_DIGEST,
            answersSnapshot: { id: "main" },
            secretRefs: { apiKey: "TEST_MAIN_API_KEY" },
            secretInputs: ["apiKey"],
            artifacts: [{ type: "source", id: "urn:main", action: "created" }],
            runs: [run],
        });

        const second = new LocalFsIntegrationInstallationRepository(siteDir);
        const loaded = await second.get("test");

        expect(loaded?.id).toBe("test");
        expect(loaded?.packageDigest).toBe(PACKAGE_DIGEST);
        expect(loaded?.createdAt).toBeInstanceOf(Date);
        expect(loaded?.runs[0]?.startedAt).toBeInstanceOf(Date);
        expect((await second.list()).map((installation) => installation.id)).toEqual(["test"]);

        await second.replace({ ...loaded!, label: "Updated test" });

        const authoringImport = JSON.parse(await readFile(join(siteDir, "integrations", "test.json"), "utf-8"));
        expect(authoringImport).toMatchObject({
            kind: "test",
            version: "1.0.0",
            answers: { id: "main" },
        });
        expect(Object.hasOwn(authoringImport, "definition")).toBeFalse();
        expect(Object.hasOwn(authoringImport, "packageDigest")).toBeFalse();
        expect(JSON.stringify(authoringImport)).not.toContain("apiKey");

        const generatedInstallations = JSON.parse(
            await readFile(join(siteDir, ".p9r", "generated", "integration-installations.json"), "utf-8"),
        );
        expect(generatedInstallations[0]?.packageDigest).toBe(PACKAGE_DIGEST);
    });

    test("keeps only the last twenty runs on replace", async () => {
        const siteDir = await mkdtemp(join(tmpdir(), "p9r-integrations-"));
        const repo = new LocalFsIntegrationInstallationRepository(siteDir);
        const created = await repo.create({
            id: "test",
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

        const authoringImport = JSON.parse(await readFile(join(siteDir, "integrations", "test.json"), "utf-8"));
        expect(authoringImport.answers).toEqual({});
    });

    test("keeps embedded definitions for manual integrations", async () => {
        const siteDir = await mkdtemp(join(tmpdir(), "p9r-integrations-"));
        const repo = new LocalFsIntegrationInstallationRepository(siteDir);

        await repo.create({
            id: "test",
            label: "Test",
            definitionVersion: "1.0.0",
            definitionSnapshot: DEFINITION,
            answersSnapshot: {},
            secretRefs: {},
            secretInputs: [],
            artifacts: [],
            runs: [],
        });

        const authoringImport = JSON.parse(await readFile(join(siteDir, "integrations", "test.json"), "utf-8"));
        expect(authoringImport).toEqual({ kind: "test", definition: DEFINITION, answers: {} });
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
