# Bloc Collection API

The Collections workspace is the authoring shell for reusable Blocs. During the
provider transition it exposes two collection kinds:

- private site collections containing editable compositions;
- one code collection containing compiled, read-only Blocs.

Provider-backed collections, catalogue discovery, installation, upgrades, and
per-resource availability are intentionally absent until the contract and
provider protocol owns them.

## Library projection

`GET <basePath>/api/bloc/library` accepts these optional query parameters:

| Parameter | Meaning |
| --- | --- |
| `collection` | `site:<id>` or `code` |
| `search` | Case-insensitive text search |
| `category` | Exact Bloc editor category |
| `visibility` | Site: `draft`, `published`, `archived`; code: `available`, `hidden` |
| `bloc` | A Bloc tag within the selected collection |

The response includes the collection navigation, filtered Blocs, category
groups, counts, empty-state copy, and optional selected Bloc metadata. Unknown
collections and Blocs outside the selected collection return 404.

Site compositions are editable. Code Blocs remain readable and previewable but
are maintained through code or the CLI.

## Private collections

`GET <basePath>/api/bloc/collections` returns private collections, including the
virtual default **Site** collection. Existing compositions without explicit
membership belong to that default.

`POST <basePath>/api/bloc/collections` accepts
`{ name, description?, icon? }`. `PUT` on the same endpoint with `?id=<id>`
updates metadata without changing membership. Supported icons are `folder`,
`layers`, `grid`, `layout`, `star`, and `code`.

`POST <basePath>/api/site-bloc` accepts
`{ name, description?, group?, collectionId?, tag? }` and creates an editable
composition. Omitting `collectionId` uses **Site**; an unknown explicit ID is
rejected.

## Workspace routes

The admin entry point is `<basePath>/admin/collections`. Collection sections
use the encoded collection key in stable routes:

- `<basePath>/admin/collections/<collection>/overview`;
- `<basePath>/admin/collections/<collection>/theme`;
- `<basePath>/admin/collections/<collection>/blocs`;
- `<basePath>/admin/collections/<collection>/texts`.

`GET <basePath>/api/collections/workspace` supplies the landing page,
collection navigation, overview, theme projection, grouped Bloc detail, and
the Texts route shell. Text persistence remains deferred. Theme resolution and
editing use the current content theme contract; provider-owned theme contracts
will replace that boundary later.
