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
- Keep conformance metadata in `conformance/definition.json`, scenarios below
  `conformance/scenarios/**/*.json`, exemptions below
  `conformance/exemptions/**/*.json`, and optional suite fixture bytes below
  `conformance/fixtures/`. The authoring compiler sorts by declared identities,
  rejects duplicates and admits the assembled suite against the exact contract.
- Split collection administration copy into focused JSON objects below
  `translations/<locale>/`; paths organize authorship and never prefix keys.
- Theme category files may be grouped recursively below `theme/`. Keep their
  filename and internal stable ID equal; `theme/definition.json` owns ordering.
- Split collection texts between recursive `texts/definitions/` metadata and
  `texts/locales/<locale>/` content trees. Group Bloc folders recursively below
  `blocs/`; source paths never contribute to stable text or Bloc IDs.
- Keep admitted collection exports explicit. Authored sources may use the CLI's
  `"*"` shorthand, but the admitted release must show exactly which public Blocs,
  tokens, texts and assets form its API. Never use wildcard dependency imports.
- A managed native component declares `nativeElement.accepts`, has exactly one
  unnamed Shadow DOM slot, no named page slots or fixed Light DOM, and one
  accepted native root in `default.html`. Keep wrapper settings separate from
  native child attributes; do not duplicate the selected tag in an `as` setting.
