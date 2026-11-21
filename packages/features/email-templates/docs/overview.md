# Email templates

Create a template with a UUID, name, locale and draft. Declare at most 32 variables
of kind `text`, `url` or `date-time`. Use exact `{{name}}` tokens. The subject and
plain-text body are required; HTML is optional. Sources are bounded to 64 KiB
combined. Values are strings, not arbitrary JSON. Unknown/duplicate values and
missing required values refuse rendering. Values are never recursively expanded.

Use the current revision to update, preview or publish. Publications are immutable;
store an exact template ID and version in the consuming feature's configuration.
Publishing a new version never switches consumers. There is no total template or
publication quota. Revision and version counters stop at `Number.MAX_SAFE_INTEGER`
(9,007,199,254,740,991); counter exhaustion refuses before writing. Lists load at
most 100 summaries per page and use an exclusive UUID `after` boundary; they are
not stable snapshots across arrivals.

If publication is interrupted, retry `templates.publish` with the same ID and
expected revision to complete it. Staged content is never readable as a publication.
Until completion, draft updates and archive refuse with `CORE_UNAVAILABLE`.
Reads do not resume writes. Existing committed publications remain available.

Archive blocks edits and new consumer associations. Existing exact publications
remain readable/renderable. Consumers own associations and compatibility checks.
No permanent deletion, mail delivery, recipient selection or public render access
is provided. Values/results must not be copied into diagnostic logs or captures.

HTML allows p, br, h1-h3, strong, em, b, i, u, a, ul, ol, li, blockquote, hr, span
and div. Only `a[href]` attributes are allowed; no CSS, scripts, images or forms.
A dynamic href must consist of one required URL variable. Literal URLs must be HTTP(S).
Preview HTML in an isolated document, never insert it into an administrative DOM.
Queries and natural CAS commands have explicit HTTP and administrator MCP bindings.
After a revision conflict, read again; do not overwrite another author's work.
