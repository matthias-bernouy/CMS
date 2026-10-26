import type { AdmittedContractRelease } from "cms-repository/contracts/core/admission/admitContractRelease";
import type { ReleaseCatalogue } from "cms-repository/contracts/interfaces/ReleaseCatalogue";
import { planContractPublications } from "./planPublications";

/** Validate the complete set before publishing in the shared dependency order. */
export async function publishContractSet(
    catalogue: ReleaseCatalogue,
    admissions: readonly AdmittedContractRelease[],
): Promise<readonly AdmittedContractRelease[]> {
    const planned = await planContractPublications(catalogue, admissions);
    for (const admission of planned) {
        await catalogue.publish(admission);
    }
    return planned;
}
