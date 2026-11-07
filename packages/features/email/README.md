# Email features

- `base/` publishes `@bernouy/email`: shared Zod message schemas, inferred delivery
  ports and transport-neutral memory/console implementations.
- `smtp/` publishes `@bernouy/email-smtp`: shared Zod configuration schemas,
  inferred administration ports and a secret-backed SMTP implementation.

Both expose data schemas through `./schemas`, operation descriptors through
`./operations`, and contract metadata through `./feature`. Documentation stays in
ordinary `docs/**/*.md` files within each package; the contract declares its directory
as a file URL and compilation discovers the Markdown recursively. Relative paths,
including `.md`, are document IDs; no TypeScript Markdown imports are required.
Nodemailer is available only through `@bernouy/email-smtp/nodemailer`.
Each `src/feature.ts` declares its contract identity, version and operation list.
SMTP explicitly extends the Emailer feature; the build generates the exact parent
pin. Operations declare IDs, access, behavior and HTTP/MCP bindings. The Provider
imports the feature definition and selects its implementation. Folder grouping
grants no inheritance.

Contract IDs, versions, UTF-16 rules and immutable digests remain unchanged by
the directory/package rename. No package aliases for the previous names remain.

Reusable schemas live in `src/schemas/`. Each descriptor lives in its own file
under `src/operations/`; SMTP configuration operations use a `configuration/`
subdirectory. Larger families can group schemas and operations by domain without
changing these roles. Ports infer data types directly from schemas; core services
validate those same schemas. Private storage projections are not public exports.

Operations accept an explicit array of named mocks, including multiple outcomes
for the same input. Mock files can be imported without an owner ID; admission
validates every scenario. There is no mock-directory scan. The first authoring
migration and automatic documentation discovery leave Provider handler adapters
on their existing paths until the next requested stage.
