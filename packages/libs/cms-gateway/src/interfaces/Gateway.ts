import type { DataShape } from "./DataShape";

/** The HTTP methods an endpoint may declare. Runtime list (single source of truth)
 *  so callers can validate an incoming string against it; `HTTPMethod` is derived. */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;
export type HTTPMethod = typeof HTTP_METHODS[number];

/** Where a rule's value comes from. */
export type EndpointRuleSource =
    | { from: 'static'; value: string }   // ex: "2024-01"
    | { from: 'secret'; ref: string }     // ex: ${STRIPE_KEY} → app credential
    | { from: 'userId' };                 // identity of the current CMS user

/**
 * Outbound injection rules, composable, applied in order.
 * At step 0 (no auth) NONE are applied — this is the pluggable seam.
 * A rule `from: 'userId'` will require an authenticated CMS session (validated
 * when the rules are wired up).
 */
export type EndpointRule =
    | { place: 'bearer';                                       source: EndpointRuleSource }
    | { place: 'header'; name: string;                         source: EndpointRuleSource }
    | { place: 'query';  param: string;                        source: EndpointRuleSource }
    | { place: 'jwt'; header?: string; audience?: string; signingKeyRef: string; source: EndpointRuleSource };

/** An input parameter and its location in the upstream request. */
export type EndpointParam = {
    name: string;
    in: 'path' | 'query' | 'header';   // 'path' → templated into `targetUrl` as {name}
    required?: boolean;
    description?: string;
    schema: DataShape;
};

/** Descriptive metadata for the editor (listing/display). Not used by the proxy. */
export type GatewayMeta = {
    name: string;
    description?: string;
    icon?: string;
};

/** One response entry of an endpoint's contract, keyed by HTTP status.
 *  `status` is an HTTP code "100".."599" OR the literal "default" (OpenAPI
 *  fallback). `body` absent → a no-content response (e.g. 204). */
export type EndpointResponse = {
    status: string;
    body?: DataShape;
};

export type Endpoint = {
    urn: string;            // ex: "urn:provider-id:getUser" (method NOT in the urn)
    method: HTTPMethod;
    targetUrl: string;      // ex: "https://api.example.com/v1/users/{id}"
    rules: EndpointRule[];  // step 0: [] (none applied)

    meta?: GatewayMeta;

    /** Request contract: drives the editor form AND the construction of the upstream call. */
    input?: {
        params?: EndpointParam[];
        body?: DataShape;
    };

    /** Response contract: a per-status list. Each entry pairs an HTTP status with
     *  an optional body `DataShape` — drives field binding on the editor side
     *  (flattenScalars) and documents the no-content statuses. */
    output?: EndpointResponse[];
};

export type Provider = {
    urn: string;            // ex: "urn:provider-id"
    meta?: GatewayMeta;
    endpoints: Endpoint[];
};
