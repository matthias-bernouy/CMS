/**
 * Subset of OpenAPI 3.x types used by the CMS resolver. We deliberately
 * keep the structure close to the raw spec — `parseSpec` validates the
 * shape but doesn't transform it. Projections live in the resolver layer
 * (R2+) where they pick the fields they need.
 *
 * `JSONSchema` carries `$ref` as a sibling of the regular keywords. The
 * caller (the resolver, not this layer) is responsible for resolving
 * refs when it needs concrete shapes.
 */

export type ParsedSpec = {
    info:    { title: string; version: string };
    paths:   Record<string, PathItem>;
    /** Base URLs declared by the spec. OpenAPI 3.x lists them at the
     *  root; Swagger 2.0 inputs are normalised by `swagger2to3` from
     *  `schemes`+`host`+`basePath`. Empty when the spec doesn't carry
     *  any. */
    servers: { url: string }[];
    components: { schemas: Record<string, JSONSchema> };
};

export type HttpMethod = "get" | "post" | "put" | "delete" | "patch" | "head" | "options";

export type PathItem = {
    parameters?: Parameter[];
} & Partial<Record<HttpMethod, Operation>>;

export type Operation = {
    operationId?: string;
    summary?:     string;
    description?: string;
    tags?:        string[];
    parameters?:  Parameter[];
    requestBody?: RequestBody;
    responses?:   Record<string, OAResponse>;
};

export type Parameter = {
    name:         string;
    in:           "path" | "query" | "header" | "cookie";
    required?:    boolean;
    description?: string;
    schema?:      JSONSchema;
};

export type RequestBody = {
    description?: string;
    required?:    boolean;
    content?:     Record<string, MediaType>;
};

export type OAResponse = {
    description?: string;
    content?:     Record<string, MediaType>;
};

export type MediaType = {
    schema?:  JSONSchema;
    example?: unknown;
};

export type JSONSchema = {
    $ref?:        string;
    type?:        "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
    format?:      string;
    properties?:  Record<string, JSONSchema>;
    items?:       JSONSchema;
    required?:    string[];
    enum?:        unknown[];
    description?: string;
    nullable?:    boolean;
    allOf?:       JSONSchema[];
    anyOf?:       JSONSchema[];
    oneOf?:       JSONSchema[];
};

// ── Resolver projections ──

export type SlimEndpoint = {
    /** "METHOD path", e.g. "GET /api/users/{id}". Stable id used by the picker. */
    id:      string;
    method:  string;
    path:    string;
    summary: string;
    tags:    string[];
};

export type ResolvedParameter = {
    name:        string;
    type:        string;
    required:    boolean;
    description: string;
};

export type ResolvedRequestBody = {
    description: string;
    required:    boolean;
    contentType: string;
    schema:      JSONSchema | null;
};

export type FullEndpoint = SlimEndpoint & {
    description:    string;
    pathParams:     ResolvedParameter[];
    queryParams:    ResolvedParameter[];
    headerParams:   ResolvedParameter[];
    requestBody:    ResolvedRequestBody | null;
    responseSchema: JSONSchema | null;
};

/** A single response declared by an operation, ready for mockup-creation UI. */
export type ResponseChoice = {
    status:      string;
    description: string;
    /** JSON-stringified body — `example` if the spec carries one, otherwise a stub from the schema. */
    defaultBody: string;
    /** Dereferenced JSON schema for the response body, when declared. The
     *  client-side structured editor renders fields from this; absence
     *  forces the editor into raw-text fallback. */
    schema:      JSONSchema | null;
};
