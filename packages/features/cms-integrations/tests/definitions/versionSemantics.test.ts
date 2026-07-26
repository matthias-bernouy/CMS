import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    integrationVersionSatisfies,
    isExactIntegrationVersion,
    isSupportedIntegrationVersionRange,
    resolveExactIntegrationDefinitionVersion,
    resolveInstallableIntegrationDefinitionVersion,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";

describe("integration repository SemVer", () => {
    test("accepts canonical exact SemVer including prerelease and build metadata", () => {
        for (const version of ["0.0.0", "1.2.3", "1.2.3-alpha.1", "1.2.3+build.001"]) {
            expect(isExactIntegrationVersion(version)).toBeTrue();
        }
        for (const version of ["1", "1.2", "v1.2.3", "01.2.3", "1.2.3-"]) {
            expect(isExactIntegrationVersion(version)).toBeFalse();
        }
    });

    test("supports only the documented dependency range subset", () => {
        for (const range of ["1.2.3", "^1.2.3", "~1.2.3", ">=1.2.0 <2.0.0"]) {
            expect(isSupportedIntegrationVersionRange(range)).toBeTrue();
        }
        for (const range of ["*", "1.x", ">=1.2.0", ">1.2.0 <=2.0.0", ">=2.0.0 <1.0.0", "^1.2", "1.0.0 || 2.0.0"]) {
            expect(isSupportedIntegrationVersionRange(range)).toBeFalse();
        }
    });

    test("uses maintained SemVer prerelease boundaries", () => {
        expect(integrationVersionSatisfies("1.5.0", "^1.2.3")).toBeTrue();
        expect(integrationVersionSatisfies("2.0.0", "^1.2.3")).toBeFalse();
        expect(integrationVersionSatisfies("1.3.0-beta.1", "^1.2.3")).toBeFalse();
        expect(integrationVersionSatisfies("1.3.0-beta.1", "1.3.0-beta.1")).toBeTrue();
    });

    test("rejects invalid filesystem index versions and prerelease stable channels", async () => {
        const invalidVersion = filesystemRepository({ versions: ["release-one"] });
        await expect(invalidVersion.list()).rejects.toThrow(/exact SemVer 2\.0 version/);
        const paddedVersion = filesystemRepository({ versions: [" 1.2.3 "] });
        await expect(paddedVersion.list()).rejects.toThrow(/exact SemVer 2\.0 version/);

        const prereleaseStable = filesystemRepository({ versions: ["2.0.0-beta.1"], stable: "2.0.0-beta.1" });
        await expect(prereleaseStable.list()).rejects.toThrow(/stable must not reference a prerelease/);
    });

    test("requires the raw filesystem definition version to exactly match the index", async () => {
        const repository = filesystemRepository({ versions: ["1.2.3"], definitionVersion: " 1.2.3 " });
        await expect(repository.get("demo", "1.2.3")).rejects.toThrow(/does not match index version/);
    });

    test("never selects a prerelease implicitly for the stable channel", async () => {
        const repository = filesystemRepository({ versions: ["2.0.0-beta.1", "1.4.0"], latest: "2.0.0-beta.1" });
        expect((await repository.get("demo"))?.version).toBe("1.4.0");
        expect((await repository.get("demo", "2.0.0-beta.1"))?.version).toBe("2.0.0-beta.1");
    });

    test("keeps blocked versions exact but excludes them from installable resolution", async () => {
        const repository = filesystemRepository({
            versions: ["2.0.0", "1.4.0", "1.3.0"],
            stable: "1.4.0",
            latest: "2.0.0",
            blocked: ["2.0.0", "1.4.0"],
        });
        const index = (await repository.getIndex("demo"))!;

        expect(resolveExactIntegrationDefinitionVersion(index, "2.0.0")?.status).toBe("blocked");
        expect(resolveInstallableIntegrationDefinitionVersion(index, "2.0.0", "latest")).toBeNull();
        expect(resolveInstallableIntegrationDefinitionVersion(index, undefined, "latest")?.version).toBe("1.3.0");
        expect(resolveInstallableIntegrationDefinitionVersion(index, undefined, "stable")?.version).toBe("1.3.0");
        expect((await repository.get("demo"))?.version).toBe("1.3.0");
        expect((await repository.get("demo", "2.0.0"))?.version).toBe("2.0.0");
    });

    test("treats malformed remote versions and missing definition versions as contract failures", async () => {
        const malformedIndex = new HttpIntegrationDefinitionRepository({
            baseUrl: "https://repository.example.test",
            fetch: async () => Response.json([{ kind: "demo", label: "Demo", versions: ["latest"] }]),
        });
        await expect(malformedIndex.list()).rejects.toMatchObject({ status: 502 });

        const missingDefinitionVersion = new HttpIntegrationDefinitionRepository({
            baseUrl: "https://repository.example.test",
            fetch: async () => Response.json({ kind: "demo", label: "Demo", inputs: [] }),
        });
        await expect(missingDefinitionVersion.get("demo")).rejects.toMatchObject({ status: 502 });
    });

    test("rejects empty, duplicate, and dangling remote version metadata", async () => {
        const empty = httpRepositoryResponse({ kind: "demo", label: "Demo", versions: [] });
        await expect(empty.getIndex("demo")).rejects.toMatchObject({ status: 502 });

        const duplicate = httpRepositoryResponse([
            { version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" },
            { version: "1.0.0", path: "versions/copy", definition: "versions/copy/definition.json" },
        ]);
        await expect(duplicate.listVersions("demo")).rejects.toMatchObject({ status: 502 });

        const danglingStable = httpRepositoryResponse({
            kind: "demo",
            label: "Demo",
            stable: "2.0.0",
            versions: [{ version: "1.0.0", path: "versions/1.0.0", definition: "definition.json" }],
        });
        await expect(danglingStable.getIndex("demo")).rejects.toMatchObject({ status: 502 });

        const invalidStatus = httpRepositoryResponse({
            kind: "demo",
            label: "Demo",
            versions: [
                {
                    version: "1.0.0",
                    path: "versions/1.0.0",
                    definition: "definition.json",
                    status: "available",
                },
            ],
        });
        await expect(invalidStatus.getIndex("demo")).rejects.toMatchObject({ status: 502 });
    });

    test("accepts a remote prerelease only when requested explicitly", async () => {
        const repository = httpRepositoryResponse({
            kind: "demo",
            label: "Demo",
            version: "2.0.0-beta.1",
            inputs: [],
        });
        await expect(repository.get("demo")).rejects.toMatchObject({ status: 502 });
        expect((await repository.get("demo", "2.0.0-beta.1"))?.version).toBe("2.0.0-beta.1");
    });
});

function filesystemRepository(options: {
    versions: string[];
    stable?: string;
    latest?: string;
    definitionVersion?: string;
    blocked?: readonly string[];
}): FsIntegrationDefinitionRepository {
    const root = mkdtempSync(join(tmpdir(), "cms-integration-semver-"));
    const packageRoot = join(root, "demo");
    mkdirSync(packageRoot, { recursive: true });
    const versions = options.versions.map((version) => {
        const versionRoot = join(packageRoot, "versions", version);
        mkdirSync(versionRoot, { recursive: true });
        writeFileSync(
            join(versionRoot, "definition.json"),
            JSON.stringify({ kind: "demo", label: "Demo", version: options.definitionVersion ?? version, inputs: [] }),
        );
        return {
            version,
            path: `versions/${version}`,
            definition: `versions/${version}/definition.json`,
            ...(options.blocked?.includes(version) ? { status: "blocked" } : {}),
        };
    });
    writeFileSync(
        join(packageRoot, "integration.json"),
        JSON.stringify({ kind: "demo", label: "Demo", versions, stable: options.stable, latest: options.latest }),
    );
    return new FsIntegrationDefinitionRepository(root);
}

function httpRepositoryResponse(value: unknown): HttpIntegrationDefinitionRepository {
    return new HttpIntegrationDefinitionRepository({
        baseUrl: "https://repository.example.test",
        fetch: async () => Response.json(value),
    });
}
