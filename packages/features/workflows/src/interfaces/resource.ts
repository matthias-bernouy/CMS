import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
export interface WorkflowResourceUse {
    readonly sourceContractId: string;
    readonly sourceInstallationId: string;
    readonly resources: readonly {
        readonly path: string;
        readonly resolver: string;
        readonly resourceId: string;
        readonly version: string;
        readonly digest: string;
    }[];
    readonly schema: UlviaSchema;
    readonly paths: readonly string[];
}
