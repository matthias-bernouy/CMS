import { describe, expect, test } from "bun:test";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import { RepositoryCms, type PublicRepositoryReadObservation } from "@bernouy/cms-repository";
import { TestRunner } from "./testRunner";

describe("public repository read observations", () => {
    test("reports canonical resources, methods, statuses and non-negative latency", async () => {
        const observations: PublicRepositoryReadObservation[] = [];
        const runner = mounted(observations, {
            list: async () => [],
            getIndex: async () => null,
            listVersions: async () => [],
            get: async () => null,
        });

        const list = await runner.handle("/api/integrations");
        const missing = await runner.handle("/api/integrations/index?kind=missing");
        const invalid = await runner.handle("/api/integrations/index", { method: "HEAD" });

        expect([list.status, missing.status, invalid.status]).toEqual([200, 404, 400]);
        expect(observations).toEqual([
            {
                resource: "integrations",
                method: "GET",
                status: 200,
                durationMs: expect.any(Number),
            },
            {
                resource: "integration-index",
                method: "GET",
                status: 404,
                durationMs: expect.any(Number),
            },
            {
                resource: "integration-index",
                method: "HEAD",
                status: 400,
                durationMs: expect.any(Number),
            },
        ]);
        expect(observations.every(({ durationMs }) => durationMs >= 0)).toBe(true);
        expect(JSON.stringify(observations)).not.toMatch(/kind|missing|url|query|address/iu);
    });

    test("keeps observer failures outside successful and failed reads", async () => {
        const runner = new TestRunner();
        new RepositoryCms({
            runner,
            integrationCatalog: {
                list: async () => {
                    throw new Error("repository failed");
                },
                getIndex: async () => null,
                listVersions: async () => [],
                get: async () => null,
            },
            observeRead: () => {
                throw new Error("metrics failed");
            },
        });

        await expect(runner.handle("/api/integrations")).rejects.toThrow("repository failed");
        expect((await runner.handle("/api/integrations/index?kind=missing")).status).toBe(404);
    });
});

function mounted(
    observations: PublicRepositoryReadObservation[],
    integrationCatalog: IntegrationDefinitionRepository,
): TestRunner {
    const runner = new TestRunner();
    new RepositoryCms({ runner, integrationCatalog, observeRead: (observation) => observations.push(observation) });
    return runner;
}
