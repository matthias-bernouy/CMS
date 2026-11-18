# Editable site reproduction fixture

This self-contained teaching example supports the versioned `site-reproduction.md`
guide in `ulvia/cms.authoring`. It is test data, not a bundled starter or an
installed official collection. Inspect existing live resources before authoring.

- `studio/` is a real authored collection: seven responsibility-based components,
  named slots, translated metadata/UI/examples, preview frames and one generic
  UI glyph. No Cedar business copy, portrait or route is packaged in it.
- `site/compositions.json` holds shared site-owned brand and destinations.
- `site/pages.json` contains three Pages with references to those compositions,
  Page-owned headings, repeated cards and editable image references.

The image URL models the public immutable reference returned after a Files
upload. It is deliberately fixture-only; no live file exists at that address.
Use the selected Files upload/visibility workflow on a real site. The generic
collection glyph is reusable UI; an editorial portrait, PDF, site logo or
favicon belongs in Files and site configuration, regardless of extension.

Run from the workspace root:

```sh
bun run test ./packages/features/repository/tests/collections/installations/content/reproduction
```

The suite compiles/adopts these exact sources, installs them into an isolated
in-memory site and publishes both local compositions. It checks that an edit
in one shared definition reaches all consumers, and that Page title/link/media,
card and section edits preserve the installed collection digest. It also checks
the fixed-heading refusal and the distinction between composition roots and
component slots.

No network, production site, database, agent inference or browser is used. These
are executable model/editor-contract checks, not evidence of visual fidelity,
real Files availability or agent behavior. Follow the guide's rendered review
and public-access checks for a real delivery.

For a separate cold-start agent exercise, provide only a reference site and a
fresh destination, with this repository's ordinary MCP discovery available.
Ask for faithful appearance and editable content without naming this fixture's
components. Review the proposed ownership and boundaries before publication;
then exercise title, destination, media, repeated-card, section-order and shared
navigation edits. Record the agent/model, selected release digests, actual
artifacts and rendered checks. Passing this integration suite is not a result
for that exercise, and seven components is not a target for an arbitrary site.
