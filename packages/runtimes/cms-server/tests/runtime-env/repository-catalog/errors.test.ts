import { describe, expect, test } from "bun:test";
import {
    IntegrationRepositoryContractError,
    IntegrationRepositoryUnavailableError,
    type IntegrationDefinitionVersion,
} from "@bernouy/cms-integrations";
import { HttpRepositoryCatalogReader } from "../../../src/repositoryCatalog";
import { catalogFixture, FixtureDefinitionRepository, jsonResponse, PACKAGE_DIGEST, releaseDocument } from "./fixtures";

describe("repository catalog upstream errors", () => {
    test("maps malformed DTOs and inconsistent immutable digests to 502", async () => {
        const fixture = catalogFixture();
        const malformed = reader(async (input, init) => {
            const url = new URL(String(input));
            return url.pathname.endsWith("/compatibility")
                ? jsonResponse({ unexpected: true })
                : await fixture.fetch(input, init);
        });
        await expect(malformed.getVersion("commerce", "1.0.0")).rejects.toMatchObject({ status: 502 });

        const inconsistent = reader(async (input, init) => {
            const url = new URL(String(input));
            if (!url.pathname.endsWith("/package")) {
                return await fixture.fetch(input, init);
            }
            const digest = "b".repeat(64);
            return new Response(null, {
                headers: {
                    "content-length": "2048",
                    "content-type": "application/json",
                    etag: `"${digest}"`,
                    "x-cms-integration-package-digest": digest,
                },
            });
        });
        await expect(inconsistent.getVersion("commerce", "1.0.0")).rejects.toBeInstanceOf(
            IntegrationRepositoryContractError,
        );

        const fabricatedRollback = reader(async (input, init) => {
            const url = new URL(String(input));
            if (!url.pathname.endsWith("/release")) {
                return await fixture.fetch(input, init);
            }
            const release = releaseDocument("1.0.0");
            const migration = release.migrations[0]!;
            return jsonResponse({
                ...release,
                migrations: [
                    {
                        ...migration,
                        operationalEvidence: {
                            ...migration.operationalEvidence,
                            rollback: {
                                capability: "unavailable",
                                verified: true,
                                evidenceDigest: "c".repeat(64),
                            },
                        },
                    },
                ],
            });
        });
        await expect(fabricatedRollback.getVersion("commerce", "1.0.0")).rejects.toMatchObject({ status: 502 });
    });

    test("treats a definition missing behind a listed exact version as a 502 contract failure", async () => {
        class MissingDefinitionRepository extends FixtureDefinitionRepository {
            override async get() {
                return null;
            }
        }
        const fixture = catalogFixture();
        const catalog = new HttpRepositoryCatalogReader({
            catalog: new MissingDefinitionRepository(),
            baseUrl: "https://repository.example/.cms/repository",
            fetch: fixture.fetch,
        });

        await expect(catalog.getVersion("commerce", "1.1.0")).rejects.toMatchObject({
            status: 502,
            publicCode: "integration_repository_invalid_response",
        });
    });

    test("rejects release evidence that disagrees with the immutable version index", async () => {
        const fixture = catalogFixture();
        class DivergentIndexRepository extends FixtureDefinitionRepository {
            constructor(private readonly patch: Partial<IntegrationDefinitionVersion>) {
                super();
            }

            override async getIndex() {
                const index = await super.getIndex();
                return {
                    ...index,
                    versions: index.versions.map((entry) =>
                        entry.version === "1.0.0" ? { ...entry, ...this.patch } : entry,
                    ),
                };
            }
        }
        const blocked = reader(fixture.fetch, new DivergentIndexRepository({ status: "blocked" }));
        const wrongVerification = reader(
            fixture.fetch,
            new DivergentIndexRepository({ verificationDigest: "d".repeat(64) }),
        );

        await expect(blocked.getVersion("commerce", "1.0.0")).rejects.toMatchObject({ status: 502 });
        await expect(wrongVerification.getVersion("commerce", "1.0.0")).rejects.toMatchObject({ status: 502 });
    });

    test("rejects summary metadata that disagrees with the immutable index", async () => {
        const fixture = catalogFixture();
        class DivergentSchemaRepository extends FixtureDefinitionRepository {
            override async list() {
                const summaries = await super.list();
                return summaries.map((summary) => ({ ...summary, schema: "cms.integration.summary.v1" }));
            }

            override async getIndex() {
                return {
                    ...(await super.getIndex()),
                    schema: "cms.integration.index.v1",
                };
            }
        }
        class DivergentIconRepository extends FixtureDefinitionRepository {
            override async list() {
                const summaries = await super.list();
                return summaries.map((summary) => ({ ...summary, icon: { path: "assets/summary.svg" } }));
            }

            override async getIndex() {
                return { ...(await super.getIndex()), icon: { path: "assets/index.svg" } };
            }
        }
        const schemaMismatch = reader(fixture.fetch, new DivergentSchemaRepository());
        const iconMismatch = reader(fixture.fetch, new DivergentIconRepository());

        await expect(schemaMismatch.listIntegrations()).rejects.toMatchObject({ status: 502 });
        await expect(iconMismatch.listIntegrations()).rejects.toMatchObject({ status: 502 });
    });

    test("maps transport outages and whole-response timeouts to 503", async () => {
        const unavailable = reader(async () => {
            throw new Error("connect ECONNREFUSED secret.internal");
        });
        await expect(unavailable.getVersion("commerce", "1.0.0")).rejects.toBeInstanceOf(
            IntegrationRepositoryUnavailableError,
        );

        const timedOut = new HttpRepositoryCatalogReader({
            catalog: new FixtureDefinitionRepository(),
            baseUrl: "https://repository.example/.cms/repository",
            timeoutMs: 5,
            fetch: (() => new Promise<Response>(() => undefined)) as typeof fetch,
        });
        await expect(timedOut.getVersion("commerce", "1.0.0")).rejects.toMatchObject({ status: 503 });
    });
});

function reader(
    fetchImpl: typeof fetch,
    catalog: FixtureDefinitionRepository = new FixtureDefinitionRepository(),
): HttpRepositoryCatalogReader {
    return new HttpRepositoryCatalogReader({
        catalog,
        baseUrl: "https://repository.example/.cms/repository",
        fetch: fetchImpl,
    });
}
