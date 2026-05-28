# Structure d'un Official Data Provider

Ce document est **normatif** et complète `base.md` (§7). Il décrit
l'agencement interne **obligatoire** de `official-tenant-provisioners/<name>/`.

Un official tenant-provisioner est un **service API-only, multi-tenant, à
déploiement unique**. Il suit l'architecture « Socle » du projet
(`.agents/rules/structure.md`), avec **deux différences assumées** :

- **Pas de `static/`** ni de `components/` : aucune UI. Tout l'affichage est
  rendu par le **hub/central**. Le provider n'expose que des API.
- **Mono-runner** : la tenancy est **logique**, résolue à la requête depuis
  l'`iss` vérifié (`base.md` §5). On ne scope **jamais** un runner par tenant
  (contrairement à `cms-control-mt`).

## Le noyau de conformité : `_sdk`

Tout ce qui est **identique** entre providers (vérif JWT §4.5, discovery RFC
8414 + cache JWKS §4.4, autorisation par plan §4.7, erreurs RFC 7807 §6,
contrat superadmin §8, squelette de mount, types/constantes) vit dans le
**package** `official-tenant-provisioners/_sdk/`. Sa surface est spécifiée dans
[`_sdk.md`](_sdk.md).

Un provider **n'a pas le droit de réimplémenter** ces parties : il les
**consomme** via la frontière `exports` du SDK (cf. `import-rules.md` règle 3).
La conformité au contrat n'est pas une convention, c'est du **code partagé**.

Un provider se réduit donc à : son **domaine** (plans 2 & 3) + quelques
**hooks injectés** (effets de provision/deprovision, repos métier) +
`createProvider(...).mount(runner)`.

Référence canonique dans le repo : **`packages/hub-api/`** (service socle
API-only avec provisioning de tenants).

---

## 1. Arborescence

```
official-tenant-provisioners/
  _sdk/                   # PACKAGE — noyau de conformité (cf. _sdk.md)
  <name>/                 # un provider (package : package.json + tsconfig.json)
    src/
      index.ts            # entrée processus : lit la config, boote le runner
      constants.ts        # racine du package (import.meta.url, cf. import-rules.md)
      interfaces/         # contrats du DOMAINE uniquement — AUCUN code exécutable
      types/              # types métier / utilitaires
      core/               # logique pure du domaine, dépend des interfaces
        <domain>/         #   logique métier du data-plane (plan 3)
        provisioning/     #   HOOKS d'effet (créer/purger le namespace, quotas…)
      default-implementation/   # impls concrètes des stores du domaine
      exports/            # composition root + mount (délègue au SDK)
        <Name>Provider.ts #   instancie les impls, expose les instances + hooks
        mount<Name>.ts    #   appelle le mount du SDK avec injection
      api/                # endpoints file-routés, fins, découpés par plan
        tenant/           #   plan 2 — tenant-admin (role: tenant, sans sub)
        <consumption>     #   plan 3 — consommation (racine, sub optionnel)
    tests/                # bun test (*.test.ts)
```

Convention repo (alignée sur `packages/*`) : tout le code sous `src/`,
`tsconfig.json` `extends ../../tsconfig.base.json` + référence
`../../packages/core`, package inscrit dans les `references` du `tsconfig.json`
racine **et** dans les devDeps racine (`workspace:*`, ce qui crée le symlink
`node_modules/@bernouy/*`).

Notes :

- `static/`, `components/` : **interdits**.
- **Pas de `core/auth/`** ni de `core/provisioning/` générique côté provider :
  ça vient du `_sdk`. `core/provisioning/` ne contient que les **hooks
  d'effet** propres au backend du provider.
- **Pas de `api/admin/`** côté provider : les routes superadmin (§8) sont
  **fournies par le SDK** et montées par son mount. Le provider ne câble que
  les plans 2 et 3.

---

## 2. Rôles des couches

Identiques à `.agents/rules/structure.md`. Spécificités provider :

- **`interfaces/`** — contrats du **domaine** uniquement (repos métier). Les
  contrats transverses (`ProviderConfig`, `TenantRegistry`) viennent du SDK.
  **Aucun import exécutable.**
- **`core/`** — logique pure du domaine :
  - `<domain>/` — la logique métier servie par le plan consommation.
  - `provisioning/` — **hooks** invoqués par le SDK aux moments du cycle de
    vie tenant (`onProvision`, `onUpdate`, `onDeprovision`) : créer/migrer/
    purger le namespace du tenant, appliquer les quotas. **Pas** le contrat
    HTTP §8 lui-même (c'est le SDK).
- **`default-implementation/`** — impls concrètes des stores du domaine. Le
  `TenantRegistry` et le cache JWKS ont des impls par défaut **dans le SDK**
  (réutilisables) ; le provider peut fournir les siennes.
- **`exports/`** — **composition root + mount**, rien d'autre n'instancie :
  - `<Name>Provider.ts` : instancie `default-implementation/`, expose les
    instances + l'objet de hooks consommés par `api/` et le SDK.
  - `mount<Name>.ts` : appelle `createProvider({ config, hooks, domain })`
    du SDK puis son `.mount(runner)`. Ne réimplémente ni l'auth ni le
    provisioning ni les endpoints à nom fixe.
- **`api/`** — colle fine : parse → délègue à `core/` → réponse. **Aucune
  logique métier**, **aucune instanciation**. Convention : `api-folder.md`.
  Ne contient **que** `tenant/` (plan 2) et la consommation (plan 3).
- **`index.ts`** — entrée processus : lit la configuration, appelle
  `mount<Name>`. Ne contient pas de logique.

Sens des dépendances inchangé : `api/ → exports/ → core/ → interfaces/`, et
`exports/` → `_sdk` (par la frontière `exports` du SDK).

---

## 3. Ce que le SDK monte (le provider n'y touche pas)

Le `mount` du SDK câble, **à l'identique pour tous les providers** :

- le **middleware d'auth** (§4.5 vérif + §4.7 autorisation par plan) en amont
  de tout ;
- les **4 endpoints à nom fixe** — `/health`, `/openapi.json`,
  `/openapi.tenant.json`, `/openapi.admin.json` — montés **explicitement**
  (le file-router découpe sur `.`, ces paths en contiennent : ils ne peuvent
  pas être file-routés) ;
- **`/openapi.admin.json` est émis par le SDK** (le contrat §8 est figé) — le
  provider ne le fournit pas, garantissant que le client générique du hub
  matche toujours ;
- les **routes superadmin `/admin/*`** (§8), dont la logique générique vit
  dans le SDK et délègue aux **hooks** du provider pour les effets.

Le provider fournit le contenu de `/openapi.json` (plan 3) et
`/openapi.tenant.json` (plan 2), et branche **uniquement** le file-router des
plans 2 & 3.

---

## 4. Découpage par plan = sous-dossiers `api/`

Préfixes de `base.md` §1.1 → arborescence :

| Plan | Préfixe | Origine | `role` exigé (§4.7) |
| --- | --- | --- | --- |
| 1 — superadmin | `/admin/*` | **SDK** (figé) | `control-plane` |
| 2 — tenant-admin | `/tenant/*` | provider — `api/tenant/` | `tenant` (sans `sub`) |
| 3 — consommation | racine | provider — `api/` racine | `tenant` |

L'autorisation par plan (§4.7) est appliquée **une fois** par le middleware du
SDK à partir du préfixe + du `role` de l'`iss`. Les fichiers `api/` du
provider ne refont **jamais** ce contrôle.

---

## 4.bis Configuration tenant (optionnel, base.md §11)

Un provider qui expose une config métier propre suit cette structure :

```
src/core/schemas/
  └── tenantConfig.ts          ← zod schema (source) + version + JSON Schema
src/default-implementation/
  └── <Name>ConfigStore.ts     ← store CRUD per-tenant (Memory ou backend)
src/core/domain/
  ├── getTenantConfig.ts       ← logique pure (lecture + stripWriteOnly)
  └── updateTenantConfig.ts    ← logique pure (validation + merge + store)
src/api/tenant/                ← (si filesystem routing en place)
  ├── config.get.ts
  └── config.patch.ts
src/exports/index.ts           ← `tenantConfig: NOTES_TENANT_CONFIG` à createProvider
```

Le zod schema est la **source unique** : il alimente à la fois le JSON Schema
servi à `/openapi.tenant-config.json` (via le helper `defineTenantConfig` ou
un post-process manuel attachant les `x-*`/`writeOnly`) **et** la validation
server-side dans `onProvision` / `onUpdate` / `PATCH /tenant/config`.

Les handlers tenant-self-service utilisent les helpers SDK :
`requireTenantScope(req)` (rejette les scopes `user`) puis
`assertTenantWritable(schema, body)` (rejette les champs hub-only). Aucun
de ces deux contrôles n'est facultatif pour un provider conformant.

Un provider sans config métier (passthrough / toy) n'expose pas
`tenantConfig` — l'endpoint renvoie 404 et le hub considère « pas d'UI de
config ». Aucune erreur.

---

## 5. Limites

Celles de `.agents/rules/structure.md` : fichier ≤ 120 lignes, dossier ≤ 8
entrées, profondeur ≤ 4 depuis la racine du provider. Le provider étant réduit
au domaine + hooks, ces limites sont largement tenables ; découper
`core/<domain>/` en sous-modules si besoin.
