import { describe, expect, test } from "bun:test";
import { IntegrationRepositoryContractError, IntegrationRepositoryUnavailableError } from "@bernouy/cms-integrations";
import { HttpRepositoryCatalogReader } from "../../../src/repositoryCatalog";
import { catalogFixture, FixtureDefinitionRepository, jsonResponse, PACKAGE_DIGEST } from "./fixtures";

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

function reader(fetchImpl: typeof fetch): HttpRepositoryCatalogReader {
    return new HttpRepositoryCatalogReader({
        catalog: new FixtureDefinitionRepository(),
        baseUrl: "https://repository.example/.cms/repository",
        fetch: fetchImpl,
    });
}
