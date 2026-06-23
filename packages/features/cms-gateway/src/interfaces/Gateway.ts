import type { DataShape } from "./DataShape";

/** The HTTP methods an endpoint may declare. Runtime list (single source of truth)
 *  so callers can validate an incoming string against it; `HTTPMethod` is derived. */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;
export type HTTPMethod = typeof HTTP_METHODS[number];

/** Where a request header's value comes from.
 *  - `static`: a plaintext fixed value injected verbatim upstream.
 *  - `secret`: a credential reference (`${KEY}` shape) resolved server-side — NOT
 *    applied until the secret store is wired (the executor returns 500 for it). */
export type HeaderSource =
    | { from: 'static'; value: string }
    | { from: 'secret'; ref: string };

/** A request header injected into the upstream call. `name` is an RFC 7230 token. */
export type EndpointHeader = {
    name: string;
    source: HeaderSource;
};

/** Where an input param goes in the upstream request. Runtime list (single source
 *  of truth) so callers can validate an incoming string against it; `ParamIn` is
 *  derived. `'path'` → templated into `targetUrl` as `{name}`. */
export const PARAM_INS = ['path', 'query', 'header'] as const;
export type ParamIn = typeof PARAM_INS[number];

/** An input parameter and its location in the upstream request. */
export type EndpointParam = {
    name: string;
    in: ParamIn;
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
    urn: string;            // e.g. "urn:provider-id:getUser" (method NOT in the urn)
    method: HTTPMethod;
    targetUrl: string;      // e.g. "https://api.example.com/v1/users/{id}"

    /** Request headers injected into the upstream call. `static` = a plaintext
     *  fixed value forwarded verbatim; `secret` = a credential ref resolved
     *  server-side (NOT applied until the secret store is wired → executor 500). */
    headers?: EndpointHeader[];

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
    urn: string;            // e.g. "urn:provider-id"
    meta?: GatewayMeta;
    endpoints: Endpoint[];
};
