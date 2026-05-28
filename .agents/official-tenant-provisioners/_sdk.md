# Le SDK des Official Data Providers (`_sdk`)

Ce document est **normatif**. `official-tenant-provisioners/_sdk/` est un **package**
(son propre `package.json` + champ `exports`). Il est le **noyau de
conformité** : tout ce qui est identique entre providers et critique pour la
sécurité y vit **une seule fois**. Un provider le **consomme** par la frontière
`exports` (jamais d'import qui la traverse — `import-rules.md` règle 3) et
**n'en réimplémente aucune partie**.

Forme Socle : le SDK lui-même suit `.agents/rules/structure.md`
(`interfaces/`, `core/`, `default-implementation/`, `exports/`).

**Indépendance système (normatif).** `_sdk` NE DOIT importer **ni** le CMS
(`@bernouy/cms`, `control/`, `delivery/`) **ni** le proxy. Il reçoit un
`Runner` et une `ProviderConfig` **injectés**. Le découplage du `base.md`
(la confiance = allowlist d'`iss` + RFC 8414, §4.8) serait un mensonge si le
noyau qui l'implémente dépendait du CMS : toute dépendance entrante CMS est
un bug de conception, pas un raccourci.

---

## 1. Ce que le SDK possède (figé, non surchargeable)

- **Vérification du token** — la procédure §4.5 dans l'ordre imposé :
  extraction Bearer, contrôle `alg`, allowlist `iss`, fetch + vérif via JWKS,
  `aud`, `exp`/`iat` + skew, cache anti-rejeu `jti`, dérivation du scope
  depuis `sub`.
- **Discovery & clés** — RFC 8414 (`/.well-known/oauth-authorization-server`),
  résolution du `jwks_uri`, fetch JWKS, cache TTL, résolution par `kid`,
  rafraîchissement sur `kid` inconnu + cache négatif (§4.4). Inclut le
  **garde anti-SSRF** : rejet de tout `jwks_uri`/`issuer` non same-origin que
  l'`iss`, et le contrôle de **`tenant_provisioner_contract_version`** (rejet si version
  incompatible — distinct de la version du package, cf. §3).
- **Autorisation par plan** — matrice (préfixe × `role`) du §4.7.
- **Fraîcheur de l'état tenant** — relecture du `TenantRegistry` par requête
  avec cache TTL **borné** ; `suspend`/`update` effectif en ≤ 1 TTL (§5).
- **Erreurs RFC 7807** — sérialisation `application/problem+json`, règle
  « opaque côté client / précis côté logs » (§6), et le mapping de statuts
  normatif : `401` auth, `403` plan/suspend. (Les quotas — `429`+`Retry-After`
  — sont **hors périmètre pour l'instant**, base.md §5 ; à rajouter plus tard
  via la même mécanique.)
- **Contrat superadmin §8** — handlers + DTO + idempotence + sémantique
  `force`, **émission de `/openapi.admin.json`** (le contrat étant figé, c'est
  le SDK qui le génère, pas le provider), et la **journalisation d'audit
  immuable** des actions control-plane.
- **Squelette de mount** — runner unique, ordre du middleware, montage
  explicite des 4 endpoints à nom fixe (`/health`, `/openapi.json`,
  `/openapi.tenant.json`, `/openapi.admin.json`), branchement du file-router
  des plans 2 & 3.
- **Configuration tenant (base.md §11)** — passage opaque d'un champ
  `providerConfig?: unknown` à travers `TenantUpsert` / `TenantPatch` et
  vers les hooks ; service d'un endpoint `GET /openapi.tenant-config.json`
  (control-plane gated) si le provider déclare un schéma ; jeu complet de
  helpers exposés au provider :
    - `defineTenantConfig({ version, zod, annotations, … })` — fabrique
      ergonomique : zod = source unique, émet le JSON Schema + `x-*`
      annotations + expose `.zod`/`.partial` pour la validation server-side.
    - `requireTenantScope(req)` — rejette scope `user` (sub).
    - `assertTenantWritable(schema, body)` — enforcement de `x-writable-by`
      sur `PATCH /tenant/config` (403 sur champ hub-only).
    - `extractWritability(schema)` — map fieldName → writableBy[] (utile pour
      des contrôles custom).
    - `stripWriteOnly(config, schema)` — retire les champs `writeOnly`
      avant retour en GET.
    - `isVisible(fieldName, currentValues, schema)` — évaluateur
      `x-visible-if` côté hub (advisory UI).

  La validation du blob est toujours la responsabilité du provider — le SDK
  ne le lit pas.
- **Types & constantes** — claims (§4.3), `ProviderConfig` (allowlist `iss` +
  `role`, profil crypto par défaut **ES256 / 120 s / ±30 s**), contrat
  `TenantRegistry`. (Quotas hors périmètre, cf. base.md §5.)
- **Impls par défaut réutilisables** — `TenantRegistry` (memory / mongo),
  cache JWKS. Le provider peut fournir les siennes via injection.

---

## 2. Ce que le provider injecte

Le SDK expose une fabrique unique :

```
createProvider({ config, registry?, hooks, domain, tenantConfig? }).mount(runner)
```

- **`config`** — `ProviderConfig` : allowlist d'`iss` (au moins le hub en
  `control-plane`), id du provider (`aud` attendu), profil crypto (défauts si
  omis), politique de déprovisionnement par défaut (purge immédiate **ou**
  délai de grâce — annoncée dans `/openapi.admin.json`). Quotas hors
  périmètre pour l'instant (base.md §5).
- **`registry?`** — impl de `TenantRegistry` ; défaut SDK si omis.
- **`hooks`** — effets du cycle de vie tenant, invoqués par le provisioning
  générique du SDK :
  - `onProvision(tenantId, issuer, opts)` — créer le namespace/les ressources
    du tenant. **Doit être idempotent** (le SDK garantit l'idempotence HTTP,
    le hook garantit l'idempotence de l'effet).
  - `onUpdate(tenantId, patch)` — appliquer rotation `issuer` / suspend.
  - `onDeprovision(tenantId, { force })` — purger ou planifier selon la
    politique ; `force` ⇒ purge immédiate irréversible.
- **`domain`** — le routeur/handlers des plans 2 (`/tenant/*`) et 3
  (consommation), plus le contenu des specs `/openapi.json` et
  `/openapi.tenant.json`. Le SDK les monte derrière son middleware d'auth ;
  chaque handler reçoit le **contexte tenant déjà résolu** (`tenant`, `role`,
  `sub?`) — il n'a ni à vérifier le token ni à contrôler le plan.
- **`tenantConfig?`** — `{ version: "X.Y", schema: <JSON Schema 2020-12> }`.
  Si fourni, le SDK l'expose à `GET /openapi.tenant-config.json` (CP-gated,
  cf. base.md §11). Optionnel — un provider sans config métier propre ne
  le déclare pas et l'endpoint renvoie 404. Vocabulaire `x-*` accepté :
  `x-widget` (text, textarea, password, select, radio, select-multiple,
  checkboxes, tags, number, slider, toggle, date, color),
  `x-writable-by` (`["control-plane"]` ou `["control-plane", "tenant"]`),
  `x-group`. Champ sensible = `writeOnly: true` (natif JSON Schema). Le
  SDK ne lit jamais la valeur stockée — c'est au provider de valider via
  son zod schema dans `onProvision` / `onUpdate` et dans ses handlers
  `/tenant/config.*` (helpers SDK : `requireTenantScope`,
  `assertTenantWritable`).

---

## 3. Invariants garantis par le SDK

Un handler de domaine (plan 2/3) ne s'exécute que si : token vérifié (§4.5),
plan autorisé (§4.7), tenant résolu et isolé par `iss` (§5). Le contexte
fourni est donc déjà digne de confiance ; le provider ne **doit pas** refaire
ces contrôles, et ne **peut pas** les contourner (pas d'accès au runner brut
avant le middleware).

La configuration métier d'un tenant (base.md §11) est stockée par le
provider, jamais par le SDK : `TenantState` reste byte-stable entre
providers, ce qui permet au hub d'avoir une vue uniforme. Le `providerConfig`
blob passe opaque ; un provider qui en a besoin valide via son propre zod
schema.

Toute évolution du contrat `base.md` se fait **dans le SDK** et se propage par
**version du package** — c'est le point de contrôle unique de la conformité.
