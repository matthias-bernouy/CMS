import type { DataShape } from "./DataShape";

/** The HTTP methods an endpoint may declare. Runtime list (single source of truth)
 *  so callers can validate an incoming string against it; `HTTPMethod` is derived. */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;
export type HTTPMethod = typeof HTTP_METHODS[number];

/** Where a request header's value comes from.
 *  - `static`: a plaintext fixed value injected verbatim upstream.
 *  - `secret`: a credential reference (`${KEY}` shape) resolved server-side — NOT
 *    applied until the secret store is wired (the executor returns 500 for it).
 *  - `computed`: a source context value resolved server-side for this request. */
export type HeaderSource =
    | { from: 'static'; value: string }
    | { from: 'secret'; ref: string; prefix?: string }
    | { from: 'computed'; ref: ComputedParamRef };

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

export const COMPUTED_PARAM_REFS = ['userID'] as const;
export type ComputedParamRef = typeof COMPUTED_PARAM_REFS[number];

export type ParamValueSource =
    | { from: 'request' }
    | { from: 'computed'; ref: ComputedParamRef };

/** An input parameter and its location in the upstream request. */
export type EndpointParam = {
    name: string;
    in: ParamIn;
    source?: ParamValueSource;
    required?: boolean;
    description?: string;
    schema: DataShape;
};

/** Descriptive metadata for the editor (listing/display). Not used by the proxy. */
export type SourceMeta = {
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

export type SourceEndpoint = {
    urn: string;            // e.g. "urn:source-id:getUser" (method NOT in the urn)
    method: HTTPMethod;
    targetUrl: string;      // e.g. "https://api.example.com/v1/users/{id}"

    /** Request headers injected into the upstream call. `static` = a plaintext
     *  fixed value forwarded verbatim; `secret` = a credential ref resolved
     *  server-side; `computed` = a source context value resolved per request. */
    headers?: EndpointHeader[];

    meta?: SourceMeta;

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

export type Source = {
    urn: string;            // e.g. "urn:source-id"
    meta?: SourceMeta;
    endpoints: SourceEndpoint[];
};
