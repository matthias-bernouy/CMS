import { createProviderContractRelay as createGenericRelay } from "@bernouy/cms-gateway/provider/server";
import { routeResponse } from "./routeResponse";
import { NOOP_LOGGER } from "@bernouy/logging";
import { localizeFailureResponse } from "../dispatch/errors/response";
export function createProviderContractRelay(...args: Parameters<typeof createGenericRelay>) {
    const [
        routes,
        dispatcher,
        scope,
        logger,
        authorize,
        transform = (request, response, claims, control) =>
            control && claims.contractId === "ulvia.cms.installations" && claims.capabilityId === "gateway.route.get"
                ? routeResponse(request, response)
                : Promise.resolve(response),
    ] = args;
    const logged = createGenericRelay(routes, dispatcher, scope, logger, authorize, transform);
    const quiet = createGenericRelay(routes, dispatcher, scope, NOOP_LOGGER, authorize, transform);
    return async (...invocation: Parameters<typeof logged>) => {
        const response = await (invocation[1].contractId === "ulvia.cms.observability" ? quiet : logged)(...invocation);
        return localizeFailureResponse(response, invocation[0], invocation[1], routes);
    };
}
