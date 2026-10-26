# Official Repository

- Keep releases declarative, immutable and reviewable.
- Publish contracts before manifests or collections that reference them.
- Do not add environment reads, listeners, persistence adapters or runtime code.
- Provider implementations belong outside this directory.
- Generic examples and protocol fixtures belong with the feature that tests them.
- Keep contract metadata in `definition.json`, one capability per recursive
  `capabilities/**/*.json` fragment, and one optional mock per recursive
  `mocks/**/*.json` fragment. A mock declares its owning `capabilityId`; source
  paths never define IDs or affect the compiled release digest.
- Keep specialized contracts as flat sibling directories. Pin their exact
  parent in `definition.json` and author only specialization-specific
  capabilities; inherited capabilities come from that immutable parent chain.
- Keep conformance metadata in `conformance/definition.json`, scenarios below
  `conformance/scenarios/**/*.json`, exemptions below
  `conformance/exemptions/**/*.json`, and optional suite fixture bytes below
  `conformance/fixtures/`. The authoring compiler sorts by declared identities,
  rejects duplicates and admits the assembled suite against the exact contract.
- Split collection administration copy into focused JSON objects below
  `translations/<locale>/`; paths organize authorship and never prefix keys.
- Theme category files may be grouped recursively below `theme/`. Keep their
  filename and internal stable ID equal; `theme/definition.json` owns ordering.
- Collection assets are files below `assets/`; their lowercase relative paths
  are their IDs. Do not duplicate their metadata in the collection definition.
  Use `assets/definition.json` only for resource `deprecations` metadata.
- Split collection texts between recursive `texts/definitions/` metadata and
  `texts/locales/<locale>/` content trees. Group Bloc folders recursively below
  `blocs/`; source paths never contribute to stable text or Bloc IDs.
- Give every official text definition translated `label`, `category` and `group`
  metadata. Organize those metadata translations recursively by product domain;
  never make administration Pages display raw text IDs as their primary
  catalogue labels.
- Keep user-facing copy out of fixed `markup.html` and
  Page `page.html`. Visible text and accessible labels must be a business-data
  binding or an exact `cms.i18n.<collection>.<text>` reference; author reusable
  values in the recursive collection text trees.
- Keep admitted collection exports explicit. Authored sources may use the CLI's
  `"*"` shorthand, but the admitted release must show exactly which public Blocs,
  tokens, texts and assets form its API. Never use wildcard dependency imports.
- Icons are ordinary verified SVG assets referenced from empty
  `<svg cms-svg="{{ cms.asset.<collection>.<path> }}">` elements. Do not restore
  icon-specific JavaScript, raw authored SVG geometry or an icon-only Bloc.
- Every Bloc declares a native `root` contract and Pages identify it with
  `cms-bloc`. A Bloc that owns one Page-authored native child declares it as a
  bounded default slot with `kind: "native-element"`; there is no separate
  `content` contract. All structure is Light DOM; Shadow DOM is forbidden.

- Author collection v1 initial instances under `examples/**/` with
  `definition.json` and `document.html`. Replace `default.html` with an explicit
  `defaultExample` reference. Use existing translations and content text IDs
  for reusable official example copy. Frame dimensions are authored data;
  generated captures stay outside immutable source releases.
