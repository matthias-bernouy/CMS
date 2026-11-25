import { admitContractBundleJson } from "@bernouy/ulvia-contracts";
import snapshots from "./contracts.json";
import type { FormsV1Version } from "./convert";
export async function formsMigrationContracts() {
    return Promise.all(
        snapshots.map(async (row) => {
            const admission = await admitContractBundleJson(row.canonicalJson, [
                { id: "docs/usage.md", bytes: new TextEncoder().encode(row.documentation) },
            ]);
            if (admission.digest !== row.digest) {
                throw new Error("Forms migration source digest mismatch");
            }
            return admission;
        }),
    );
}
export async function formsMigrationVersion(pin: { version: string; digest: string }): Promise<FormsV1Version> {
    const contract = (await formsMigrationContracts()).find(
        (row) => row.release.version === pin.version && row.digest === pin.digest,
    );
    if (!contract || !["1.0.0", "1.1.0"].includes(contract.release.version)) {
        throw new Error(
            "FORMS_MIGRATION_SOURCE_UNSUPPORTED:Unsupported Forms 1.x release; no migration recipe matches its exact digest",
        );
    }
    return contract.release.version as FormsV1Version;
}
