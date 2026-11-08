# Provider HTTP Context And Responses

`@bernouy/cms-gateway/provider/server` exposes the generic Fetch-compatible
receiver. It accepts any admitted contract namespace and does not import Content,
Files, Access, production persistence or environment configuration. The official
`@bernouy/ulvia-provider` surface composes that receiver with its CMS adapters.

## Receiving calls

Create a `DefaultProviderCapabilityDispatcher`, register handlers, then pass the
registry and resolved admitted contracts to `createProviderHandler`. Its injected
`authenticate(request)` callback must verify the invocation credential, signed
audience, request ID, exact contract release and capability before returning the
verified claims and host-owned site/provider scope. The host owns listening,
credential storage and runtime reporting. Registration is sealed at construction:
every capability of each declared contract, including inherited capabilities,
requires a handler. Partial implementations are not advertised as full contracts.
An inherited HTTP call can use its declaring parent's exact route; the receiver
dispatches it to the specialization's handler. If several specializations share
that parent, mount the declaring contract explicitly to remove ambiguity.

```ts
dispatcher.register("example/catalog", "items.list", async (input, context) => {
    const language = context.http.headers.get("accept-language");
    return Response.json(await catalog.list(input, language), {
        headers: { "Content-Language": language === "fr" ? "fr" : "en" },
    });
});
```

`context.http.headers` is the canonical per-invocation `Headers` instance.
`context.signal` is live cancellation state. `context.http.transportRequest`
is the technical HTTP invocation. `context.http.resource`, when present, describes
the separate public GET/HEAD and remains present even when its optional `url`
cannot fit the wire budget. In that case, construct a URL from admitted path/query
input and an injected public origin. This preserves the existing input URL budget.
The serializable `requestContext` accessor snapshots
the current canonical headers, including changes made by handler middleware.
Never treat headers, language or the public URL as authentication authority.

The gateway captures `Accept`, `Accept-Language`, conditional validators, `Range`,
`If-Range`, `Cache-Control`, `Pragma` and `Content-Language`. HTTP entrypoint hosts
may declare additional application names with `requestHeaders`; capture helpers
also accept explicit custom names. Credentials, cookies, reserved namespaces and
connection headers cannot be added this way. Technical `Content-Type` and
`Content-Length` describe the body produced by the binding, not the browser body.
Compression negotiation belongs to each HTTP connection.

The serializable context is validated before route lookup: up to 32 headers,
4,096 characters per value, 12 KiB aggregate header data, and an 8 KiB encoded
wire envelope. Unknown root fields, control characters and reserved names fail
closed. Binary bodies and cancellation signals stay outside this JSON snapshot.

## Returning resources

A synchronous query with `output: { type: "binary", resource: true, ... }` can
return a normal `Response`. Its status and approved headers become the public
resource metadata; the internal capability response retains its admitted status
and media type. The SDK performs this conversion without consuming the stream.

```ts
return new Response(body, {
    headers: {
        "Content-Type": "text/html; charset=utf-8",
        ETag: '"page-42"',
        "Cache-Control": "no-store, no-transform",
    },
});
```

For cache dependencies, `resourceResponse(response, { cacheTags, vary })` wraps
that same response. Metadata remains bounded and validated. Typed
`ProviderBinaryResult` outcomes also remain supported. Structured `Response`
outcomes require bounded JSON, a declared status and schema-valid output;
declared error outputs are projected and validated against the selected release.
An added `output: { message: string }` is a minor contract change. Calls selecting
an older release receive only its declared fields, or no details when it declares
no error output. Missing required fields, invalid values and unknown error codes
remain invalid Provider responses. The same rules apply to protocol-neutral calls.

Every declared error in the official 1.0.0 baseline requires
`output: { message: string }`, bounded to 2,048 characters. The official surface
chooses French or English from `Accept-Language`, including regional preferences
and quality weights, and falls back to English. These preferences are independent
of the site’s configured content languages. The response carries `Content-Language`.
Providers using the generic SDK choose their own messages and supported languages.
Consumers must branch on the stable error code, never on the message text.
`ProviderCapabilityDispatchError` accepts an optional sixth `reason` argument:
a lowercase diagnostic identifier of at most 128 characters, using dot,
underscore or hyphen separators. It appears in Provider refusal logs, not in
the capability's wire output. Official adapters supply known business reasons
and omit their parameters from diagnostic logs. Asynchronous failure observers
receive the same identifier after error-output projection.
Explicit handler error outputs remain authoritative: the SDK projects their
fields through the selected schema, without replacing their message or language.
Set `Content-Language` when supplying a translated message. Without an explicit
output, the official surface supplies its catalogue message. Incomplete or
invalid explicit details still produce a technical failure.
Known domain reasons supply specific messages (for example, multiple H1 headings);
other declared failures use a safe message for their code. Unexpected technical
exceptions remain logged and produce a generic service-unavailable message. This header survives declared HTTP errors; no
`language` field is required in the error output. HEAD errors carry the code and
safe headers without a JSON body, even when the error declares required details.

Schema and transport input refusals use HTTP 400 (413 for oversized Provider
bodies) and the protocol envelope
`{ failure: { code, retryable: false, output: { message } } }`. The Gateway and
Provider SDK choose French or English from request preferences and return
`Content-Language`; these are distinct from declared capability errors.
Messages can name a schema path, bounded to 256 characters, without exposing
input values or diagnostic text. HEAD refusals retain headers with no body.
Provider clients retain this explanation and safe headers with an 8 KiB bounded
failure reader; the message itself remains limited to 2,048 characters.

A synchronous query can return `new Response(null, { status: 304, headers })`
when the caller supplied `If-None-Match` or `If-Modified-Since`. The HTTP adapter
represents this as `kind: "not-modified"`, with no fabricated business output.
The browser receives 304; the provider client receives `notModified: true`.
Unsolicited 304, commands and operation handles cannot use this outcome. Other
3xx transport responses remain forbidden. MCP calls have no HTTP revalidation.

ETag, Last-Modified, Content-Language, Content-Disposition, cache directives,
Expires, Vary, Link, Location, Retry-After and range metadata survive their
appropriate response path. Edge owns cookies, CSP, HTTP security and final
compression. Return unencoded bytes. A transformed body must receive a valid
length and validator for its resulting representation.

## Preconditions and streaming

`evaluateHttpPreconditions(request, { etag, lastModified, exists })` returns
`304`, `412` or `undefined`. A provider implementing writes must call it inside
the same transaction or revision fence as the mutation, before changing state.
Merely forwarding `If-Match` cannot make a storage operation atomic. Contracts
must declare their structured command error/status when exposing such refusals.
Existing domain revision checks remain authoritative.

Use `no-store` for uncached progressive output, and `no-transform` when immediate
chunk delivery must avoid compression or cache accumulation. Cacheable ordinary
responses can be accumulated within the existing entry bound. Unsupported `Vary`
dimensions prevent shared storage. Range, mutation preconditions and explicit
request cache directives bypass shared cache reads. Cache keys include the full
public URL (origin and raw query), language and Accept.

Binary transport forwards chunks with byte limits and backpressure. Cancellation
closes upstream reads. First-byte and inactivity deadlines remain configured by
the transport host. `Transfer-Encoding` is never copied between connections.
There is no separate streaming Accept value. The Content HTML renderer still
builds complete documents; progressive rendering and first-class SSE reconnection
are separate work.

Queries may stop when their caller leaves. Dispatched commands retain unknown
outcome handling, and accepted durable operations keep running. Durable storage
contains a JSON snapshot of request metadata, never Request, Headers, streams or
AbortSignal objects. Workers receive their lease signal. Preconditions and custom
execution headers participate in replay identity; presentation/cache preferences
do not. A replay returns the original operation rather than re-running a write.

Operation input digests use a versioned, domain-separated envelope. Persisted replay digests are compared directly; the baseline has no legacy record reader.
`ProviderClientError` retains a declared error's `output` and safe response
headers. Durable operation registration can receive the capability's error
definitions as its fourth argument; error details are projected, schema checked and stored
as `errorOutput`, with a 64 KiB JSON bound. An operation-detail capability must
declare and project those details in its own output schema. The official runtime supplies admitted contracts to the executor, which resolves
error schemas by exact contract version before storing failures. The official
Installations `get-operation` output exposes `errorOutput.message`. Its
`Content-Language` reflects the actual language saved with the failure, including
explicit languages supplied by a handler. This language is persisted separately
from the public error output, so a replay or later read requesting another
language keeps the original explanation. Listing operations retains the compact
error code without the detailed message.

Headers mapped to business inputs are produced exclusively from validated input,
including when an optional property is omitted. Common HTTP metadata cannot fill
those properties through the Provider's binding decoder. Invalid caller metadata
is refused with HTTP 400 before dispatch. Fresh shared entries can answer date
and ETag revalidation locally, with ETags taking precedence over dates.
Native 304 responses need no Content-Type; absent representation policy leaves
the browser's stored policy unchanged. Configured asynchronous error schemas also
validate missing outputs, rather than accepting an incomplete declared failure.

## Official baseline

Official contracts and the Provider manifest are generated from SDK features.
Current system profiles are `1.3.0`, the manifest and Installations are `1.2.0`,
Registry is `1.1.0`, and the remaining contracts are `1.0.0`. No administration
collection is bundled. For native delivery, Content exposes
`delivery.resolve-resource`, carrying path/method/query as business input and
HTTP metadata through the common context. Edge follows exact parent pins and
invokes the declaring contract. There is no historical Delivery fallback or
resource-metadata input opt-in.

This development baseline requires fresh Repository catalogues and instance data.
It does not overwrite existing immutable coordinates or delete persisted data.
Future releases follow the [capability lifecycle](../architecture/capability-lifecycle.md).
