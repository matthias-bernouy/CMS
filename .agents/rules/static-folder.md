# Static folder

## Rôle

Le dossier `static/` contient le rendu côté serveur de pages HTML, servi par `serveStaticFolder(runner, template, path)` (cf. `src/serve/serveStaticFolder/`).

Chaque fichier `.html` du dossier devient une route. Les fichiers non-`.html` (images, fonts, etc.) sont servis tels quels, à leur chemin relatif.

## Routage par arborescence

L'URL d'une page correspond à son chemin relatif depuis le dossier `static/`, sans l'extension `.html`. Les fichiers `index.html` mappent au dossier parent.

Exemples :
- `static/index.html` → `/`
- `static/admin/buckets.html` → `/admin/buckets`
- `static/admin/index.html` → `/admin`
- `static/logo.svg` → `/logo.svg` (servi tel quel)

Le préfixe d'URL dépend du `runner` passé à `serveStaticFolder` (par exemple via `runner.group("/admin", ...)`).

## Tokens du template

`serveStaticFolder` prend un `template: string` (le squelette HTML complet : `<!DOCTYPE html>`, `<head>`, etc.). Pour chaque requête :

- `{{CONTENT}}` dans le template est remplacé par le contenu du `.html` matché.
- `{{BASE_PATH}}` est remplacé par `runner.basePath`, **à la fois dans le template et dans le contenu du `.html`**. Toute référence à un asset (`href`, `src`, fetch URL, etc.) doit donc utiliser `{{BASE_PATH}}` plutôt qu'un chemin absolu.

## Règles de contenu

Chaque `.html` ne contient que le fragment injecté dans `{{CONTENT}}` — pas de `<html>`, `<head>` ou `<body>`, ces balises viennent du template.

Pas de JS ni de CSS dans les fichiers de `static/`. Le styling et l'interactivité passent par les composants de `components/` ou par des assets externes référencés via `{{BASE_PATH}}`.

## Webcomponents

`@bernouy/webcomponents` fournit des composants visuels et des composants logiques (`<w13c-fetch>`, `<w13c-form>`, …) qui couvrent fetch et soumission de formulaires de manière déclarative, sans JS.

Voir la documentation de `@bernouy/webcomponents` pour la liste complète.
