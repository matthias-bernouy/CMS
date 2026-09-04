import { canonicalJsonBytes } from "../../core/canonical/canonicalizeJson";
import { sha256Hex } from "../../core/digest";
import { resolveIntegrationPackageLimits } from "../../core/envelope/constants";
import { decodeIntegrationPackageFile } from "../../core/envelope/encoding";
import { validateIntegrationPackageEnvelope } from "../../core/envelope/validate";
import { type IntegrationPackageEnvelopeV1, type IntegrationPackageLimits } from "../../interfaces/envelope";
import { readIntegrationPackageFiles } from "./directoryWalker";

export type ReadIntegrationPackageDirectoryOptions = {
    /**
     * A committed version root that remains immutable for the whole read. The
     * reader detects common concurrent changes but is not a sandbox against a
     * same-identity process mutating parent paths during traversal.
     */
    root: string;
    kind: string;
    version: string;
    definition: string;
    releaseNotes?: string;
    legacy?: boolean;
    /**
     * The immutable envelope persisted beside a managed registry version.
     * Supplying it preserves intentional utf8/base64 representation choices
     * while still comparing every decoded byte with the directory contents.
     */
    expectedEnvelope?: IntegrationPackageEnvelopeV1;
    /** Authoring-only root entries which must not become runtime package bytes. */
    excludeRootEntries?: readonly string[];
    /** Authoring-only relative paths whose complete subtrees must not become package bytes. */
    excludePathPrefixes?: readonly string[];
    limits?: Partial<IntegrationPackageLimits>;
};

export type ReadIntegrationPackageDirectoryResult = {
    envelope: IntegrationPackageEnvelopeV1;
    canonicalBytes: Uint8Array;
    digest: string;
};

export async function readIntegrationPackageDirectory(
    options: ReadIntegrationPackageDirectoryOptions,
): Promise<ReadIntegrationPackageDirectoryResult> {
    if (!options.releaseNotes && !options.legacy) {
        throw new Error("Integration package release notes are required unless the package is marked as legacy");
    }
    const limits = resolveIntegrationPackageLimits(options.limits);
    const files = await readIntegrationPackageFiles(options.root, limits, {
        excludeRootEntries: options.excludeRootEntries,
        excludePathPrefixes: options.excludePathPrefixes,
    });
    const envelope = options.expectedEnvelope
        ? validateExpectedEnvelope(options, files, limits)
        : validateIntegrationPackageEnvelope(
              {
                  schema: "cms.integration.package.v1",
                  kind: options.kind,
                  version: options.version,
                  definition: options.definition,
                  ...(options.releaseNotes ? { releaseNotes: options.releaseNotes } : {}),
                  files,
              },
              { limits, requireReleaseNotes: options.legacy !== true },
          );
    const canonicalBytes = canonicalJsonBytes(envelope);
    if (canonicalBytes.byteLength > limits.maxDocumentBytes) {
        throw new Error(`Integration package document exceeds ${limits.maxDocumentBytes} bytes`);
    }
    return {
        envelope,
        canonicalBytes,
        digest: await sha256Hex(canonicalBytes),
    };
}

function validateExpectedEnvelope(
    options: ReadIntegrationPackageDirectoryOptions,
    actualFiles: IntegrationPackageEnvelopeV1["files"],
    limits: Readonly<IntegrationPackageLimits>,
): IntegrationPackageEnvelopeV1 {
    const expected = validateIntegrationPackageEnvelope(options.expectedEnvelope, {
        limits,
        requireReleaseNotes: options.legacy !== true,
    });
    if (
        expected.kind !== options.kind ||
        expected.version !== options.version ||
        expected.definition !== options.definition ||
        expected.releaseNotes !== options.releaseNotes
    ) {
        throw new Error("Expected integration package envelope does not match the requested directory identity");
    }
    const expectedPaths = Object.keys(expected.files).sort();
    const actualPaths = Object.keys(actualFiles).sort();
    if (expectedPaths.join("\0") !== actualPaths.join("\0")) {
        throw new Error("Integration package directory has missing or unexpected files");
    }
    for (const path of expectedPaths) {
        const expectedFile = expected.files[path];
        const actualFile = actualFiles[path];
        if (
            !expectedFile ||
            !actualFile ||
            !equalBytes(decodeIntegrationPackageFile(expectedFile), decodeIntegrationPackageFile(actualFile))
        ) {
            throw new Error(`Integration package directory file differs from its expected envelope: ${path}`);
        }
    }
    return expected;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
