import type { ContractSelection } from "./ContractSelection";

export interface AuthorityCapability {
    readonly selection: ContractSelection;
    readonly contractId: string;
    readonly version: string;
    readonly digest: string;
    readonly capabilityId: string;
    readonly effect: "query" | "command";
    readonly sensitive: boolean;
    readonly access: "public" | "authenticated" | "admin";
}
export interface SelectionAuthority {
    readonly providers: readonly { installationId: string; manifestDigest: string }[];
    readonly capabilities: readonly AuthorityCapability[];
    readonly machine: readonly { installationId: string; fromContractId?: string; target: number }[];
    readonly delegated: readonly { source: number; target: number }[];
}
