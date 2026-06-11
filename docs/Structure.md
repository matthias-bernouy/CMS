# Structure du monorepo

Le code vit sous `packages/`, réparti en **quatre couches** dont le seul but est la
**séparation des responsabilités** et la **réutilisation à travers plusieurs surfaces**.

```
packages/
├── foundation/   ← briques génériques, rien de spécifique au CMS
├── features/     ← le CMS, découpé en domaines métier (un par package)
├── surfaces/     ← assemblage des features en applications (routes, pages), sur interfaces seules
└── runtimes/     ← points d'entrée exécutables qui injectent les implémentations réelles
```

## Schéma des dépendances

Le sens des dépendances est strict, des couches concrètes vers les couches abstraites :

```
runtimes ──▶ surfaces ──▶ features ──▶ foundation
   │            │            │
   │            │            └─ une feature peut dépendre d'une autre feature
   │            │               (toujours via son barrel exports/, jamais en profondeur)
   │            └─ une surface ne connaît que les interfaces des features
   └─ un runtime choisit et injecte les implémentations (Mongo, S3, …)
```

Règle : **une couche ne dépend jamais d'une couche au-dessus d'elle.** Une feature ignore
les surfaces ; une surface ignore les runtimes.

---

## Les quatre couches

### `foundation/`

Tout ce qui peut être généralisé hors du CMS. Aucune connaissance du métier CMS.
À terme, ces packages pourraient sortir du monorepo si d'autres projets en ont besoin.

Aujourd'hui : `http-runner` (la seam `Runner` — endpoints, middlewares, montage),
`envelope-crypto` (chiffrement par enveloppe), `rate-limiter` (rate limiting substituable),
`components` (les blocs `<p9r-*>` et custom elements d'admin, ex-`cms-blocs`).

### `features/`

Le CMS lui-même, découpé en **domaines métier**, un par package
(`@bernouy/cms-content`, `@bernouy/cms-auth`, `@bernouy/cms-gateway`, …).
Chaque feature est un module autonome qui suit l'**architecture en couches** décrite plus bas.

### `surfaces/`

Assemble les features entre elles : monte les routes, sert les pages, câble les middlewares.
**Aucune implémentation concrète** — une surface ne manipule que les *interfaces* exposées
par les features, jamais un `new MongoXxx()`. Deux surfaces aujourd'hui :
`cms-control` (le back-office admin : `api/` + `static/` + `components/`) et
`cms-delivery` (le rendu public des sites).

### `runtimes/`

Les points d'entrée **exécutables** : ils sont les seuls à choisir et instancier les
implémentations réelles (`MongoCmsRepository`, store S3, …) et à les injecter dans une surface.
`cms-server` (le serveur HTTP) et `cms-cli` (l'outil en ligne de commande).

---

## Anatomie d'un package `features/`

Chaque feature applique la même architecture en couches. Le flux de dépendances interne va
**toujours** du concret vers l'abstrait :

```
http/ ──▶ exports/ ──▶ core/ ──▶ interfaces/
                          ▲           ▲
        default-implementation/ ──────┘
```

### Les dossiers

| Dossier | Rôle | Présence |
|---|---|---|
| `interfaces/` | Contrats purs : `interface`/`type` uniquement, **aucun code exécutable**. C'est la frontière que le reste du package suit. | toutes (sauf libs pures de transformation) |
| `core/` | La logique métier pure. N'importe **que** des `interfaces/`, jamais une implémentation concrète. | **toutes** |
| `default-implementation/` | Implémentations concrètes proposées des interfaces (`InMemoryXxx`, `MongoXxx`, …). | features avec un repository/store |
| `exports/` | Le **composition root** et la frontière publique du package. Un fichier par sous-chemin déclaré dans `package.json`. | **toutes** |
| `http/` | Les **handlers** HTTP (`(req, deps) => Response`) et les **constantes de route** (chemin, méthode, clé de cache) de la feature. **Ne monte aucune route** (`runner.addEndpoint`/`group` interdits ici) et **ne sert aucune page HTML** — voir les deux règles ci-dessous. | features qui exposent des routes |
| `components/` | Custom elements / fragments HTML propres à la feature. | `cms-auth` |
| `presets/` | Données de préréglage embarquées. | `cms-gateway` |

Les dossiers absents sont **légitimes**, pas des écarts : `cms-bloc-compile` est une lib de
transformation pure (`core` + `exports` seulement) ; `cms-permissions` et `cms-secrets`
n'ont pas de `http/` car elles n'exposent pas d'endpoints propres.

### Règles d'or

1. **Sens des flèches** : `http/` → `exports/` → `core/` → `interfaces/`. Jamais l'inverse.
2. **Instanciation confinée** : on ne voit `new MaClasse()` **que** dans `exports/` ou
   `default-implementation/`. `core/` reçoit ses dépendances par injection.
3. **`interfaces/` est inerte** : interdiction d'y importer ou d'y écrire du code exécutable.
4. **Une feature consomme une autre feature** uniquement via son barrel `exports/`
   (le nom de package), jamais par un chemin profond — voir [import-rules](./import-rules.md).
5. **Une feature ne monte pas de routes.** Elle exporte des *handlers* + des *constantes
   de route* ; c'est la **surface** qui appelle `runner.addEndpoint`/`group`. Invariant
   vérifiable : `runner.addEndpoint`/`.group(`/`.setDefaultEndpoint` n'apparaît que dans
   `surfaces/` et `runtimes/`, jamais dans `features/`.
6. **Une feature ne sert pas de page HTML.** Les documents pleine-page (login, erreurs, …)
   appartiennent à la surface (`static/`). Un middleware de feature qui doit produire une
   page (ex. l'auth guard) reçoit un *hook de rendu injecté* par la surface, et reste
   sans présentation par défaut (réponse texte/redirection nue).

### `exports/` ↔ `package.json`

Chaque fichier de `exports/` correspond à **un** sous-chemin déclaré dans le champ
`"exports"` du `package.json`, et inversement :

| Fichier | Sous-chemin | Convention |
|---|---|---|
| `index.ts` | `.` | API publique par défaut |
| `browser.ts` | `./browser` | sous-ensemble safe pour un bundle navigateur |
| `mongo.ts` | `./mongo` | **isole la peerDependency `mongodb`** — non tirée si non importée |
| `s3.ts`, `urls.ts`, `presets.ts`, `constants.ts`, `components.ts` | `./<nom>` | idem : isole une dépendance lourde ou un sous-domaine |

Un consommateur importe `@bernouy/cms-content` ou `@bernouy/cms-content/mongo`, jamais un
chemin interne. C'est ce qui rend chaque entité « promouvable en package » de façon mécanique.

### Limites (signaux de refactorisation)

- Un fichier > **120 lignes** → extraire des sous-modules.
- Un dossier > **8 fichiers/sous-dossiers** → réorganiser.
- Plus de **4 niveaux** de profondeur depuis `src/` → réorganiser.

---

## Où vivent `api/` et `static/` ?

Dans les **surfaces**, pas dans les features. Une feature publie des *handlers* dans son
`http/` ; c'est la surface qui les **monte** (`runner.addEndpoint`/`group`), en plus de
posséder son dossier `api/` auto-routé et son dossier `static/` (pages d'admin, pages login
et erreurs). Quand une route est exposée par deux surfaces (les routes `/.cms/*` servies à la
fois par `cms-control` en aperçu guardé et par `cms-delivery` en public), chaque surface
écrit son propre montage à partir du handler + de la constante de route partagés.

- `api/` : routage automatique par fichiers — voir [api-folder](./api-folder.md).
- `static/` : rendu SSR des pages — voir [static-folder](./static-folder.md).

## Voir aussi

- [import-rules](./import-rules.md) — chemins d'import et frontières de packages.
- [api-folder](./api-folder.md) — convention du dossier `api/` des surfaces.
- [static-folder](./static-folder.md) — convention du dossier `static/` des surfaces.
- [cms-bloc-development](./cms-bloc-development.md) — développement des blocs `foundation/components`.
