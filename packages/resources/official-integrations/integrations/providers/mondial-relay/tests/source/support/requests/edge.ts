import {
    handleSourceRequest,
    sourceEndpointAccessAllows,
    sourceEndpointAccessMode,
    type SourceRepository,
} from "@bernouy/cms-sources";
import { activeEnv, functionsBaseUrl, sourcePrefix, type JsonRecord } from "../runtime.ts";

export async function edgeCreateShipment(
    harness: {
        edgeRequest(request: Request): Promise<Response>;
    },
    body: JsonRecord,
): Promise<Response> {
    return await harness.edgeRequest(
        new Request(`${functionsBaseUrl}/cms-delivery/shipments`, {
            method: "POST",
            headers: {
                authorization: `Bearer ${activeEnv.CMS_DELIVERY_API_KEY}`,
                "content-type": "application/json",
                "x-cms-user-id": "user-123",
            },
            body: JSON.stringify(body),
        }),
    );
}

export async function edgeTracking(
    harness: {
        edgeRequest(request: Request): Promise<Response>;
    },
    expeditionNumber: string,
): Promise<Response> {
    const url = new URL(`${functionsBaseUrl}/cms-delivery/tracking`);
    url.searchParams.set("expeditionNumber", expeditionNumber);
    return await harness.edgeRequest(
        new Request(url, {
            headers: { authorization: `Bearer ${activeEnv.CMS_DELIVERY_API_KEY}` },
        }),
    );
}

export async function sourceRequest(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    endpoint: string,
    options: {
        method: "GET" | "POST";
        userId: string;
        userRole?: string;
        enforceAccess?: boolean;
        responseProjectionMode?: "strict" | "compatibility";
        params?: Record<string, string>;
        body?: JsonRecord;
    },
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}delivery/${endpoint}`);
    for (const [key, value] of Object.entries(options.params ?? {})) {
        url.searchParams.set(key, value);
    }
    return await handleSourceRequest(
        harness.sources,
        new Request(url, {
            method: options.method,
            headers: options.body ? { "content-type": "application/json" } : undefined,
            body: options.body ? JSON.stringify(options.body) : undefined,
        }),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
                authorizeEndpoint: options.enforceAccess
                    ? (endpoint) => {
                          if (!options.userId) {
                              return { authorized: false, status: 401 };
                          }
                          const callerMode =
                              options.userRole === "system"
                                  ? "system"
                                  : options.userRole === "admin"
                                    ? "admin"
                                    : "auth";
                          return sourceEndpointAccessAllows(sourceEndpointAccessMode(endpoint), callerMode)
                              ? true
                              : { authorized: false, status: 403 };
                      }
                    : undefined,
                resolveContext: async () => ({
                    userID: options.userId,
                    userRole: options.userRole ?? "admin",
                }),
                responseProjectionMode: options.responseProjectionMode ?? "strict",
            },
        },
    );
}
