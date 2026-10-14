export { handleGatewayHttpCall, type GatewayHttpCallOptions } from "cms-gateway/invocation/http/handleHttpCall";
export {
    createCapabilityHttpHandler,
    createCapabilityQueryHandler,
    type CapabilityQueryHandlerConfig,
    type CapabilityHttpHandlerConfig,
    type PageExecutionHttpPort,
} from "cms-gateway/invocation/http/createCapabilityHttpHandler";
export { readGatewayHttpInput } from "cms-gateway/invocation/http/readHttpInput";
export {
    CMS_CAPABILITY_CALL_ROUTE,
    CMS_CAPABILITY_QUERY_ROUTE,
    gatewayRoutePrefix,
} from "cms-gateway/invocation/http/routes";
