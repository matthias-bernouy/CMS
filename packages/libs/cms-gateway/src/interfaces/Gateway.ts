import type { DataShape } from "./DataShape";

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

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

    /** Response contract: drives field binding on the editor side (flattenScalars). */
    output?: DataShape;
};

export type Provider = {
    urn: string;            // ex: "urn:provider-id"
    meta?: GatewayMeta;
    endpoints: Endpoint[];
};
