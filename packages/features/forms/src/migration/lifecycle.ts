import { admitContractBundle } from "@bernouy/ulvia-contracts";
import type { ContractRelease } from "@bernouy/ulvia-contracts";
import { formsMigrationContracts } from "./contracts";
/** Catalogue-only retirement evidence. It never grants executable Forms 1.x support. */
export async function formsMigrationRetirement(target: ContractRelease) {
    if (target.contractId !== "ulvia/cms.forms" || target.version !== "2.0.0") {
        throw new Error("Forms retirement recipe requires the exact target family and version");
    }
    const legacy = (await formsMigrationContracts()).find((row) => row.release.version === "1.1.0")!;
    const kept = new Set(target.capabilities.map((capability) => capability.id));
    const bridge = await admitContractBundle(
        {
            ...legacy.release,
            version: "1.2.0",
            capabilities: legacy.release.capabilities.map((capability) =>
                kept.has(capability.id)
                    ? capability
                    : {
                          ...capability,
                          deprecation: {
                              retirement: true,
                              reason: "Forms 2 replaces email-coupled operations with independent form and Event operations.",
                          },
                      },
            ),
        },
        legacy.documentationAssets ?? [],
    );
    return { legacy, bridge };
}
