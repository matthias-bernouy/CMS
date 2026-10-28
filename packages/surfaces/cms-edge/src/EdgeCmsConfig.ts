import type { CapabilityHttpHandlerConfig } from "@bernouy/cms-gateway/http/handlers";
import type { GatewayActor } from "@bernouy/cms-gateway";
import type { Runner } from "@bernouy/http-runner";
import type { Logger } from "@bernouy/logging";

export type EdgeCmsConfig = {
    runner: Runner;
    mcpHandler?: (request: Request) => Promise<Response | null>;
    resolveActor(request: Request): Promise<GatewayActor>;
    resourceHandler(request: Request, actor: GatewayActor): Promise<Response>;
    sessionCookie?: { readonly secure?: boolean };
    capabilityGateway?: {
        readonly siteId: string;
        readonly invoker: CapabilityHttpHandlerConfig["invoker"];
        readonly authenticateProvider?: (token: string) => Promise<string | null>;
        readonly resolveCapability?: (
            contractId: string,
            capabilityId: string,
        ) => Promise<{
            readonly access: "public" | "authenticated" | "admin";
            readonly effect: "query" | "command";
            readonly outputType: string;
        } | null>;
        readonly onMutationSuccess?: (target: { readonly contractId: string; readonly capabilityId: string }) => void;
    };
    capabilityHandler?: (request: Request) => Promise<Response>;
    mutationHandler?: (request: Request) => Promise<Response>;
    queryHandler?: (request: Request) => Promise<Response>;
    logger: Logger;
};
