import { admitProviderManifest } from "@bernouy/ulvia-providers";
import type { ContractReleaseReader } from "@bernouy/ulvia-contracts/catalogue";
import { compileImplementations } from "@bernouy/ulvia-sdk/build";
import definition from "./definition.json";
import { smtpEmailerImplementation } from "../../capabilities/emailer/implementation";

export const compileEmailReleases = () => compileImplementations([smtpEmailerImplementation]);

/** Remaining families retain explicit claims until each handler table migrates to the SDK. */
export async function compileOfficialManifest(
    catalogue: ContractReleaseReader,
    email: Awaited<ReturnType<typeof compileEmailReleases>>,
) {
    const implementations: unknown[] = [...email.implementations];
    for (const claim of definition.implementations) {
        const row = await catalogue.get(claim.contractId, claim.version);
        if (!row) {
            throw new Error(`Missing declared implementation: ${claim.contractId}@${claim.version}`);
        }
        implementations.push({ ...claim, digest: row.admission.digest });
    }
    return admitProviderManifest({ ...definition, implementations }, catalogue);
}
