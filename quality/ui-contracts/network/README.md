# Browser network review

`inspectNetwork(source)` reviews browser script and HTML sources supplied by discovery.
It does not discover browser reachability, traverse imported helpers, execute
code, or inspect server sources. A reachable browser helper is reviewed with
the same policy as its caller; a filename containing `core` is not an exemption.

The TypeScript AST and a file-local symbol table identify direct global
`fetch`, `XMLHttpRequest`, `WebSocket`, and `EventSource` usage, including
`window`, `globalThis`, `self`, static property access, stable variable aliases,
object destructuring and bound fetch functions. Comments and example strings
are not executable syntax. Parameters, local declarations, catch bindings and
local imports shadow global names. Reassigned aliases are conservatively
ignored; this is not control-flow or whole-program analysis.

Known HTTP clients are recognized from exact package imports: `axios`, `ky`,
`ofetch`, `undici`, `node-fetch`, and `cross-fetch`. Findings require an actual
request invocation. Imports, client construction through `create`/`extend`,
and unrelated local objects named after a client do not create findings.
Dynamic property names, CommonJS/dynamic imports, arbitrary object aliases,
global monkey-patching and injected transports are outside this detector.

HTTP usage produces `ui.network.http` warnings recommending declarative
binding where it fits UI loading or submission. Three exact files produce
informational findings instead, with their purpose recorded in `policy.ts`:

- `packages/foundation/components/src/binding/source/fetcher.ts`: binding transport.
- `packages/foundation/components/src/binding/submit/submitRequest.ts`: binding form submission.
- `packages/surfaces/cms-control/src/components/editorSystemV2/documentMutations.ts`: editor document persistence.

WebSocket and EventSource constructors produce separate informational rules
for protocol purpose and connection lifecycle review. They are not presented
as ordinary HTTP binding replacements. Network findings never have ERROR
severity. All locations are one-based and evidence contains the matched call,
not surrounding comments or file contents.

HTML inspection extracts executable inline classic and module scripts, retaining
original file positions. External scripts, non-JavaScript script types, HTML
comments, template contents and raw text elements are ignored. Each inline
script has its own symbol table; cross-script global aliases and shadowing are
not analyzed. The extractor is a bounded tokenizer, not a browser HTML parser.
