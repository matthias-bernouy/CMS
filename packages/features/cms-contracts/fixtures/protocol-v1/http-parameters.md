# Protocol v1 HTTP scalar parameters

Path, query and application-header parameters use the single `json-percent`
encoding. Every compiled parameter declares this encoding; providers must not
substitute ordinary raw-string or form-urlencoded conventions.

1. Validate the scalar against its selected release schema.
2. Serialize it as canonical I-JSON scalar text, retaining quotes around strings.
3. Apply `encodeURIComponent` to that text. The wire value is ASCII.
4. On receipt, percent-decode exactly once, parse one strict JSON scalar, and
   validate it against the same schema and interoperable I-JSON value rules.

`encodeHttpParameter(schema, value)` and `decodeHttpParameter(schema, value)`
are pure helpers exported by `@bernouy/cms-contracts/bindings`. They do not send
requests or construct URLs. The decoder expects the **raw encoded component**,
before a framework or query parser has already decoded it. Adapters must avoid
automatic second decoding, converting `+` into a space, or percent-encoding an
already encoded value again. Each mapped parameter occurs at most once; reject
duplicate wire occurrences rather than choosing one or joining them.

| Logical value | Wire value |
| --- | --- |
| `undefined` | parameter omitted |
| `null` | `null` |
| `""` | `%22%22` |
| `"null"` | `%22null%22` |
| `"café"` | `%22caf%C3%A9%22` |
| `"a/b"` | `%22a%2Fb%22` |
| `"%2F"` | `%22%252F%22` |
| `true` | `true` |
| `42` | `42` |

An empty string therefore occupies a non-empty encoded path segment. `null`
requires a nullable schema. Omission is distinct from null and is allowed only
for an optional input property; the complete input validator enforces this.
Path properties remain required and non-nullable. Malformed UTF-8 or percent
escapes, non-scalar JSON, isolated Unicode surrogates, non-finite numbers, and
unsafe integral numbers are rejected. Decoder work is bounded by a wire-length
ceiling derived from the schema, before percent-decoding or JSON parsing.

Strings containing line breaks are JSON-escaped and percent-encoded; their
wire representation contains no raw carriage return, line feed or Unicode.
Headers use this same encoding, not a separate quoting convention.

## Methods and error envelopes

`GET` and `HEAD` capabilities must be queries and cannot carry request bodies.
The converse does not hold: a query may use `POST` with a JSON body.

For `HEAD`, success output is null and error output is absent or null. No
response body is sent. The compiled response contains:

```ts
errorEnvelope: {
    kind: "headers",
    encoding: "json-percent",
    codeHeader: "x-ulvia-error-code",
    requestIdHeader: "x-ulvia-request-id",
}
```

Every HEAD error carries the stable error code and request ID in these two
reserved headers, both encoded as JSON strings with `json-percent`. A declared
business error code must still match its declared HTTP status. Several codes
may share a status because the code header disambiguates them. These are
protocol-owned response headers, never user-controlled request mappings.

Other methods retain `errorEnvelope: { kind: "json" }`. This metadata describes
the error channel, not a successful operation's final-result representation.
Actual response production, request-ID generation and response-envelope
validation belong to the future HTTP adapter; this package defines the plan.
