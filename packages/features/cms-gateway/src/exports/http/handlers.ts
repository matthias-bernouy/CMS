export { handleGatewayHttpCall, type GatewayHttpCallOptions } from "cms-gateway/invocation/http/handleHttpCall";
export { createCapabilityHttpHandler } from "cms-gateway/invocation/http/handlers/call";
export {
    createCapabilityMutationHandler,
    createCapabilityQueryHandler,
} from "cms-gateway/invocation/http/handlers/logical";
export type {
    CapabilityMutationHandlerConfig,
    CapabilityQueryHandlerConfig,
    CapabilityHttpHandlerConfig,
} from "cms-gateway/invocation/http/handlers/config";
export { readGatewayHttpInput } from "cms-gateway/invocation/http/readHttpInput";
export {
    CMS_CAPABILITY_CALL_ROUTE,
    CMS_CAPABILITY_MUTATION_ROUTE,
    CMS_CAPABILITY_QUERY_ROUTE,
    gatewayRoutePrefix,
} from "cms-gateway/invocation/http/routes";
