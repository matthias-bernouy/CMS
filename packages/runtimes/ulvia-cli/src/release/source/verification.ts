import { lstat, opendir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
    canonicalJsonBytes,
    DEFAULT_CANONICAL_FILE_SET_LIMITS,
    type CanonicalFileSet,
} from "@bernouy/cms-integration-packages";
import type { StoredIntegrationVerificationBundle } from "@bernouy/cms-integration-registry";
import {
    collectVerificationSuiteSourceClosure,
    computeIntegrationVerificationDigest,
    validateIntegrationVerificationEnvelope,
} from "@bernouy/cms-integration-verification";
import { loadUpgradeFixtureSuite } from "../verification/upgradeFixtures";

const TEST_ROOT = join("tests", "integration-contracts");
const FIXTURE_SOURCE = join(TEST_ROOT, "upgrade-fixtures.ts");
const BUNDLE_ROOT = "upgrade";
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"];

export async function buildLocalVerificationBundle(
    integrationRoot: string,
    target: Readonly<{ kind: string; version: string; packageDigest: string }>,
): Promise<StoredIntegrationVerificationBundle> {
    const fixture = await regularFileOrMissing(join(integrationRoot, FIXTURE_SOURCE));
    const fixtureSuite = fixture ? await loadUpgradeFixtureSuite(integrationRoot) : null;
    if (fixture && !fixtureSuite) {
        throw new Error("Upgrade fixture disappeared while building its verification bundle");
    }
    const entrypoint = `${BUNDLE_ROOT}/upgrade-fixtures.ts`;
    const candidateFiles = fixture ? await readCandidateFiles(join(integrationRoot, TEST_ROOT)) : {};
    const closure = fixture ? await collectVerificationSuiteSourceClosure(candidateFiles, entrypoint) : [];
    const files = Object.fromEntries(closure.map(({ path, file }) => [path, file]));
    const envelope = await validateIntegrationVerificationEnvelope({
        schema: "cms.integration.verification.v1",
        target,
        manifest: {
            runnerRequirements: [{ name: "cms-postgres", versionRange: "^1.0.0" }],
            contracts: [],
            conformance: [],
            fixtures: [],
            ...(fixtureSuite
                ? {
                      upgradeFixture: {
                          entrypoint,
                          scenarios: fixtureSuite.scenarios.map(({ name, from, dependencies }) => ({
                              name,
                              from,
                              ...(dependencies ? { dependencies } : {}),
                          })),
                      },
                  }
                : {}),
        },
        files,
    });
    const canonicalBytes = canonicalJsonBytes(envelope);
    return {
        envelope,
        canonicalBytes,
        digest: await computeIntegrationVerificationDigest(envelope),
    };
}

async function readCandidateFiles(root: string): Promise<CanonicalFileSet> {
    const files: Record<string, { encoding: "utf8"; content: string }> = {};
    let decodedBytes = 0;
    const visit = async (directory: string, depth: number): Promise<void> => {
        if (depth > DEFAULT_CANONICAL_FILE_SET_LIMITS.maxDepth) {
            throw new Error("Upgrade fixture source tree exceeds its depth limit");
        }
        const handle = await opendir(directory);
        for await (const entry of handle) {
            if (entry.isSymbolicLink()) {
                throw new Error("Upgrade fixture source tree must not contain symbolic links");
            }
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(path, depth + 1);
                continue;
            }
            if (!entry.isFile() || !SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
                continue;
            }
            const bytes = await readFile(path);
            if (bytes.byteLength > DEFAULT_CANONICAL_FILE_SET_LIMITS.maxFileBytes) {
                throw new Error(`Upgrade fixture source file is too large: ${entry.name}`);
            }
            decodedBytes += bytes.byteLength;
            if (
                Object.keys(files).length >= DEFAULT_CANONICAL_FILE_SET_LIMITS.maxFiles ||
                decodedBytes > DEFAULT_CANONICAL_FILE_SET_LIMITS.maxDecodedBytes
            ) {
                throw new Error("Upgrade fixture source tree exceeds its bundle limits");
            }
            const source = portablePath(relative(root, path));
            files[`${BUNDLE_ROOT}/${source}`] = { encoding: "utf8", content: decodeUtf8(bytes, source) };
        }
    };
    await visit(root, 0);
    return files;
}

async function regularFileOrMissing(path: string): Promise<boolean> {
    const metadata = await lstat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (!metadata) {
        return false;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error(`Upgrade fixture must be a regular file at ${FIXTURE_SOURCE}`);
    }
    return true;
}

function portablePath(path: string): string {
    return path.split(sep).join("/");
}

function decodeUtf8(bytes: Uint8Array, path: string): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        throw new Error(`Upgrade fixture source must be valid UTF-8: ${path}`);
    }
}
