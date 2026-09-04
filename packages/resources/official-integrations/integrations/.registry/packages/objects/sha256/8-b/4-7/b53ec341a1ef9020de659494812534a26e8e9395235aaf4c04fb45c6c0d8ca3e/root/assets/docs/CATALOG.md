# Documentation Blocs Catalog

## Theme contract

Documentation Blocs depends on `basic-blocs@^1.0.0`. Its theme defaults inherit
the Basic Blocs brand, surface, typography, shape, shadow, and feedback tokens.
The integration adds only documentation-specific controls for the navigation
shell, code and terminal surfaces, HTTP methods, and callouts.

## API reference

| Tag | Purpose |
| --- | --- |
| `doc-api-endpoint` | Present an HTTP method, path, and endpoint description. |
| `doc-api-params` | Group API properties in a responsive parameter table. |
| `doc-api-property` | Describe one property, its type, requirement, and details. |

## Code and technical content

| Tag | Purpose |
| --- | --- |
| `doc-code-block` | Present multiline code with language, filename, and copy controls. |
| `doc-code-diff` | Compare code before and after a change. |
| `doc-code-inline` | Present a short inline code fragment. |
| `doc-code-kbd` | Present a key or keyboard shortcut. |
| `doc-code-tabs` | Switch between related code examples. |
| `doc-code-terminal` | Present terminal input and output. |
| `doc-math` | Preserve inline or block mathematical source. |
| `doc-mermaid` | Preserve Mermaid diagram source and theme metadata. |

## Explanatory content

| Tag | Purpose |
| --- | --- |
| `doc-callout` | Highlight notes, information, tips, warnings, or danger. |
| `doc-embed` | Embed externally hosted media or tools. |
| `doc-figure` | Pair an image with a caption and optional zoom. |
| `doc-glossary-term` | Explain a term in place with a tooltip. |
| `doc-step` | Represent one instruction in a procedure. |
| `doc-steps` | Compose a numbered procedure from `doc-step` children. |

## Navigation

| Tag | Purpose |
| --- | --- |
| `doc-anchor-heading` | Give a heading a stable permalink. |
| `doc-breadcrumb` | Show the current page hierarchy. |
| `doc-layout` | Compose the documentation top bar, sidebar, and main content. |
| `doc-prev-next` | Link to the previous and next pages. |
| `doc-sidebar-link` | Link to a page and mark the current location. |
| `doc-sidebar-section` | Group related sidebar links. |
| `doc-toc` | Build a table of contents from page headings. |
| `doc-version` | Switch between documentation versions. |

## Page utilities

| Tag | Purpose |
| --- | --- |
| `doc-edit-link` | Link to the page source in a repository. |
| `doc-feedback` | Collect a helpful or not-helpful answer. |
| `doc-search` | Capture documentation search input. |
| `doc-updated` | Present a localized last-updated date. |
