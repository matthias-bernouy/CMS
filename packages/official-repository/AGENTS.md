# Official Repository

- Keep releases declarative, immutable and reviewable.
- Publish contracts before manifests or collections that reference them.
- Do not add environment reads, listeners, persistence adapters or runtime code.
- Provider implementations belong outside this directory.
- Generic examples and protocol fixtures belong with the feature that tests them.
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
