import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalIntegrationRepository } from "../../src/repository/local";
import { integrationDefinition, integrationPackage, removeReadonlyTree } from "../fixtures";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map(removeReadonlyTree));
});

describe("local repository manifest", () => {
    test("indexes compact metadata while definitions remain in immutable packages", async () => {
        const fixture = await repositoryFixture();
        const resolved = await integrationPackage();
        const stored = await fixture.repository.store({
            package: resolved,
            definition: integrationDefinition(),
            source: "local:/demo",
        });

        const manifest = await manifestDocument(fixture.repositoryRoot);
        expect(manifest.schema).toBe("ulvia.local-repository.v2");
        expect(manifest.packages[0]).toMatchObject({
            kind: "demo",
            version: "1.0.0",
            metadata: { label: "Demo integration", category: "tests" },
            dependencies: [],
        });
        expect(manifest.packages[0]?.definition).toBeUndefined();
        expect(await fixture.repository.getDefinition(stored.record)).toEqual(integrationDefinition());
    });

    test("reads legacy manifests and rewrites them compactly on the next mutation", async () => {
        const fixture = await repositoryFixture();
        const resolved = await integrationPackage();
        const stored = await fixture.repository.store({
            package: resolved,
            definition: integrationDefinition(),
            source: "local:/demo",
        });
        await writeFile(
            join(fixture.repositoryRoot, "catalog.json"),
            JSON.stringify({
                schema: "ulvia.local-repository.v1",
                packages: [
                    {
                        kind: stored.record.kind,
                        version: stored.record.version,
                        digest: stored.record.digest,
                        source: stored.record.source,
                        pulledAt: stored.record.pulledAt,
                        definition: integrationDefinition(),
                    },
                ],
            }),
        );
        const reopened = new LocalIntegrationRepository(
            fixture.repositoryRoot,
            join(fixture.repositoryRoot, "packages"),
        );
        await reopened.init();
        expect((await reopened.list())[0]?.metadata.label).toBe("Demo integration");

        await reopened.recordAdmission("demo", "1.0.0", resolved.digest, {
            status: "published",
            recordedAt: "2026-09-04T12:00:00.000Z",
        });
        const migrated = await manifestDocument(fixture.repositoryRoot);
        expect(migrated.schema).toBe("ulvia.local-repository.v2");
        expect(migrated.packages[0]?.definition).toBeUndefined();
    });
});

async function repositoryFixture() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-local-manifest-"));
    roots.push(root);
    const repositoryRoot = join(root, "repository");
    await mkdir(repositoryRoot, { recursive: true });
    const repository = new LocalIntegrationRepository(repositoryRoot, join(repositoryRoot, "packages"));
    await repository.init();
    return { repositoryRoot, repository };
}

async function manifestDocument(root: string): Promise<Record<string, any>> {
    return JSON.parse(await readFile(join(root, "catalog.json"), "utf8"));
}
