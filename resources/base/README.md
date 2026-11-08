# Base resource sources

These are ordinary authored CMS resources compiled into inert ZIPs. They have no
installed product coordinate, release selection, dependency upgrade or uninstall
lifecycle. `mossa/` owns the shared library and administration Pages; `repository/`
adds the public Repository and account Pages. The CLI chooses these source folders
explicitly and omits Mossa's login Page when composing the Repository profile.

The source format is `ulvia-resource-source/v1`:

- `definition.json` declares the namespace, fallback locale and browser state schemas.
- `blocs/**/<id>/definition.json` uses ordinary Content metadata. `markup.html`,
  optional `style.css`, `bloc.ts`, `runtime/**/*.ts` and `initial.html` stay separate.
- `pages/**/` contains one Page metadata file and its `document.html`.
- `examples/**/` retains reusable authoring documents checked against the same
  Bloc, binding, browser-state and expanded-document rules as Pages.
- `translations/<locale>/**/*.json` supplies static catalogue metadata.
- `texts/definitions/` and `texts/locales/<locale>/` supply ordinary text defaults.
- `theme/definition.json` is an ordinary Content theme source using translation keys.
- `assets/` contains immutable files. Paths identify assets within the namespace.

`@bernouy/resources/build` captures bounded regular files, rejects symbolic entries,
compiles each browser module without executing it, resolves exact capability-output
state references and validates typed state producers. Compilation requires Bun's
`--no-macros` flag. Source import boundaries admit only bundled relative modules and
`@bernouy/content/browser`. ZIP validation rechecks normalized artifacts and references.

`bun run generate:official-bootstrap` emits `resources/<profile>/<locale>.zip` and
`.zip.sha256` under the bootstrap output. `--core-only` retains these ZIPs and omits
legacy collection releases. The image stages the ZIPs but does not ship this authored
folder. Provisioning creates no Pages; a current administrator reviews the exact
archive and browser authority before an explicit one-time copy.

The new sources exclude collection administration Pages and their five dedicated
Blocs. Legacy authored collections remain temporarily in `packages/official-repository`
only while their old API/publication paths are retired; the ZIP compiler does not
admit, install or project those collections. Ordinary asset delivery and final
collection removal are still separate transition work.
