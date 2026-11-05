# Verify a page

Use observable checks to decide whether a page-authoring task is complete.

## Recorded state

Read the current page. Compare the actual title, path, content, visibility and requested information with the task. Check references against the installed catalogue. A Provider's structural checks and descriptive refusals are additional evidence, not proof of layout quality.

## Rendered result

When an authorized browser or equivalent rendering tool is available, inspect the actual page at narrow and wide widths. Check legibility, layout overflow, images, headings, empty sections and the main task flow. Test relevant links, buttons and forms without performing unrelated destructive actions. Do not fabricate screenshots or browser results when those tools are unavailable.

## Correction loop

Page creation, content updates and publication return optional `diagnostics`. Each entry has a stable `code`, a `severity` (`error` or `warning`), a message and optional location, related resource IDs and correction suggestion. An error refuses the write; warnings accompany a successful write and its new revision. Do not retry a successful write merely because it contains warnings. `INVALID_PAGE` refusals can include the same diagnostics in their error output.

The official Provider checks expanded Page HTML, including markup supplied by Bloc templates: main landmarks, static IDs and references, interactive nesting and effective destinations. Independent conditions can coexist; explicit match cases are mutually exclusive. Static IDs or main landmarks inside repetition can produce invalid documents. Runtime-generated IDs and destinations are reported as unverified rather than assumed correct.

Missing internal routes and local fragments are advisory while drafting and blocking when publishing or changing published content. Existing draft destinations remain warnings, allowing linked Pages to be published progressively. Valid redirects are accepted. External availability is not probed. Returning a Page to draft remains allowed even when incoming links exist; inspect the accompanying warning.

Correct the Page or the Bloc named by a diagnostic. A template-provided destination must be fixed in its owning resource or exposed as editable content. A draft does not become public because another Page links to it.

Reports contain at most 16 diagnostics. `analysis.truncated`, `page.link_analysis_incomplete` and unverified-fragment diagnostics mean the check is not complete. Effective links are bounded to 256 occurrences; at most 32 target Pages are loaded in a grouped read. Linked-document fragment expansion shares a 50,000-element and 4 MiB character budget. Analysis never recursively crawls their links.

Record concrete problems, edit the current revision and repeat the affected checks. When a change affects shared content or layout, check those dependencies as well. Consult [revision guidance](revisions.md) before retrying a conflicting mutation.

## Completion

Conclude only when the requested result and applicable checks are satisfied, or clearly explain the unresolved limitation. Distinguish recorded-state checks, structural validation, functional checks and visual inspection in the final report. Additional user questions are useful when requirements are missing; they are not a substitute for verification.
