import { canonicalJsonBytes } from "../../core/canonical/canonicalizeJson";
import { sha256Hex } from "../../core/digest";
import { resolveIntegrationPackageLimits } from "../../core/envelope/constants";
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
    const files = await readIntegrationPackageFiles(options.root, limits);
    const envelope = validateIntegrationPackageEnvelope(
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
