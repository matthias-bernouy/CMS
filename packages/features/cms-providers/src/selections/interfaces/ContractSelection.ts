import type { ReleaseDigest } from "@bernouy/cms-contracts";

/** One exact contract release and installation per (siteId, contractId); never a runtime-reported choice. */
export interface ContractSelection {
    readonly siteId: string;
    readonly contractId: string;
    readonly version: string;
    readonly digest: ReleaseDigest;
    readonly installationId: string;
}
