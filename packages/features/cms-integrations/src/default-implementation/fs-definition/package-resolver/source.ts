import type { IntegrationPackageSource, ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import { IntegrationRepositoryContractError, MissingIntegrationPackageError } from "../../../core/errors";

type LoadExactPackageSourceOptions = {
    source: IntegrationPackageSource;
    embeddedSource?: IntegrationPackageSource;
    kind: string;
    version: string;
    allowEmbeddedFallback: boolean;
};

export async function loadExactPackageSource(
    options: LoadExactPackageSourceOptions,
): Promise<ResolvedIntegrationPackage> {
    let unavailable: unknown;
    let input;
    try {
        input = await options.source.getPackage(options.kind, options.version);
    } catch (error) {
        if (!options.allowEmbeddedFallback || !isUnavailable(error)) {
            throw error;
        }
        unavailable = error;
    }
    if (!input && options.allowEmbeddedFallback && options.embeddedSource) {
        input = await options.embeddedSource.getPackage(options.kind, options.version);
    }
    if (!input) {
        if (unavailable) {
            throw unavailable;
        }
        throw new MissingIntegrationPackageError(options.kind, options.version);
    }
    if (input.envelope.kind !== options.kind || input.envelope.version !== options.version) {
        throw new IntegrationRepositoryContractError();
    }
    return input;
}

function isUnavailable(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        (error as { status?: unknown }).status === 503
    );
}
