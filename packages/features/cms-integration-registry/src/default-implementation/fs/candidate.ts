import {
    decodedIntegrationPackageFileByteLength,
    type IntegrationPackageLimits,
} from "@bernouy/cms-integration-packages";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import type {
    IntegrationRegistryDiagnosticCode,
    IntegrationRegistryDiagnosticStage,
    IntegrationRegistryExactVersionLocation,
    IntegrationRegistryValidatedCatalogEntry,
} from "../../interfaces/catalog";

export class CandidateValidationError extends Error {
    constructor(
        readonly source: string,
        readonly stage: IntegrationRegistryDiagnosticStage,
        readonly code: IntegrationRegistryDiagnosticCode,
        readonly kind: string | undefined,
        readonly version: string | undefined,
        cause: unknown,
    ) {
        super(errorMessage(cause), { cause });
        this.name = "CandidateValidationError";
    }
}

export async function validateIntegrationCandidate(
    source: string,
    limits?: Partial<IntegrationPackageLimits>,
): Promise<IntegrationRegistryValidatedCatalogEntry> {
    const repository = new FsIntegrationDefinitionRepository(source);
    let summaryKind: string;
    try {
        const summaries = await repository.list();
        if (summaries.length !== 1) {
            throw new Error(`Expected one integration package, found ${summaries.length}`);
        }
        summaryKind = summaries[0]!.kind;
    } catch (error) {
        throw candidateError(source, "index", undefined, undefined, error);
    }

    let index;
    try {
        index = await repository.getIndex(summaryKind);
        if (!index) {
            throw new Error(`Integration index "${summaryKind}" disappeared during snapshot construction`);
        }
    } catch (error) {
        throw candidateError(source, "index", summaryKind, undefined, error);
    }

    const versions: IntegrationRegistryExactVersionLocation[] = [];
    for (const entry of index.versions) {
        let location;
        try {
            location = await repository.locateExactVersion(index.kind, entry.version);
            if (!location) {
                throw new Error(`Integration version "${index.kind}@${entry.version}" was not found`);
            }
        } catch (error) {
            throw candidateError(source, "version", index.kind, entry.version, error);
        }
        try {
            const result = await readIntegrationPackageDirectory({
                ...location,
                kind: index.kind,
                version: entry.version,
                limits,
            });
            versions.push({
                kind: index.kind,
                version: entry.version,
                packageRoot: location.root,
                definition: location.definition,
                ...(location.releaseNotes ? { releaseNotes: location.releaseNotes } : {}),
                ...(location.legacy ? { legacy: true } : {}),
                package: {
                    schema: result.envelope.schema,
                    digest: result.digest,
                    canonicalBytes: result.canonicalBytes.byteLength,
                    decodedBytes: Object.values(result.envelope.files).reduce(
                        (total, file) => total + decodedIntegrationPackageFileByteLength(file),
                        0,
                    ),
                    files: Object.keys(result.envelope.files).length,
                },
            });
        } catch (error) {
            throw candidateError(source, "package", index.kind, entry.version, error);
        }
    }
    return { source, index, versions };
}

function candidateError(
    source: string,
    stage: "index" | "version" | "package",
    kind: string | undefined,
    version: string | undefined,
    cause: unknown,
): CandidateValidationError {
    const message = errorMessage(cause);
    const duplicateVersion = /duplicate version(?: path)?/i.test(message);
    return new CandidateValidationError(
        source,
        duplicateVersion ? "identity" : stage,
        duplicateVersion
            ? "duplicate-version-identity"
            : stage === "index"
              ? "invalid-integration"
              : stage === "version"
                ? "invalid-version"
                : "invalid-package",
        kind,
        version,
        cause,
    );
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
