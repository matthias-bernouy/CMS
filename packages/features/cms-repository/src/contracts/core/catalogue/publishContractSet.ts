import type { AdmittedContractRelease } from "cms-repository/contracts/core/admission/admitContractRelease";
import type { ReleaseCatalogue } from "cms-repository/contracts/interfaces/ReleaseCatalogue";

/** Publishes a finite release set after ordering its internal contract dependencies. */
export async function publishContractSet(
    catalogue: ReleaseCatalogue,
    admissions: readonly AdmittedContractRelease[],
): Promise<readonly AdmittedContractRelease[]> {
    const pending = [...admissions];
    const published: AdmittedContractRelease[] = [];
    while (pending.length) {
        const pendingContractIds = new Set(pending.map(({ release }) => release.contractId));
        const readyIndexes = pending.flatMap((admission, index) =>
            admission.release.capabilities.every((capability) =>
                (capability.requires ?? []).every(
                    ({ contractId }) =>
                        contractId === admission.release.contractId || !pendingContractIds.has(contractId),
                ),
            )
                ? [index]
                : [],
        );
        if (!readyIndexes.length) {
            throw new Error(
                `Contract release set contains a dependency cycle: ${pending
                    .map(({ release }) => `${release.contractId}@${release.version}`)
                    .join(", ")}`,
            );
        }
        const readyAdmissions = readyIndexes.map((index) => pending[index]!);
        for (const index of readyIndexes.toReversed()) {
            pending.splice(index, 1);
        }
        for (const admission of readyAdmissions) {
            await catalogue.publish(admission);
            published.push(admission);
        }
    }
    return published;
}
