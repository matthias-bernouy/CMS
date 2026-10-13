import {
    parseProviderRuntimeReport,
    type ProviderRuntimeReport,
} from "@bernouy/cms-repository/providers/installations";
import { isCanonicalSemVer } from "@bernouy/cms-repository/contracts/compatibility";
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
    try {
        const handshake = record(value, ["protocol", "instance", "activeProfile", "contentRevision", "runtime"]);
        const instance = record(handshake.instance, ["id", "status", "revision"]);
        const profile = record(handshake.activeProfile, ["id", "version"]);
        const runtime = parseProviderRuntimeReport(handshake.runtime);
        const contentRevision = handshake.contentRevision;
        if (
            handshake.protocol !== KERNEL_PROVIDER_PROTOCOL ||
            instance.status !== "ready" ||
            !identifier(instance.id, 160) ||
            !positiveInteger(instance.revision) ||
            !identifier(profile.id, 96) ||
            !isCanonicalSemVer(profile.version) ||
            !(
                (typeof contentRevision === "string" &&
                    contentRevision.length > 0 &&
                    contentRevision.length <= 256 * 1024) ||
                nonNegativeInteger(contentRevision)
            ) ||
            runtime.instanceId !== instance.id
        ) {
            throw new TypeError("Provider handshake is invalid");
        }
    } catch {
        throw new TypeError("Provider handshake is invalid");
    }
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Expected object");
    }
    const result = value as Record<string, unknown>;
    if (Object.keys(result).some((key) => !keys.includes(key)) || keys.some((key) => !(key in result))) {
        throw new TypeError("Unexpected object shape");
    }
    return result;
}

function identifier(value: unknown, maxLength: number): value is string {
    return (
        typeof value === "string" &&
        value.length > 0 &&
        value.length <= maxLength &&
        /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value)
    );
}

function positiveInteger(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) > 0;
}

function nonNegativeInteger(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) >= 0;
}
