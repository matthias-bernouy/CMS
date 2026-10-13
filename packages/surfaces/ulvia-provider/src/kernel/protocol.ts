import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { ProviderInstanceProfile, ProviderInstanceStatus } from "../instances/types";

export const KERNEL_PROVIDER_PROTOCOL = "ulvia-kernel-provider/v1" as const;

export const KERNEL_PROVIDER_QUERY_OPERATIONS = [
    "content.texts",
    "content.revision",
    "content.renderable-page",
    "content.renderable-pages",
    "content.resolve-page-reference",
    "content.resolve-renderable-route",
    "content.published-page",
    "content.published-page-by-id",
    "content.published-pages",
    "content.resolve-published-route",
    "content.renderable-blocs",
    "content.bloc-view-js",
    "content.rendering-settings",
    "auth.subject",
    "auth.is-administrator",
    "auth.identity-providers",
    "page.required-access",
    "gateway.invoke",
    "gateway.resolve-http",
    "assets.metadata",
    "assets.metadata-batch",
] as const;

export type KernelProviderQueryOperation = (typeof KERNEL_PROVIDER_QUERY_OPERATIONS)[number];

export type KernelProviderQuery = Readonly<{
    operation: KernelProviderQueryOperation;
    input?: unknown;
}>;

export interface KernelInstanceApi {
    query(query: KernelProviderQuery): Promise<unknown>;
    handleAuth(action: string, request: Request): Promise<Response>;
    handleCapability(request: Request): Promise<Response>;
    handleCollectionAsset(request: Request): Promise<Response>;
    handleSitemap(request: Request): Promise<Response>;
}

export type KernelProviderHandshake = Readonly<{
    protocol: typeof KERNEL_PROVIDER_PROTOCOL;
    instance: {
        id: string;
        status: ProviderInstanceStatus;
        revision: number;
    };
    activeProfile: ProviderInstanceProfile;
    contentRevision: number | string;
    runtime: ProviderRuntimeReport;
}>;

export function assertKernelProviderHandshake(value: unknown): asserts value is KernelProviderHandshake {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Provider handshake is invalid");
    }
    const handshake = value as Record<string, unknown>;
    const instance = handshake.instance as Record<string, unknown> | undefined;
    const profile = handshake.activeProfile as Record<string, unknown> | undefined;
    if (
        handshake.protocol !== KERNEL_PROVIDER_PROTOCOL ||
        !instance ||
        typeof instance.id !== "string" ||
        instance.status !== "ready" ||
        !Number.isSafeInteger(instance.revision) ||
        !profile ||
        typeof profile.id !== "string" ||
        typeof profile.version !== "string" ||
        !(typeof handshake.contentRevision === "string" || Number.isSafeInteger(handshake.contentRevision)) ||
        !handshake.runtime ||
        typeof handshake.runtime !== "object" ||
        Array.isArray(handshake.runtime)
    ) {
        throw new TypeError("Provider handshake is invalid");
    }
}
