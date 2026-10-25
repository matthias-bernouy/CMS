export interface NamespaceInventoryQuery {
    readonly cursor?: string;
    readonly limit?: number;
    readonly namespace?: string;
}
export interface NamespaceAccess {
    readonly namespace: string;
    readonly repositoryId: string;
    readonly access: "owned" | "transferred" | "revoked" | "missing";
    readonly revision: number | null;
    readonly publicKey: string | null;
    readonly checkedAt: string;
}
export interface NamespaceInventoryPage {
    readonly items: readonly NamespaceAccess[];
    readonly nextCursor: string | null;
}
export class NamespaceAccessError extends Error {}
