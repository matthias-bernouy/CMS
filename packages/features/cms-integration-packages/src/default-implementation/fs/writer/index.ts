import type { ResolvedIntegrationPackage } from "../../../interfaces/source";
import { readIntegrationPackageDirectory } from "../reader";
import { removeOwnedStaging } from "./cleanup";
import { equalPackageBytes, prepareIntegrationPackage } from "./prepare";
import { createStagingDirectory, OwnedStagingCreationError, type StagingDirectory } from "./paths";
import type { WriteImmutableIntegrationPackageDirectoryOptions } from "./types";
import { writePackageFiles } from "./write";

export type {
    ExpectedIntegrationPackageIdentity,
    ImmutableIntegrationPackageIdentity,
    WriteImmutableIntegrationPackageDirectoryOptions,
} from "./types";

export type WrittenImmutableIntegrationPackageDirectory = ResolvedIntegrationPackage & {
    readonly root: string;
};

export async function writeImmutableIntegrationPackageDirectory(
    input: ResolvedIntegrationPackage,
    options: WriteImmutableIntegrationPackageDirectoryOptions,
): Promise<WrittenImmutableIntegrationPackageDirectory> {
    const prepared = await prepareIntegrationPackage(input, options.expected, options.limits);
    let staging: StagingDirectory | undefined;
    try {
        staging = await createStagingDirectory(options.destination);
        await writePackageFiles(staging, prepared, options.limits);
        const verified = await readIntegrationPackageDirectory({
            root: staging.root.path,
            kind: options.expected.kind,
            version: options.expected.version,
            definition: prepared.envelope.definition,
            ...(prepared.envelope.releaseNotes
                ? { releaseNotes: prepared.envelope.releaseNotes }
                : { legacy: true as const }),
            expectedEnvelope: prepared.envelope,
            limits: options.limits,
        });
        if (
            verified.digest !== options.expected.digest ||
            verified.digest !== prepared.digest ||
            !equalPackageBytes(verified.canonicalBytes, prepared.canonicalBytes)
        ) {
            throw new Error("Written integration package directory does not reproduce its canonical digest");
        }
        return { root: staging.root.path, ...verified };
    } catch (error) {
        if (error instanceof OwnedStagingCreationError) {
            staging = error.staging;
        }
        if (staging) {
            try {
                await removeOwnedStaging(staging);
            } catch (cleanupError) {
                throw new AggregateError(
                    [error, cleanupError],
                    "Integration package staging write and owned cleanup both failed",
                );
            }
        }
        throw error;
    }
}
