import { afterEach, describe, expect, test } from "bun:test";
import { chmod, lstat, mkdtemp, opendir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    canonicalJsonBytes,
    sha256Hex,
    validateIntegrationPackageEnvelope,
    type IntegrationPackageSource,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import {
    FsIntegrationPackageCache,
    IntegrationPackageCacheCorruptionError,
} from "@bernouy/cms-integration-packages/fs";
import {
    InMemoryIntegrationInstallationRepository,
    IntegrationRepositoryUnavailableError,
    runIntegrationInstallation,
} from "@bernouy/cms-integrations";
import { FsIntegrationPackageResolver } from "@bernouy/cms-integrations/fs";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { REMOTE_DEFINITION, REMOTE_INTEGRATION_KIND, REMOTE_INTEGRATION_VERSION } from "./fixture/catalogFixture";

const cleanup: string[] = [];

afterEach(async () => {
    for (const root of cleanup.splice(0)) {
        await makeOwnerWritable(root);
        await rm(root, { recursive: true, force: true });
    }
});

describe("Lot 0 durable package failure guarantees", () => {
    test("leaves an installed pin and run history untouched on an offline cache miss", async () => {
        const root = await temporaryRoot();
        const input = await packageFixture();
        const installations = new InMemoryIntegrationInstallationRepository();
        await installations.create({
            id: REMOTE_INTEGRATION_KIND,
            label: REMOTE_DEFINITION.label,
            definitionVersion: REMOTE_INTEGRATION_VERSION,
            definitionSnapshot: REMOTE_DEFINITION,
            packageDigest: input.digest,
            status: "success",
            answersSnapshot: {},
            secretRefs: {},
            secretInputs: [],
            artifacts: [],
            runs: [],
        });
        const before = await installations.get(REMOTE_INTEGRATION_KIND);
        const resolver = new FsIntegrationPackageResolver({
            cache: new FsIntegrationPackageCache({ root }),
            source: unavailableSource(),
        });

        await expect(
            runIntegrationInstallation({
                mode: "rerun",
                deps: { sources: new InMemorySourceRepository(), secrets: new InMemorySecretStore() },
                installations,
                integrationId: REMOTE_INTEGRATION_KIND,
                packageResolver: resolver,
            }),
        ).rejects.toBeInstanceOf(IntegrationRepositoryUnavailableError);
        expect(await installations.get(REMOTE_INTEGRATION_KIND)).toEqual(before);
    });

    test("fails closed on a corrupt pinned object and repairs only from matching source bytes", async () => {
        const root = await temporaryRoot();
        const input = await packageFixture();
        const cache = new FsIntegrationPackageCache({ root });
        const object = await cache.materialize(input);
        const definitionPath = join(object.root, "definition.json");
        await chmod(definitionPath, 0o640);
        await writeFile(definitionPath, "corrupt\n", "utf8");
        const request = {
            kind: REMOTE_INTEGRATION_KIND,
            version: REMOTE_INTEGRATION_VERSION,
            reason: "rerun" as const,
            expectedDigest: input.digest,
            expectedDefinition: REMOTE_DEFINITION,
            allowEmbeddedFallback: false,
        };

        const offline = new FsIntegrationPackageResolver({
            cache: new FsIntegrationPackageCache({ root }),
            source: unavailableSource(),
        });
        await expect(offline.resolve(request)).rejects.toBeInstanceOf(IntegrationRepositoryUnavailableError);
        await expect(new FsIntegrationPackageCache({ root }).get(input.digest)).rejects.toBeInstanceOf(
            IntegrationPackageCacheCorruptionError,
        );

        const repaired = await new FsIntegrationPackageResolver({
            cache: new FsIntegrationPackageCache({ root }),
            source: staticSource(input),
        }).resolve(request);
        expect(repaired.digest).toBe(input.digest);
        expect(await readFile(join(repaired.root, "definition.json"), "utf8")).toBe(JSON.stringify(REMOTE_DEFINITION));
    });

    test("two independent materializers converge on one immutable object", async () => {
        const root = await temporaryRoot();
        const input = await packageFixture();
        const first = new FsIntegrationPackageCache({ root });
        const second = new FsIntegrationPackageCache({ root });

        const [left, right] = await Promise.all([first.materialize(input), second.materialize(input)]);

        expect(left).toEqual(right);
        expect(await readdir(join(root, "objects", "sha256"))).toEqual([input.digest]);
        expect(await readdir(join(root, ".staging"))).toEqual([]);
        expect((await new FsIntegrationPackageCache({ root }).get(input.digest))?.digest).toBe(input.digest);
    });
});

async function packageFixture(): Promise<ResolvedIntegrationPackage> {
    const envelope = validateIntegrationPackageEnvelope({
        schema: "cms.integration.package.v1",
        kind: REMOTE_INTEGRATION_KIND,
        version: REMOTE_INTEGRATION_VERSION,
        definition: "definition.json",
        releaseNotes: "README.md",
        files: {
            "README.md": { encoding: "utf8", content: "# Acceptance\n" },
            "definition.json": { encoding: "utf8", content: JSON.stringify(REMOTE_DEFINITION) },
        },
    });
    const canonicalBytes = canonicalJsonBytes(envelope);
    return { envelope, canonicalBytes, digest: await sha256Hex(canonicalBytes) };
}

function unavailableSource(): IntegrationPackageSource {
    return { getPackage: async () => Promise.reject(new IntegrationRepositoryUnavailableError()) };
}

function staticSource(input: ResolvedIntegrationPackage): IntegrationPackageSource {
    return { getPackage: async () => structuredClone(input) };
}

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-lot0-cache-guarantees-"));
    cleanup.push(root);
    return root;
}

async function makeOwnerWritable(path: string): Promise<void> {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) {
        await unlink(path);
        return;
    }
    await chmod(path, metadata.isDirectory() ? 0o700 : 0o600);
    if (metadata.isDirectory()) {
        const directory = await opendir(path);
        for await (const entry of directory) {
            await makeOwnerWritable(join(path, entry.name));
        }
    }
}
