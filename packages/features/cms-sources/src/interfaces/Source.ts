import type { DataShape } from "./DataShape";

/** The HTTP methods an endpoint may declare. Runtime list (single source of truth)
 *  so callers can validate an incoming string against it; `HTTPMethod` is derived. */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;
export type HTTPMethod = typeof HTTP_METHODS[number];

export const RESPONSE_KINDS = ['json', 'file'] as const;
export type ResponseKind = typeof RESPONSE_KINDS[number];

/** Default and upper bound for one proxied upstream request. Endpoint-specific
 * overrides remain bounded so a declarative source cannot hold CMS workers
 * indefinitely. */
export const DEFAULT_SOURCE_ENDPOINT_TIMEOUT_MS = 15_000;
export const MAX_SOURCE_ENDPOINT_TIMEOUT_MS = 120_000;

export const SOURCE_ENDPOINT_ACCESS_MODES = ['public', 'auth', 'admin', 'system'] as const;
export type SourceEndpointAccessMode = typeof SOURCE_ENDPOINT_ACCESS_MODES[number];

export type SourceEndpointAccess = {
    mode: SourceEndpointAccessMode;
    /** Explicit role allow-list for privileged operator endpoints. When set,
     *  the endpoint must use `admin` mode and callers are matched by role id. */
    roles?: string[];
};

/** Effects declared by an endpoint after a successful response.
 *
 * `invalidatesSchema` means that CMS-derived definitions (sources, overlays and
 * dashboards) must be read again before the admin renders its next state. It
 * deliberately does not invalidate public-site content or database schemas. */
export type SourceEndpointEffects = {
    invalidatesSchema?: true;
    identityBindings?: Array<{
        kind: "user";
        responsePath: string;
    }>;
};

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

export const COMPUTED_PARAM_REFS = ['userID', 'userRole'] as const;
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
    svg?: string;
};

/** One response entry of an endpoint's contract, keyed by HTTP status.
 *  `status` is an HTTP code "100".."599" or the literal "default".
 *  `body` absent → a no-content response (e.g. 204). */
export type EndpointResponse = {
    status: string;
    body?: DataShape;
    /** Additional server-only object fields merged into the body seen by
     * response triggers. They are never serialized to the source caller. */
    triggerBody?: DataShape;
};

export type SourceEndpoint = {
    urn: string;            // e.g. "urn:source-id:getUser" (method NOT in the urn)
    method: HTTPMethod;
    targetUrl: string;      // e.g. "https://api.example.com/v1/users/{id}"
    timeoutMs?: number;     // bounded upstream timeout; defaults to 15 seconds
    access?: SourceEndpointAccess;
    effects?: SourceEndpointEffects;
    responseKind?: ResponseKind;
    mediaType?: string;

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
    identityAuthority?: string;
    meta?: SourceMeta;
    endpoints: SourceEndpoint[];
};
