# Static folder

## Rôle

Le dossier `static/` contient le rendu côté serveur de pages HTML, servi par `serveStaticFolder(runner, options)` (cf. `packages/surfaces/cms-control/src/core/registerEndpoints/serveStaticFolder/`).

Chaque fichier `.html` routable du dossier devient une route. Les fichiers non-`.html` (images, fonts, etc.) sont servis tels quels, à leur chemin relatif.

Exceptions :
- les fichiers `_template.html` sont des wrappers de rendu, pas des routes ;
- une surface peut réserver certains documents pleine-page (`login.html`, `forbidden.html`, …) et les rendre explicitement hors du scan statique, par exemple quand une page doit être publique alors que le reste du dossier est gardé.

## Routage par arborescence

L'URL d'une page correspond à son chemin relatif depuis le dossier `static/`, sans l'extension `.html`. Les fichiers `index.html` mappent au dossier parent.

Exemples :
- `static/index.html` → `/`
- `static/admin/buckets.html` → `/admin/buckets`
- `static/admin/index.html` → `/admin`
- `static/logo.svg` → `/logo.svg` (servi tel quel)

Le préfixe d'URL dépend du `runner` passé à `serveStaticFolder` (par exemple via `runner.group("/admin", ...)`).

## Tokens du template

`serveStaticFolder` prend des options (`cache`, `cspExtras`, …) et enveloppe chaque `.html` routable avec le `_template.html` le plus proche dans l'arborescence. Pour chaque requête :

- `{{CONTENT}}` dans le template est remplacé par le contenu du `.html` matché.
- `{{BASE_PATH}}` est remplacé par `runner.basePath`, **à la fois dans le template et dans le contenu du `.html`**. Toute référence à un asset (`href`, `src`, fetch URL, etc.) doit donc utiliser `{{BASE_PATH}}` plutôt qu'un chemin absolu.

## Règles de contenu

Chaque `.html` routable ne contient que le fragment injecté dans `{{CONTENT}}` — pas de `<html>`, `<head>` ou `<body>`, ces balises viennent du template.

Pas de JS ni de CSS dans les fragments routables de `static/`. Le styling et l'interactivité passent par les custom elements ou par des assets externes référencés via `{{BASE_PATH}}`. Les documents pleine-page réservés rendus explicitement par une surface peuvent porter leur propre squelette HTML.

## Composants UI (`@bernouy/components`)

`@bernouy/components` fournit les custom elements visuels (`<p9r-*>`), les composants logiques `<w13c-*>` (ex. `<w13c-form>`), et le **runtime de data-binding** (`<cms-binding-core>` + `cms-source`/`cms-repeat`/`{{ }}`/`#{}`) — fetch + rendu déclaratifs, sans JS de page. Côté CMS admin, `@bernouy/cms-control` ajoute ses propres tags `<cms-*>` (`<cms-form>`, `<cms-binding-core>`, …).

Voir la documentation de `packages/foundation/components` pour la liste complète.
