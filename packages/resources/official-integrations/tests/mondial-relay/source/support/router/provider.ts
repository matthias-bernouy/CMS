import { connectEndpoint, trackingEndpoint } from "../runtime.ts";
import {
    connectShipmentResponse,
    jsonpResponse,
    trackingResponse,
    widgetRelayLookupResponse,
    xmlResponse,
} from "../responses.ts";
import type { RouterContext } from "./types.ts";

export function handleProviderRequest(context: RouterContext): Response | undefined {
    const { method: _method, options, request, requestBody, state, url } = context;
    if (url.origin === "https://widget.mondialrelay.com" && url.pathname.endsWith("/SearchPR")) {
        state.relayLookupUrl = url;
        return jsonpResponse(widgetRelayLookupResponse());
    }
    if (request.url === connectEndpoint) {
        state.connectRequestXml = requestBody;
        state.connectRequestCount += 1;
        state.connectRequestRedirect = request.redirect;
        if (options.connectNetworkError) {
            throw new TypeError("network unavailable");
        }
        if (options.connectRedirect) {
            return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
        }
        const configured = options.connectResponses?.[state.connectRequestCount - 1];
        return xmlResponse(
            connectShipmentResponse(
                configured
                    ? {
                          connectStatusCode: configured.code,
                          connectStatusLevel: configured.level,
                          connectStatusMessage: configured.message,
                      }
                    : options,
            ),
        );
    }
    if (request.url === trackingEndpoint) {
        state.trackingRequestXml = requestBody;
        state.trackingRequestCount += 1;
        state.trackingRequestRedirect = request.redirect;
        if (options.trackingRedirect) {
            return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
        }
        return xmlResponse(trackingResponse(options.trackingEventLabel, options.trackingStatusCode));
    }
    if (
        url.origin === "https://connect-api-sandbox.mondialrelay.com" ||
        url.origin === "https://connect-sandbox.mondialrelay.com"
    ) {
        if (options.labelRedirect) {
            return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
        }
        return new Response("%PDF-1.4 test", {
            status: 200,
            headers: { "content-type": options.labelContentType ?? "application/pdf" },
        });
    }
    return undefined;
}
