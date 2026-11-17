export type OwnedStack = Readonly<{ id: string; providerName: string; instanceId: string }>;
export type Namespace = Readonly<{ namespaceId?: unknown; namespaceKey?: unknown }>;
export type NamespaceCleanupRequest = Readonly<{
    family: "files" | "secrets";
    stackId: string;
    providerName: string;
    instanceId: string;
    namespaceId: string;
    namespaceKey: string;
    name: string;
}>;

export function assertOwnedNamespaceCleanup(stack: OwnedStack, credentials: Namespace, name: string): void {
    if (
        !/^ulvia-mcp-[a-f0-9]{8}$/u.test(stack.id) ||
        stack.providerName !== `${stack.id}-provider` ||
        !/^instance:[a-f0-9-]{36}$/u.test(stack.instanceId) ||
        !name.startsWith("performance-") ||
        name.length > 160 ||
        typeof credentials.namespaceId !== "string" ||
        !credentials.namespaceId ||
        credentials.namespaceId.length > 160 ||
        typeof credentials.namespaceKey !== "string" ||
        credentials.namespaceKey.length < 20 ||
        credentials.namespaceKey.length > 512
    ) {
        throw new Error("Cleanup requires an exact disposable stack and an owned performance namespace");
    }
}
