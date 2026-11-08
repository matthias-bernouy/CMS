# Collection Authoring: Reuse, Ownership And Feedback

Review date: 2026-11-05. Status: proposed work; no CMS or site correction is
implemented by this document. The observations below describe the Quentin
Bernouy reproduction exercise, not a fresh audit of the deployed site.

## Problem And Existing Expectations

The reproduction achieved a useful visual result, but recreated too much of an
existing component system. Visual checks and successful admission did not prove
that the result reused the platform correctly or remained easy to edit.

The expected discovery workflow already exists in
[Working with Ulvia](../../packages/official-repository/contracts/cms.installations/docs/working-with-ulvia.md):
search documentation for the workflow, use `repository.search` to find existing
resources, inspect candidates with `repository.get`, and verify their contracts,
requirements and exports before authoring replacements. Documentation search
finds guidance; Repository search finds reusable resources. Neither is a
substitute for inspecting the candidates and making reuse decisions.

The same guide already assigns editorial content to Pages, reusable structure
to Blocs, assembly to compositions and visual identity to themes. The
[authoring guide](../../packages/official-repository/contracts/cms.authoring/docs/collection-authoring.md)
already recommends suitable official semantic tokens and site theme values.
The agent did not adequately apply these instructions. More documentation alone
will not resolve that failure.

## Observations From The Exercise

- The earlier attempt reportedly produced about 110 Quentin Blocs, including
  55 title Blocs. The reviewed replacement used 20 custom Blocs: an improvement
  in granularity, but component count alone does not establish good design.
- `quentin-editorial` 1.1.1 recreated its visual components and 19 theme tokens
  without importing `ulvia-official` resources. Inspecting the official inventory
  had not resulted in actual reuse.
- Cards and other structures rendered their own CTAs instead of composing a
  common Action. The existing
  [official Mossa Card](../../packages/official-repository/collections/mossa/blocs/items/cards/ulvia--mossa--card/definition.json)
  accepts `ulvia--mossa--action` in its `actions` slot.
- Rejecting raw paint colors worked as intended. A separate custom palette
  still duplicated semantic roles; passing that rule did not prove theme reuse.
- A client portrait and programme PDF were packaged as collection assets.
  These belong to the site's managed files. Collection assets support the
  reusable theme/components: font families, icons and example imagery, rather
  than the editorial media of the site that inspired the collection.
- Header, footer and contact content was repeated across Pages, and a substantial
  CSS preamble was copied between Blocs. This indicates maintenance duplication;
  no network, latency or runtime performance improvement has been measured.
- Internal wrapper parts collided with projected slot names during styling.
  The renderer deliberately adds consumed slot names to projected element parts;
  see [slot projection](../../packages/features/content/src/blocs/core/composition/expandCompositions.ts).
- A patch publication containing interface additions failed as HTTP 503. A
  minor version resolved the refusal. The agent chose the wrong version, while
  the error feedback obscured the actual collection evolution constraint.
- Media upload required a browser fallback because the agent's upload path did
  not provide a convenient authenticated local-file transfer workflow.

## Correct The Site And Collection

These are editorial/refactoring tasks, separate from changes to generic CMS code.

- [ ] Map each custom Bloc to an existing Bloc, composition, justified adaptation
  or genuinely missing structure. Inspect contracts and examples before deciding;
  do not replace 20 Blocs with an arbitrary smaller target.
- [ ] Compose a common Action for compatible CTAs. The Action owns presentation,
  focus and interaction states; the card owns placement; the Page owns label and
  destination. Preserve suitable native link and button semantics.
- [ ] Import appropriate official semantic tokens explicitly. Add local roles or
  aliases only where their meaning justifies them. Set the site's brand values
  at the intended source of truth; an alias in one direction does not recolor
  an official Action that consumes a different token.
- [ ] Decide theme scope before changing shared official values. Current
  [theme CSS](../../packages/features/content/src/theme/core/css.ts) emits root
  declarations; check public Pages and administration consumers. Do not assume
  independent per-surface themes already exist or add that mechanism prematurely.
- [ ] Store the portrait and programme PDF as site files and update Page media
  references through the supported file model. Replacing editorial media must
  not require a collection publication. Preserve access and download behavior.
- [ ] Reuse existing site compositions or appropriate shared configuration for
  genuinely shared header/footer/contact content. Keep Page-specific data local.
- [ ] Reduce repeated CSS through appropriate composition and ownership, without
  introducing unscoped global styles. Keep internal wrapper part names distinct
  from projected slot parts where selectors would otherwise collide.

Published releases remain immutable. Review resource identities, consumers and
compatible upgrade rules before changing contracts or removing assets. Updating
Page references does not erase media retained in old published artifacts, and
a collection upgrade does not automatically rewrite authored Page HTML.

## Improve The CMS Workflow

### Priority 1: Discovery And A Representative Example

- [ ] Make relevant resource candidates, examples and slot contracts easy to
  inspect during discovery. First evaluate actual search results and ranking;
  do not assume the retrieval engine caused the agent's failure.
- [ ] Establish an authoring review step that records candidates inspected,
  resources reused and the reason for each new resource. A search call alone
  is not evidence of a sound decision.
- [ ] Provide a complete example combining dependency imports, an existing Card
  and Action, semantic theming, editable Page content and site-owned media.
  Extend the existing guides and examples rather than duplicating their rules.

### Priority 1: Precise Errors And Publication Preflight

- [ ] Preserve typed, safe domain refusals across Repository, Provider and MCP
  boundaries, including actionable resource/field/constraint diagnostics.
  Version incompatibility must not appear as service unavailability; genuine
  infrastructure failures must retain their appropriate classification.
- [ ] During preparation, compare the candidate with the authoritative previous
  publication and explain the required version change. Keep the final
  publication check to handle concurrent releases and changed remote state.
  If the previous release cannot be inspected, report incomplete preflight.
- [ ] Preserve existing evolution rules: patch releases change implementations
  only, and incompatible retained resources require new identities. See
  [publication evolution](../../packages/features/repository/src/collections/core/admission/evolution.ts)
  and [authoring preparation/publication](../../packages/features/repository/src/repository/authoring/CollectionAuthoring.ts).

### Priority 2: Architecture Feedback And Provenance

- [ ] Add bounded advisory feedback for likely duplicated CSS, parallel semantic
  tokens and existing reuse candidates. Keep architectural advice separate from
  validity/security checks, with locations, reasoning and alternatives.
- [ ] Do not impose a universal `ulvia-official` dependency, a maximum Bloc count
  or an unreliable similarity rule as a generic admission requirement. Legitimate
  independent collections and specialized components must remain possible.
- [ ] Show token origin, imports, alias chain, effective light/dark values and
  affected consumers. Expose asset ownership clearly as collection or site data;
  do not claim a filename heuristic can determine editorial ownership reliably.
- [ ] Document slot-to-part projection and consider targeted collision advice.
  Preserve established rendering semantics instead of silently changing them.
- [ ] Improve shared-content discovery using existing site composition features
  before proposing another shared-content mechanism.

### Priority 2: Upload And Preview Ergonomics

- [ ] Provide an authenticated client-side local-file upload helper with bounded
  streaming, concurrency, cancellation and cleanup. Keep credentials protected;
  avoid base64 bundles or making a remote server read a local filesystem path.
- [ ] Return clear preview information, including whether administrator access
  is required. Preserve the intentional authenticated draft rendering at the
  ordinary Page path; do not invent a public draft route as a workaround.

## Required Workflow For The Next Reproduction

1. Inventory source patterns, editable content and assets. Read the applicable
   documentation and inspect installed and Repository candidates with examples.
2. Record a reuse/composition/new-resource map, theme roles and asset ownership
   before generating the full collection. Reuse, compose, adapt, then create.
3. Build one representative slice: Hero, card, shared Action, theme and site
   image. Check desktop/mobile rendering, semantics and editing before scaling.
4. Verify that a theme change reaches intended consumers, a CTA label/URL can
   change without publication, and an image/PDF can be replaced as site content.
   Verify shared contact edits propagate and repeated cards can be added or
   reordered without changing a collection contract.
5. Prepare with precise diagnostics and evolution preflight, review the exact
   artifact, publish/install explicitly, then read back and check the result.
6. Review architecture as well as appearance, links, metadata, accessibility and
   relevant light/dark/interaction states. Report missing evidence explicitly.

## Expected Outcome And Completion Evidence

This plan should address the observed duplication, misplaced assets and costly
routine edits. Better diagnostics should also shorten failed publication loops.
It cannot guarantee correct design: agents must apply the existing instructions,
and custom components remain necessary where existing contracts do not fit.

Completion requires a documented reuse decision for each new resource, passing
editing scenarios above, correct site-media ownership and reviewed theme effects.
CMS changes need focused refusal/compatibility tests and proportionate resource
bounds evidence, plus the workspace validation required by `AGENTS.md`. Compare
CSS/artifact bytes before claiming size savings; measure runtime effects before
claiming performance improvements. Existing visual checks do not certify this
proposed refactoring. See also the [agent authoring guide](../development/agent-authoring.md).
