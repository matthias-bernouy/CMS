import { describe, expect, test } from "bun:test";
import { HttpRepositoryCatalogReader } from "../../../src/repositoryCatalog";
import { catalogFixture, FixtureDefinitionRepository } from "./fixtures";

describe("repository catalog bounds", () => {
    test("bounds catalog and per-integration version counts before HTTP fan-out", async () => {
        class TwoKindsRepository extends FixtureDefinitionRepository {
            override async list() {
                const [commerce] = await super.list();
                return [commerce!, { ...commerce!, kind: "analytics", label: "Analytics" }];
            }
        }
        const fixture = catalogFixture();
        const tooManyKinds = new HttpRepositoryCatalogReader({
            catalog: new TwoKindsRepository(),
            baseUrl: "https://repository.example/.cms/repository",
            fetch: fixture.fetch,
            limits: { integrations: 1 },
        });
        const tooManyVersions = new HttpRepositoryCatalogReader({
            catalog: new FixtureDefinitionRepository(),
            baseUrl: "https://repository.example/.cms/repository",
            fetch: fixture.fetch,
            limits: { versionsPerIntegration: 1 },
        });

        await expect(tooManyKinds.listIntegrations()).rejects.toMatchObject({ status: 502 });
        await expect(tooManyVersions.listIntegrations()).rejects.toMatchObject({ status: 502 });
        expect(fixture.requests).toEqual([]);
    });

    test("bounds release notes and complete compatibility history", async () => {
        const notesFixture = catalogFixture();
        const notes = new HttpRepositoryCatalogReader({
            catalog: new FixtureDefinitionRepository(),
            baseUrl: "https://repository.example/.cms/repository",
            fetch: notesFixture.fetch,
            limits: { releaseNotesBytes: 8 },
        });
        await expect(notes.getVersion("commerce", "1.0.0")).rejects.toMatchObject({ status: 502 });

        const compatibilityFixture = catalogFixture({ appended: () => true });
        const compatibility = new HttpRepositoryCatalogReader({
            catalog: new FixtureDefinitionRepository(),
            baseUrl: "https://repository.example/.cms/repository",
            fetch: compatibilityFixture.fetch,
            limits: { compatibilityRevisions: 1 },
        });
        await expect(compatibility.getVersion("commerce", "1.0.0")).rejects.toMatchObject({ status: 502 });
    });

    test("keeps all leaf repository requests within the configured concurrency", async () => {
        const fixture = catalogFixture();
        let active = 0;
        let maximum = 0;
        const delayedFetch: typeof fetch = async (input, init) => {
            active += 1;
            maximum = Math.max(maximum, active);
            await new Promise<void>((resolve) => setTimeout(resolve, 2));
            try {
                return await fixture.fetch(input, init);
            } finally {
                active -= 1;
            }
        };
        const reader = new HttpRepositoryCatalogReader({
            catalog: new FixtureDefinitionRepository(),
            baseUrl: "https://repository.example/.cms/repository",
            fetch: delayedFetch,
            limits: { concurrency: 2 },
        });

        await reader.listIntegrations();

        expect(maximum).toBe(2);
    });
});
