import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    FsIntegrationPackageCache,
    INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA,
    IntegrationPackageCacheReferenceCorruptionError,
} from "@bernouy/cms-integration-packages/fs";
import { cleanupRoots, resolvedPackage, temporaryCacheRoot } from "../fixtures";

const cleanup: string[] = [];
afterEach(() => cleanupRoots(cleanup));

describe("filesystem integration package cache reference validation", () => {
    test.each([
        ["partial JSON", Uint8Array.from(Buffer.from('{"schema":'))],
        [
            "unknown field",
            canonicalJsonBytes({
                schema: INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA,
                kind: "cache-demo",
                version: "1.0.0",
                digest: "a".repeat(64),
                extra: true,
            }),
        ],
        [
            "wrong schema",
            canonicalJsonBytes({ schema: "other", kind: "cache-demo", version: "1.0.0", digest: "a".repeat(64) }),
        ],
        [
            "coordinate mismatch",
            canonicalJsonBytes({
                schema: INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA,
                kind: "other",
                version: "1.0.0",
                digest: "a".repeat(64),
            }),
        ],
        [
            "non-exact version",
            canonicalJsonBytes({
                schema: INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA,
                kind: "cache-demo",
                version: "1",
                digest: "a".repeat(64),
            }),
        ],
        [
            "malformed digest",
            canonicalJsonBytes({
                schema: INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA,
                kind: "cache-demo",
                version: "1.0.0",
                digest: "A".repeat(64),
            }),
        ],
        [
            "non-canonical JSON",
            Uint8Array.from(
                Buffer.from(
                    JSON.stringify(
                        {
                            schema: INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA,
                            kind: "cache-demo",
                            version: "1.0.0",
                            digest: "a".repeat(64),
                        },
                        null,
                        2,
                    ),
                ),
            ),
        ],
        [
            "duplicate property",
            Uint8Array.from(
                Buffer.from(
                    `{"digest":"${"a".repeat(64)}","kind":"cache-demo","kind":"cache-demo","schema":"${INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA}","version":"1.0.0"}`,
                ),
            ),
        ],
    ])("rejects a %s reference without replacing it", async (_name, document) => {
        const cacheRoot = await temporaryCacheRoot(cleanup);
        const cache = new FsIntegrationPackageCache({ root: cacheRoot });
        await cache.init();
        const directory = join(cacheRoot, "refs", "cache-demo");
        await mkdir(directory);
        const path = join(directory, "1.0.0.json");
        await writeFile(path, document);

        await expect(cache.getReference("cache-demo", "1.0.0")).rejects.toBeInstanceOf(
            IntegrationPackageCacheReferenceCorruptionError,
        );
        await expect(cache.recordReference("cache-demo", "1.0.0", "b".repeat(64))).rejects.toBeInstanceOf(
            IntegrationPackageCacheReferenceCorruptionError,
        );
        expect(await readFile(path)).toEqual(document);
    });

    test("rejects a symlink reference without reading or replacing its target", async () => {
        const cacheRoot = await temporaryCacheRoot(cleanup);
        const cache = new FsIntegrationPackageCache({ root: cacheRoot });
        const input = await resolvedPackage();
        await cache.init();
        const directory = join(cacheRoot, "refs", input.envelope.kind);
        await mkdir(directory);
        const target = join(cacheRoot, "outside.json");
        const targetDocument = canonicalJsonBytes({
            schema: INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA,
            kind: input.envelope.kind,
            version: input.envelope.version,
            digest: input.digest,
        });
        await writeFile(target, targetDocument);
        await symlink(target, join(directory, `${input.envelope.version}.json`));

        await expect(cache.getReference(input.envelope.kind, input.envelope.version)).rejects.toBeInstanceOf(
            IntegrationPackageCacheReferenceCorruptionError,
        );
        await expect(
            cache.recordReference(input.envelope.kind, input.envelope.version, input.digest),
        ).rejects.toBeInstanceOf(IntegrationPackageCacheReferenceCorruptionError);
        expect(await readFile(target)).toEqual(targetDocument);
    });

    test("rejects a symlink kind directory", async () => {
        const cacheRoot = await temporaryCacheRoot(cleanup);
        const cache = new FsIntegrationPackageCache({ root: cacheRoot });
        await cache.init();
        const outside = join(cacheRoot, "outside");
        await mkdir(outside);
        await symlink(outside, join(cacheRoot, "refs", "cache-demo"));

        await expect(cache.getReference("cache-demo", "1.0.0")).rejects.toBeInstanceOf(
            IntegrationPackageCacheReferenceCorruptionError,
        );
        await expect(cache.recordReference("cache-demo", "1.0.0", "a".repeat(64))).rejects.toBeInstanceOf(
            IntegrationPackageCacheReferenceCorruptionError,
        );
    });
});
