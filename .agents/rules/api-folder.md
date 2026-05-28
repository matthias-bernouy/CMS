L'api folder est un dossier contenant tous les endpoints de l'api REST.
Elle est routée automatiquement par `renderApiFolder` (cf. `src/serve/renderApiFolder/`).
Chaque fichier `.ts` du dossier correspond à un endpoint, selon la convention de nommage `nom.methode.ts` (ex: `media.post.ts` pour un POST sur `/media`).
Il est interdit d'avoir de la logique métier dans les fichiers de `api/`. Ils doivent uniquement appeler les instances exportées par `exports/` pour exécuter la logique.