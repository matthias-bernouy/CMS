import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { ProviderInstanceProfile, ProviderInstanceStatus } from "../instances/types";

export const KERNEL_PROVIDER_PROTOCOL = "ulvia-kernel-provider/v1" as const;

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
