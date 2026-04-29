# Convention de Structure : Architecture "Socle"

Cette architecture repose sur le package `@bernouy/socle`. L'objectif est une séparation stricte entre les contrats (interfaces), la logique (core) et l'infrastructure (default-implementation).

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
- **api/** : Routage automatique par fichiers via `@bernouy/socle`.
    - Format : `nom.methode.ts` (ex: `media.post.ts`).
    - *Règle :* Pas de logique métier ici, on appelle uniquement les instances de `exports/`.
- **static/** : Rendu via `renderStaticFolder`.
    - Fichiers `.html` : Injectés dans `{{CONTENT}}`.
    - *Lien :* Utilise obligatoirement `{{BASE_PATH}}` pour les assets.
- **components/** : Agrégats ou composants spécifiques basés sur `@bernouy/webcomponents`.

---

## 2. Flux de Dépendances (Règles d'Or)

1. **Le sens de la flèche :** `api/` -> `exports/` -> `core/` -> `interfaces/`.
2. **L'instanciation interdite :** On ne doit jamais voir de `new MaClasse()` en dehors de `exports/` ou de `default-implementation/`. 
3. **Double Routage :** Si un endpoint est défini à la fois en fichier (`api/user.get.ts`) et en dossier (`api/user/user.get.ts`), c'est une erreur critique. Privilégier systématiquement la structure **[à définir : à plat ou en dossier ?]**.

---

## 3. Conventions Spécifiques @bernouy/socle

- Tout ajout d'un nouveau service doit commencer par la création de son interface dans `interfaces/`.
- Chaque endpoint dans `api/` doit exporter une fonction compatible avec le handler de `renderApiFolder`.