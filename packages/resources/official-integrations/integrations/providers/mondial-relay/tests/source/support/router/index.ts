import { expect } from "bun:test";
import { observeFetchRequest, requestFromFetchInput } from "../requests/fetch.ts";
import { supabaseUrl } from "../runtime.ts";
import type { HarnessOptions, HarnessState } from "../state.ts";
import { handleEventClaims } from "./events/claims.ts";
import { handleEventPatches } from "./events/patches.ts";
import { handleEventRecords } from "./events/records.ts";
import { handleLabelRequests } from "./labels.ts";
import { handleProviderRequest } from "./provider.ts";
import { handleRelayRequests } from "./relay.ts";
import { handleSettingsRequests } from "./settings.ts";
import { handleShipmentCancellation } from "./shipments/cancellation.ts";
import { handleShipmentCreation } from "./shipments/creation.ts";
import { handleShipmentReads } from "./shipments/read.ts";
import type { RouterContext } from "./types.ts";

const routeHandlers = [
    handleShipmentCreation,
    handleRelayRequests,
    handleSettingsRequests,
    handleShipmentReads,
    handleShipmentCancellation,
    handleEventRecords,
    handleEventClaims,
    handleEventPatches,
    handleLabelRequests,
];

export function createMockFetch(options: HarnessOptions, state: HarnessState): typeof fetch {
    return (async (input, init) => {
        const request = requestFromFetchInput(input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();
        const requestBody = method === "GET" || method === "HEAD" ? "" : await request.clone().text();
        const observed = observeFetchRequest(request, url, method, requestBody);
        if (url.origin === supabaseUrl) {
            state.postgrestRequests.push(observed);
            state.fetchTimeline.push({ kind: "postgrest", method, pathname: url.pathname });
        } else {
            state.providerRequests.push(observed);
            state.fetchTimeline.push({ kind: "provider", method, pathname: url.pathname });
            state.upstreamRequestUrls.push(request.url);
        }

        const context: RouterContext = { options, state, request, url, method, requestBody };
        const providerResponse = handleProviderRequest(context);
        if (providerResponse) {
            return providerResponse;
        }
        if (url.origin === supabaseUrl) {
            expect(request.headers.get("apikey")).toBe("sb_secret_delivery_test");
            expect(request.headers.get("authorization")).toBeNull();
            expect(request.headers.get("accept-profile")).toBe("delivery");
            if (method !== "GET" && method !== "HEAD") {
                expect(request.headers.get("content-profile")).toBe("delivery");
            }
        }
        for (const handleRoute of routeHandlers) {
            const response = handleRoute(context);
            if (response) {
                return response;
            }
        }
        throw new Error(`unexpected fetch: ${method} ${request.url}`);
    }) as typeof fetch;
}
