import type { GatewayActor, GatewayInvoker } from "cms-gateway/invocation/interfaces/Invocation";
import type { GatewayHttpFailureObserver } from "../handleHttpCall";

export type CapabilityHttpHandlerConfig = {
    siteId: string;
    basePath: string;
    invoker: GatewayInvoker;
    resolveActor(request: Request): Promise<GatewayActor>;
    authenticateProvider?: (token: string) => Promise<string | null>;
    onFailure?: GatewayHttpFailureObserver;
};

export type CapabilityQueryHandlerConfig = Omit<CapabilityHttpHandlerConfig, "authenticateProvider"> & {
    resolveCapability(
        contractId: string,
        capabilityId: string,
    ): Promise<{
        readonly access: "public" | "authenticated" | "admin";
        readonly effect: "query" | "command";
        readonly idempotency?: "none" | "natural" | "keyed";
        readonly outputType: string;
    } | null>;
};

export type CapabilityMutationHandlerConfig = CapabilityQueryHandlerConfig & {
    onSuccess?: (target: { readonly contractId: string; readonly capabilityId: string }) => void;
};
