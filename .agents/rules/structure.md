# Convention de Structure : Architecture en couches

Cette architecture s'applique à chaque package du monorepo (`@bernouy/core`, `@bernouy/cms-shared`, `@bernouy/cms-control`, …) et repose sur les contrats de `@bernouy/core`. L'objectif est une séparation stricte entre les contrats (interfaces), la logique (core) et l'infrastructure (default-implementation).

## 1. Responsabilités des Dossiers (Couches)

### 🧱 Contrats et Abstractions
- **interfaces/** : **INTERDICTION d'importer du code exécutable ici.** Contient uniquement des `interface` ou `type` TypeScript. C'est le contrat que le reste du projet doit suivre.
- **types/** : Types globaux ou utilitaires non liés à la logique métier (ex: types de config, helper types).

### ⚙️ Logique et Implémentation
- **core/** : Le cerveau. Contient la logique métier pure.
    - *Règle :* Ne doit jamais importer une implémentation concrète (ex: `MongoAuth`). Il utilise uniquement les interfaces via l'injection.
- **default-implementation/** : Contient les propositions d'implémentations concrètes des interfaces. 
    - *Exemple :* `MemoryMediaStorage.ts`, `MongoMediaStorage.ts`.
- **exports/** : **Le Composition Root.** C'est ici que la magie opère. 
    - On y instancie les implémentations et on les expose. 
    - *Usage :* C'est le point d'entrée unique pour les autres dossiers pour récupérer une instance (ex: `export const auth = new MongoAuth()`).

### 🌐 Entrées / Sorties (I/O)
- **api/** : Routage automatique par fichiers via `serveApiFolder` (`@bernouy/core`).
    - Format : `nom.methode.ts` (ex: `media.post.ts`).
    - *Règle :* Pas de logique métier ici, on appelle uniquement les instances de `exports/`.
- **static/** : Rendu via `serveStaticFolder` (`@bernouy/core`).
    - Fichiers `.html` : Injectés dans `{{CONTENT}}`.
    - *Lien :* Utilise obligatoirement `{{BASE_PATH}}` pour les assets.
- **components/** : Agrégats ou custom elements spécifiques basés sur `@bernouy/cms-blocs`.

---

## 2. Flux de Dépendances (Règles d'Or)

1. **Le sens de la flèche :** `api/` -> `exports/` -> `core/` -> `interfaces/`.
2. **L'instanciation interdite :** On ne doit jamais voir de `new MaClasse()` en dehors de `exports/` ou de `default-implementation/`. 
3. **Double Routage :** Si deux fichiers collapsent vers la même route (ex: `api/user.get.ts` à plat ET `api/user/user.get.ts` qui collapse aussi vers `/user`), `serveApiFolder` échoue au boot (fail-fast). Choisir UNE des deux formes : à plat tant que la ressource tient en un fichier, en dossier dès qu'elle a plusieurs endpoints ou des helpers internes (`_*.ts`).

---

## 3. Conventions Spécifiques

- Tout ajout d'un nouveau service doit commencer par la création de son interface dans `interfaces/`.
- Chaque endpoint dans `api/` doit exporter (en `default`) une fonction compatible avec le handler de `serveApiFolder` : `(req, system) => Response | Promise<Response>`.

## 4. Limites

- Un fichier ne doit pas faire plus de 120 lignes. Si c'est le cas, une refactorisation est nécessaire pour extraire des sous-modules.
- Un dossier ne doit pas contenir plus de 8 fichiers ou sous-dossiers. Si c'est le cas, il faut envisager une réorganisation.
- Un dossier ne doit pas contenir plus de 4 niveaux de profondeur ( à partir de src/ ). Si c'est le cas, il faut envisager une réorganisation.
