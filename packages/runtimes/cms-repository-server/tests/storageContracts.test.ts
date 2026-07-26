import { afterEach, describe, expect, mock, test } from "bun:test";
import { chmod, lstat, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildFsIntegrationRegistryCatalogSnapshot } from "@bernouy/cms-integration-registry/fs";
import { buildOfficialIntegrationPackages } from "@bernouy/cms-official-integrations/publication";
import {
    assertDistinctRepositoryCredentials,
    readRepositoryMaintenanceToken,
    readRepositoryManagementToken,
} from "../src/credentials";
import { prepareOfficialRepositoryBootstrap } from "../src/production";
import {
    bootstrapRepositoryRegistryIfEmpty,
    REPOSITORY_BOOTSTRAP_MARKER,
    RepositoryRegistryBootstrapIncompleteError,
    validateRepositoryRegistryRoot,
} from "../src/registryRoot";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(
        roots.splice(0).map(async (root) => {
            await makeWritable(root);
            await rm(root, { recursive: true, force: true });
        }),
    );
});

describe("repository storage contracts", () => {
    test("runs bootstrap only for a completely empty registry root", async () => {
        const root = await temporaryRoot();
        const bootstrap = mock(async (target: string) => ({
            commit: async () => await writeFile(join(target, "catalog-entry"), "validated publication"),
        }));

        expect(await bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).toBe("bootstrapped");
        expect(await bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).toBe("already-initialized");
        expect(bootstrap).toHaveBeenCalledTimes(1);
    });

    test("never invokes bootstrap when any registry state already exists", async () => {
        const root = await temporaryRoot();
        await mkdir(join(root, ".staging"));
        const bootstrap = mock(async () => undefined);

        expect(await bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).toBe("already-initialized");
        expect(bootstrap).not.toHaveBeenCalled();
    });

    test("does not claim the registry until preparation has validated without writing", async () => {
        const root = await temporaryRoot();
        const bootstrap = mock(async () => {
            expect(await readdir(root)).toEqual([]);
            throw new Error("official package validation failed");
        });

        await expect(bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).rejects.toThrow(
            "official package validation failed",
        );
        expect(await readdir(root)).toEqual([]);
    });

    test("leaves a durable fail-closed marker when bootstrap publication is interrupted", async () => {
        const root = await temporaryRoot();
        const bootstrap = mock(async (target: string) => ({
            commit: async () => {
                expect(await readdir(target)).toContain(REPOSITORY_BOOTSTRAP_MARKER);
                await writeFile(join(target, "partial-catalog-entry"), "partial");
                throw new Error("simulated interruption");
            },
        }));

        await expect(bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).rejects.toThrow("simulated interruption");
        expect(await readdir(root)).toContain(REPOSITORY_BOOTSTRAP_MARKER);
        await expect(bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).rejects.toBeInstanceOf(
            RepositoryRegistryBootstrapIncompleteError,
        );
        expect(bootstrap).toHaveBeenCalledTimes(1);
    });

    test("the production bootstrap publishes all official packages in deterministic order", async () => {
        const root = await temporaryRoot();
        const expected = await buildOfficialIntegrationPackages();

        expect(await bootstrapRepositoryRegistryIfEmpty(root, prepareOfficialRepositoryBootstrap)).toBe("bootstrapped");

        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        expect(snapshot.health).toBe("healthy");
        expect(snapshot.summaries.map(({ kind }) => kind)).toEqual(expected.map(({ kind }) => kind));
        expect(snapshot.summaries).toHaveLength(14);
        for (const integrationPackage of expected) {
            expect(
                snapshot.locateExactVersion(integrationPackage.kind, integrationPackage.version)?.package.digest,
            ).toBe(integrationPackage.digest);
        }
        const legacySqlPackages = snapshot.summaries.filter(({ kind, versions }) => {
            const definition = snapshot.locateExactVersion(kind, versions[0]!)?.definitionSnapshot;
            return definition?.connectors?.some(
                (connector) => connector.schemas?.length && !connector.compatibility?.schema,
            );
        });
        expect(legacySqlPackages).toHaveLength(9);
        expect(await readdir(root)).not.toContain(REPOSITORY_BOOTSTRAP_MARKER);
    }, 30_000);

    test("rejects a symlink registry root", async () => {
        const parent = await temporaryRoot();
        const actual = join(parent, "actual");
        const linked = join(parent, "linked");
        await mkdir(actual);
        await symlink(actual, linked);

        await expect(validateRepositoryRegistryRoot(linked)).rejects.toThrow("non-symlink directory");
    });

    test("reads a bounded management token from a regular secret file", async () => {
        const root = await temporaryRoot();
        const tokenFile = join(root, "token");
        await writeFile(tokenFile, "management-secret\n", { mode: 0o600 });

        expect(await readRepositoryManagementToken(tokenFile)).toBe("management-secret");

        await writeFile(tokenFile, "two tokens");
        await expect(readRepositoryManagementToken(tokenFile)).rejects.toThrow("one non-empty Bearer token");
        await writeFile(tokenFile, "x".repeat(8_193));
        await expect(readRepositoryManagementToken(tokenFile)).rejects.toThrow("bounded regular file");
    });

    test("reads an independent maintenance token and rejects credential reuse", async () => {
        const root = await temporaryRoot();
        const maintenanceTokenFile = join(root, "maintenance-token");
        await writeFile(maintenanceTokenFile, "maintenance-secret\n", { mode: 0o600 });

        const maintenanceToken = await readRepositoryMaintenanceToken(maintenanceTokenFile);
        expect(maintenanceToken).toBe("maintenance-secret");
        expect(() => assertDistinctRepositoryCredentials("management-secret", maintenanceToken)).not.toThrow();
        expect(() => assertDistinctRepositoryCredentials("shared-secret", "shared-secret")).toThrow(
            "management and maintenance tokens must be distinct",
        );

        await writeFile(maintenanceTokenFile, "two tokens");
        await expect(readRepositoryMaintenanceToken(maintenanceTokenFile)).rejects.toThrow(
            "maintenance token file must contain one non-empty Bearer token",
        );
    });

    test("refuses symlinked and malformed management token files without exposing their paths", async () => {
        const root = await temporaryRoot();
        const tokenFile = join(root, "private-token");
        const linkedTokenFile = join(root, "linked-token");
        await writeFile(tokenFile, "management-secret", { mode: 0o600 });
        await symlink(tokenFile, linkedTokenFile);

        for (const path of [linkedTokenFile, root, join(root, "missing-token")]) {
            const failure = readRepositoryManagementToken(path).catch((error) => error);
            expect(String(await failure)).toContain("bounded regular file");
            expect(String(await failure)).not.toContain(path);
        }

        await writeFile(tokenFile, new Uint8Array([0xc3, 0x28]));
        await expect(readRepositoryManagementToken(tokenFile)).rejects.toThrow("bounded regular file");
    });
});

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-repository-server-"));
    roots.push(root);
    return root;
}

async function makeWritable(path: string): Promise<void> {
    const metadata = await lstat(path);
    if (!metadata.isDirectory()) {
        return;
    }
    await chmod(path, 0o750);
    for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            await makeWritable(join(path, entry.name));
        }
    }
}
