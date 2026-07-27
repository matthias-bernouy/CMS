import {
    identifyMigrationVerificationInput,
    type MigrationVerificationInputV1,
} from "@bernouy/cms-integration-verification";
import { readCanonicalJsonFile } from "../../persistence/canonicalFile";
import { readVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";
import {
    candidateMigrationInputPath,
    FS_INTEGRATION_REGISTRY_CANDIDATE_CONTROL_DOCUMENT_LIMIT,
    type FsIntegrationRegistryCandidateLayout,
} from "../layout";
import { corrupt, writeOrVerifyObject } from "./shared";

export async function persistCandidateMigrationInputs(
    layout: FsIntegrationRegistryCandidateLayout,
    values: readonly MigrationVerificationInputV1[],
): Promise<readonly string[]> {
    const identified = await Promise.all(values.map(identifyMigrationVerificationInput));
    const ordered = identified.toSorted((left, right) => left.digest.localeCompare(right.digest));
    if (ordered.some((entry, index) => entry.digest === ordered[index - 1]?.digest)) {
        corrupt("Candidate migration inputs must use unique canonical digests");
    }
    for (const entry of ordered) {
        await writeOrVerifyObject(
            layout,
            layout.migrationInputs,
            candidateMigrationInputPath(layout, entry.digest),
            entry.input,
            FS_INTEGRATION_REGISTRY_CANDIDATE_CONTROL_DOCUMENT_LIMIT,
            () => readCandidateMigrationInput(layout, entry.digest),
        );
    }
    return Object.freeze(ordered.map((entry) => entry.digest));
}

export async function readCandidateMigrationInput(
    layout: FsIntegrationRegistryCandidateLayout,
    digest: string,
): Promise<MigrationVerificationInputV1> {
    await readVerifiedRegistryDirectory(layout.migrationInputs);
    const value = await readCanonicalJsonFile(
        candidateMigrationInputPath(layout, digest),
        FS_INTEGRATION_REGISTRY_CANDIDATE_CONTROL_DOCUMENT_LIMIT,
    );
    if (value === null) {
        corrupt(`Candidate migration input ${digest} is missing`);
    }
    const identified = await identifyMigrationVerificationInput(value);
    if (identified.digest !== digest) {
        corrupt(`Candidate migration input ${digest} does not match its path digest`);
    }
    await readVerifiedRegistryDirectory(layout.migrationInputs);
    return identified.input;
}
