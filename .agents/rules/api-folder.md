L'api folder est un dossier contenant tous les endpoints de l'api REST.
Elle est routée automatiquement par `serveApiFolder` (cf. `@bernouy/core`, `packages/core/src/serve/serveApiFolder.ts`).
Chaque fichier `.ts` du dossier correspond à un endpoint, selon la convention de nommage `nom.methode.ts` (ex: `media.post.ts` pour un POST sur `/media`).

Routage du nom de fichier vers l'URL (via `deriveRoute`) :
- `dir/file.get.ts` → `/dir/file`
- `dir/dir.get.ts`  → `/dir` (le nom de fichier = parent → on collapse)
- `name.get.ts` (à plat) → `/name`
- les fichiers préfixés par `_` (ex: `_helper.ts`) sont ignorés — réservés aux helpers internes partagés entre endpoints voisins.

Deux fichiers qui déclarent la même paire `METHOD route` font échouer le boot (fail-fast) — jamais de shadowing silencieux.

Il est interdit d'avoir de la logique métier dans les fichiers de `api/`. Ils doivent uniquement appeler les instances exportées par `exports/` (le composition root) pour exécuter la logique.
</content>
