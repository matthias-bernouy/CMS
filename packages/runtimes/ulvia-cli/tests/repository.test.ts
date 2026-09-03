import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpIntegrationPackageSource } from "@bernouy/cms-integration-packages/http";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";
import { LocalRepositoryCatalog } from "../src/repository/catalog";
import { LocalIntegrationRepository } from "../src/repository/local";
import { handleRepositoryRequest } from "../src/repository/server";
import { buildLocalVerificationBundle } from "../src/release/source/verification";
import { integrationDefinition, integrationPackage, removeReadonlyTree } from "./fixtures";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map(removeReadonlyTree));
});

describe("local integration repository", () => {
    test("persists immutable package coordinates and definitions", async () => {
        const fixture = await repositoryFixture();
        const resolved = await integrationPackage();
        const verification = await buildLocalVerificationBundle(fixture.root, {
            kind: resolved.envelope.kind,
            version: resolved.envelope.version,
            packageDigest: resolved.digest,
        });

        const first = await fixture.repository.store({
            package: resolved,
            definition: integrationDefinition(),
            verification,
            source: "https://repository.example.test",
        });
        const second = await fixture.repository.store({
            package: resolved,
            definition: integrationDefinition(),
            source: "https://repository.example.test",
        });

        expect(first.added).toBeTrue();
        expect(second.added).toBeFalse();
        expect(await fixture.repository.list()).toEqual([first.record]);
        expect((await fixture.repository.getPackage(first.record)).digest).toBe(resolved.digest);
        expect((await fixture.repository.getVerification(first.record))?.digest).toBe(verification.digest);
    });

    test("serves the same contracts consumed by a CMS runtime", async () => {
        const fixture = await repositoryFixture();
        const resolved = await integrationPackage();
        await fixture.repository.store({
            package: resolved,
            definition: integrationDefinition(),
            source: "https://repository.example.test",
        });
        const catalog = new LocalRepositoryCatalog(fixture.repository);
        const fetchImpl: typeof fetch = (input, init) =>
            handleRepositoryRequest(new Request(input, init), fixture.repository, catalog);
        const baseUrl = "http://127.0.0.1/.cms/repository";
        const definitions = new HttpIntegrationDefinitionRepository({ baseUrl, fetch: fetchImpl });
        const packages = new HttpIntegrationPackageSource({ baseUrl, fetch: fetchImpl });

        expect((await definitions.list())[0]).toMatchObject({ kind: "demo", versions: ["1.0.0"] });
        expect(await definitions.get("demo", "1.0.0")).toEqual(integrationDefinition());
        expect((await packages.getPackage("demo", "1.0.0"))?.digest).toBe(resolved.digest);
    });
});

async function repositoryFixture() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-local-repository-"));
    roots.push(root);
    const repositoryRoot = join(root, "repository");
    await mkdir(repositoryRoot, { recursive: true });
    const repository = new LocalIntegrationRepository(repositoryRoot, join(repositoryRoot, "packages"));
    await repository.init();
    return { root, repository };
}
