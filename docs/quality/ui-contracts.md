# UI contracts

`quality/ui-contracts` checks ownership of binding activation, imperative browser
requests, and statically provable source/form configuration mistakes. It does not
execute the UI or establish visual or end-to-end correctness.

## Run

From the workspace root:

```sh
bun run check:ui-contracts
bun run check:ui-contracts --json
bun run check:ui-contracts --markdown
bun run check:ui-contracts --root /path/to/another/worktree --json
bun test quality/ui-contracts quality/ci/tests/check-all.test.ts
```

`check:all` includes this check. Exit codes are **0** for no errors (warnings and
information may remain), **1** for contract errors, and **2** for an invalid
invocation or failed scan. JSON has `schemaVersion: 1`, scan counts, and findings
with rule, severity, relative file path, one-based line/column, evidence,
explanation, and recommendation. Output is sorted by source location.

An empty or invalid workspace fails instead of reporting a successful audit.
`--root` reads the target worktree without modifying it.

## Policy

| Rule | Level | Meaning |
|---|---|---|
| `binding-core-owner` | ERROR / INFO | Only explicitly declared document producers create a `cms-binding-core`. Known producers remain visible as INFO. |
| `ui.network.http` | WARNING / INFO | Browser HTTP requests require review. Exact documented infrastructure boundaries are INFO. |
| `ui.network.websocket`, `ui.network.eventsource` | INFO | Review connection ownership and lifecycle; ordinary HTTP binding does not replace these protocols. |
| `mutation-form-owner` | ERROR | `cms-mutation` is used outside its native form boundary. Reads use `cms-query`. |
| `mutation-contract` | ERROR | A mutation does not use `contract:capability as alias`. |
| `mutation-input-contract` | ERROR | A static `cms-mutation-input` is not a typed binding input map. |
| `legacy-source-binding` | ERROR | A removed `cms-source*` attribute remains in authored markup. |

`cms-query` owns ordinary UI data loading and refresh state. Native forms own
commands through `cms-mutation`; `cms-sync` connects declared browser state,
query inputs, controls, and producer snapshots. Components retain local interaction such as
focus, selection, drag-and-drop, and rendering third-party canvases. A chart or
file input does not automatically need its own HTTP client: queries support
cancellation and submissions support native binary values and nested field paths.

The ownership rule is a **CMS application policy**, not a restriction of the
foundation engine. The engine supports isolated nested cores; that capability and
its tests remain valid.

## Bloc composition and styles

Collection Blocs render only Light DOM. A native element carries the stable
Bloc identity in `cms-bloc`, so its query, mutation, repeat and condition
bindings remain discoverable by the document core. Optional behavior mounts on
that native root.

Bloc CSS is compiled and scoped by the collection build. Authored behavior must
not inject styles, register custom elements or create Shadow Roots. The
collection validators enforce those rules; this workspace scanner additionally
guards document-core ownership and direct network use.

## Exceptions and review

Document owners are listed with reasons in
`quality/ui-contracts/markup/owners.ts`. HTTP infrastructure boundaries are listed
in `quality/ui-contracts/network/policy.ts`. These are exact paths, not directory
exclusions. A new allowance requires a concrete ownership/transport rationale,
review of every operation in that file, and a regression test. Do not exempt a
shared helper containing both ordinary CRUD and specialized operations.

Warnings are review requests, not confirmed violations. Possible outcomes are:

- Move ordinary reads/forms to binding while keeping local interaction.
- Add a small binding adapter for a demonstrated missing capability.
- Retain a documented provider protocol, editor transaction, or diagnostic
  transport boundary.
- Split a mixed helper before deciding which operations need an exception.

There is no suppressed historical baseline or automatic bulk exemption. Existing
errors remain visible and make `check:all` fail until resolved or explicitly
accepted as a documented document boundary.

## Coverage and limits

Discovery reads production HTML and TypeScript/JavaScript inside real workspace
packages. It excludes dependency/output/test/fixture directories, declaration
files and generated browser bundles. All HTML is checked as markup; executable
inline scripts are treated as browser code.

Browser script entrypoints are collection Bloc behaviors, the binding runtime,
`*.client.*` files and declared application entrypoints. Static imports are
followed through workspace aliases and package exports, including helpers
outside Bloc directories. This is import
reachability, not proof that an exported function executes. It is deliberately
broader than a tree-shaken production bundle.

Markup inspection recognizes HTML start tags and supported TypeScript string /
template expressions returned or passed to HTML-producing sinks. It recognizes
direct element creation and known imported core tag constants. Comments,
selectors, registrations, and raw-text examples are not core creations.

Network inspection uses a TypeScript syntax tree and lexical symbols to recognize
browser globals, stable aliases/destructuring, XMLHttpRequest construction, and
calls through supported imported clients. Comments, string examples, locally
shadowed names, and non-browser server code do not become network warnings.

This first version is intentionally bounded:

- It does not execute templates, reconstruct the final DOM, resolve arbitrary
  computed strings, or analyze full interprocedural data flow.
- It does not detect every SDK, dynamic client wrapper, injected script, or
  request hidden inside an external dependency. New browser entrypoint families
  must be added explicitly; unresolved imports can reduce coverage.
- HTML tokenization handles quotes, comments, raw text, and common entities; it
  is not a full browser HTML parser.
- This version does not validate all endpoint methods, source schemas,
  interpolation, boolean attributes, official component usage, or CSS styles.
  It does not ban `innerHTML`, `createElement`, native controls, or local events.

Re-run the scanner for the current inventory and counts.
