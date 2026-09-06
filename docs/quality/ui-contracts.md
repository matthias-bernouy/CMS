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
| `source-automatic-method` | WARNING | An automatic source performs GET even when a different method is declared. |
| `source-trigger-target` | WARNING | An event-triggered non-form declares a non-GET method, but only a native form can submit that method. |
| `source-automatic-mutation` | ERROR | An automatic source targets a proven mutating GET endpoint (currently Control logout only). |
| `source-publish-reload-loop` | ERROR | A submitted form reloads on an event its own success emits, causing another submission. |
| `source-body-contract` | WARNING | A static `cms-source-body` contains descriptors the runtime ignores. |

Binding owns ordinary UI data loading, source parameters, loading/error state,
submission, and reload coordination. Components retain local interaction such as
focus, selection, drag-and-drop, and rendering third-party canvases. A chart or
file input does not automatically need its own HTTP client: sources support
cancellation and submissions support multipart forms and nested field paths.

The ownership rule is a **CMS application policy**, not a restriction of the
foundation engine. The engine supports isolated nested cores; that capability and
its tests remain valid. Current Dashboard component cores are reported because
they are component scopes inside an existing document. Dynamic widget mounting
is also a refactoring target; it does not justify a private core.

## Component composition and styles

A custom element may own and compose children in **light DOM**. Those children
remain discoverable by the existing document core, so their `cms-source`,
`cms-repeat`, and `cms-condition` bindings are valid. The markup does not all
have to be inlined into the page file. Reusable component composition is an
accepted architecture; being a custom element is not a binding boundary.

Light-DOM composition components must not inject their own CSS into the
document: no component `<style>`, stylesheet link, document-level adopted
stylesheet, or imperative inline styling to recreate their presentation. They
use official components and the admin's centrally owned shared styles and
theme tokens. Prefixing selectors does not turn an injected stylesheet into
encapsulated CSS or make it acceptable under this policy.

Visual components may encapsulate their internal structure and CSS in Shadow
DOM and expose slots for light-DOM content. Slotted content remains light DOM.
Keep document-owned bindings there: the binding discovery code walks ordinary
DOM descendants and does not enter a component's shadow root. Do not move
those bindings behind Shadow DOM and add a private core to reactivate them.

For Dashboard widgets, first use declarative repetition and conditional
templates for the known widget types. Runtime data does not by itself require
an imperative renderer. Recursive sections/tabs need an explicit composition
strategy; assess that concrete requirement before adding a narrowly scoped
extension. Do not use serialized JSON attributes and observers as a parallel
data-passing mechanism between controllers and widgets.

These composition and CSS rules guide review. The current scanner checks core
creation, but does not prove light/shadow placement or detect every stylesheet
injection or JSON handoff. Negative fixtures verify that valid light-DOM
composition and encapsulated visual components are not rejected by the core
ownership check.

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
files, and the generated Control components bundle. All HTML is checked as
markup; executable inline scripts are treated as browser code.

Browser script entrypoints are Control components, foundation visual components
and binding, editor-system-v2 components, `*.client.*`, and resource `Bloc.ts` /
`BlocEditor.ts` files. Static imports are followed through workspace aliases and
package exports, including helpers outside component directories. This is import
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
- Trigger checks use real native-form runtime semantics. A declared POST on an
  automatic source is an ignored method, not proof that POST executed.
- This version does not validate all endpoint methods, source schemas,
  interpolation, boolean attributes, official component usage, or CSS styles.
  It does not ban `innerHTML`, `createElement`, native controls, or local events.

See the [initial reviewed inventory](./ui-contracts-audit-2026-09-06.md) for exact
locations and the reasoning behind each migration candidate or exception
candidate. Re-run the scanner for current counts.
