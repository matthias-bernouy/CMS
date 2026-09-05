# Integration theme contracts

`ulvia@1.0.0` is the theme-only owner of the shared design-system vocabulary.
It publishes `ulvia-theme@3` and no bloc resource, bloc artifact, or bloc
category. Collections consume that vocabulary and publish only the additional
concepts that are genuinely theirs. Sites choose values and may add local
overrides without becoming dependencies of reusable packages.

## Contract layers

| Owner | Namespace | Stability |
| --- | --- | --- |
| Ulvia | `--ulvia-*` | Shared public contract |
| Collection | `--<kind>-*` | Documented public collection hook |
| Implementation | `--_<kind>-*` | Private; consumers must not depend on it |
| Site | `--site-*` | Local CMS data; never a package requirement |

Examples:

```css
:host {
    --mossa-hero-marketing-background: var(--ulvia-secondary-base);
    --_mossa-hero-marketing-accent: var(--ulvia-primary-base);

    background: var(--mossa-hero-marketing-background);
    color: var(--ulvia-secondary-foreground);
}
```

The collection kind already names the owner, so variables do not use an
additional `--integration-*` prefix. Do not expose generic `--ctx-*` aliases as
a stable API. Private context plumbing is allowed inside one implementation,
but another collection cannot rely on it.

## Resource requirements

A collection resource declares the contract and exact token IDs it consumes:

```json
{
    "theme": {
        "contract": "ulvia-theme@3",
        "required": ["primary-base", "surface-background"],
        "optional": [
            {
                "id": "elevated-shadow",
                "fallback": "0 .5rem 1.5rem rgb(0 0 0 / 12%)"
            }
        ]
    }
}
```

Conformance rejects unknown required tokens and malformed fallbacks. Optional
tokens must remain usable with their declared fallback. A breaking vocabulary
change creates a new contract major; it does not silently change an existing
token's meaning.

The collection definition also declares its Ulvia package dependency. Mossa's
current declaration is:

```json
{
    "dependencies": [
        {
            "kind": "ulvia",
            "versionRange": "^1.0.0"
        }
    ],
    "categories": []
}
```

This is a theme dependency, not a request for Ulvia resources: Ulvia has
none. A future collection can declare the same dependency without installing
or depending on Mossa.

The CMS derives a collection token's CSS name as
`--<collection-kind>-<token-id>`. The theme editor can change values while the
contract name stays stable. New site-created variables are normalized into the
`--site-*` namespace.

## What belongs in Ulvia

Ulvia provides the concepts that several collections are expected to share:

- primary and secondary brand roles;
- info, success, warning, and danger feedback roles;
- page, surface, subtle, text, and border roles;
- body, heading, and monospace typography;
- spacing, widths, radii, shadows, and motion durations.

A collection must use these tokens before adding equivalents. Mossa therefore
inherits the Ulvia palette, feedback roles, surfaces, typography, spacing,
shape, elevation, and motion. Its current structured theme adds no token
category. A Mossa bloc publishes a documented Mossa variable only for a
specialized component decision that Ulvia cannot name usefully.

## Site overrides

A site's logo, favicon, organization data, pages, and visual adjustments are
CMS data. A site may override a public Ulvia or collection hook and may define
local variables:

```css
:root {
    --site-footer-muted-text:
        color-mix(in srgb, var(--ulvia-secondary-foreground) 75%, transparent);
}
```

Collections must not require `--site-footer-muted-text`; only that site owns
it. Keep the number of site overrides small, but prefer a clear local override
to inventing an unstable cross-collection context API.

Free-form site CSS is emitted before active structured theme values. Managed
structured values are therefore authoritative if both layers assign the same
managed variable. New sites must write current `--ulvia-*`, documented
collection hooks, and `--site-*` names directly. The current Ulvia/Mossa clean
break does not provide aliases for legacy variable names.
