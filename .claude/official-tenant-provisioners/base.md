# Contrat des Official Data Providers

Ce document est **normatif**. Tout official tenant-provisioner DOIT le respecter
intégralement. Il n'y a **qu'un seul contrat** : aucune distinction entre
provider « officiel » et « tiers » au niveau du protocole.

Mots-clés : **DOIT** / **NE DOIT PAS** / **DEVRAIT** / **PEUT** au sens RFC 2119.

---

## 1. Vue d'ensemble

Un tenant-provisioner est une API externe importée dans le CMS via son schéma
OpenAPI. **Aucun client n'appelle jamais le tenant-provisioner en direct.** Tout
transite par le **proxy** du CMS, qui régénère une configuration nginx dédiée
par provider à l'import.

Deux questions de confiance distinctes, à ne jamais confondre :

- **A — « Cette requête vient-elle vraiment du CMS, et de quel tenant ? »**
  C'est la question que se pose le **provider**, à chaque requête. Réponse : le
  proxy signe la requête avec la clé privée propre à l'instance CMS ; le
  provider vérifie la signature avec la clé publique correspondante (publiée
  par cette instance). **Tout ce document ne traite que de ça.**
- **B — « Le proxy parle-t-il au vrai provider, pas à un imposteur ? »** C'est
  la question que se pose le **proxy** quand il sort vers le provider. Réponse :
  le certificat **TLS** du provider (HTTPS classique) + le fait qu'un admin a
  saisi/importé lui-même l'URL du provider. Le provider n'a **rien** à
  implémenter pour ça : ni clé, ni secret, ni `.well-known`.

### 1.1 Les trois plans

Tout provider expose **trois plans** distincts, par appelant, identité et
niveau de confiance. Même mécanisme crypto partout (§4) ; ce qui change c'est
le **rôle de l'`iss`** et le **préfixe de chemin**.

| Plan | Préfixe | Appelant | `iss` (rôle) | `sub` |
| --- | --- | --- | --- | --- |
| **1. Superadmin / provisioning** | `/admin/*` | le **central** seul | hub (`role: control-plane`) | absent |
| **2. Tenant-admin** | `/tenant/*` | CMS du tenant (admin) | instance CMS (`role: tenant`) | absent |
| **3. Consommation** | racine | blocs/pages du tenant | instance CMS (`role: tenant`) | optionnel |

Le **plan 1 est figé et identique pour tous les providers** (contrat
normatif, §8) : le central a **un seul client générique** qui pilote tous les
providers. La spécificité d'un provider vit **uniquement dans les plans 2 et
3**, décrits via OpenAPI (§9).

---

## 2. Endpoints obligatoires

| Endpoint                                | Méthode | Auth | Rôle                                                    |
| --------------------------------------- | ------- | ---- | ------------------------------------------------------- |
| `/health`                               | GET     | non  | Liveness. `200` si le service est sain.                 |
| `/.well-known/tenant-provisioner-info`       | GET     | non  | §2.0 — métadonnées discovery (providerId + kind opt-in) |
| `/openapi.json`                         | GET     | non  | Spec OpenAPI 3.x du plan **consommation** (plan 3).     |
| `/openapi.tenant.json`                  | GET     | non  | Spec OpenAPI 3.x du plan **tenant-admin** (plan 2).     |
| `/openapi.admin.json`                   | GET     | non* | Spec OpenAPI 3.x du plan **superadmin** (plan 1).       |

`/health`, `/.well-known/tenant-provisioner-info`, `/openapi.json` et
`/openapi.tenant.json` NE DOIVENT PAS exiger d'authentification.
(*) `/openapi.admin.json` décrit la surface de provisioning et n'est
récupéré que par le central ; il NE DOIT PAS être annoncé ni accessible
aux tenants (cf. §9).

### 2.0 — `/.well-known/tenant-provisioner-info`

Body JSON public, **non sensible**. Sert deux usages :

1. Le central résout `providerId` AVANT de pouvoir mint un token CP avec
   le bon `aud` (sinon chicken-and-egg avec `/openapi.admin.json` qui est
   gated).
2. Un UI de gestion groupe les tenant-provisioners par `providerKind` (opt-in)
   pour l'affichage.

```jsonc
{
    "providerId":               "delivery-acme",          // requis, unique
    "providerKind":             "delivery",               // OPT-IN, string libre
    "contractVersion":          "1.0",                    // requis, base.md §4.4
    "defaultDeprovisionPolicy": { "mode": "grace", "graceSeconds": 604800 }
}
```

- `providerKind` est une **string libre** non normalisée par la spec — la
  convention est portée par l'écosystème (ex. « delivery », « payment »,
  « crm »). Le central l'utilise pour grouper visuellement ; **aucune
  orchestration n'en dépend** (pas de load-balancing automatique entre DPs
  de même kind — c'est le rôle d'un LB en amont).
- L'endpoint n'expose **rien** au-delà de ce qu'on apprendrait en
  fetchant `/openapi.admin.json` avec un token, donc le rendre publique
  ne dégrade pas la sécurité.

---

## 3. Forme des requêtes

- Les paramètres DOIVENT passer **en query string uniquement**.
- Il NE DOIT PAS y avoir de **path params** (`/users/{id}` est interdit →
  `/users?id=...`). Conséquence : chaque opération a un chemin **statique**,
  ce qui rend le matching nginx trivial et le rewrite proxy déterministe.
- Un **body** de requête est autorisé pour les méthodes d'écriture
  (`POST`/`PUT`/`PATCH`/`DELETE`).
- Le provider n'est appelé que **serveur-à-serveur** (jamais depuis un
  navigateur). Il NE DOIT PAS activer de CORS permissif (pas d'en-tête
  `Access-Control-Allow-Origin: *` ni reflet d'`Origin`) : aucun appel
  cross-origin n'est attendu, l'autoriser n'ouvrirait que de la surface.

---

## 4. Authentification

L'authentification se fait via un **JWT signé**, transporté dans l'en-tête :

```
Authorization: Bearer <jwt>
```

Il y a **deux couches superposées dans un seul token** :

### 4.1 Couche tenant (machine-to-machine) — toujours présente

C'est la base. Sur **toute** requête, le proxy attache un JWT signé avec **la
clé propre de l'instance CMS**. Cette clé **est** l'identité du tenant : une
clé = une instance CMS = un `iss`. C'est le seul mécanisme machine-to-machine ;
il n'y en a pas d'autre.

### 4.2 Couche user — optionnelle

Quand un utilisateur final est connecté, le token porte un claim `sub` =
**identifiant opaque, propre au couple (utilisateur, provider)**. Le contrat
impose les **propriétés** de cet id, **pas son implémentation** ; le
fournisseur du `sub` (le « broker ») est **pluggable** au choix du
déploiement :

- pairwise subject identifier d'un IdP OIDC (ex. Keycloak pairwise PPID,
  dérivé déterministe par `sectorIdentifier`) ;
- table de mapping aléatoire stockée côté domaine d'auth ;
- toute autre source respectant les propriétés ci-dessous.

Propriétés **non négociables** du `sub` :

- **stable** pour un même couple (user, provider) à travers les appels ;
- **distinct et non corrélable** entre providers pour le même user ;
- **non réversible** par le tenant-provisioner (le provider ne peut pas remonter
  à l'identité réelle).

Le proxy résout le `sub` et le **cache agressivement** (seule la 1ʳᵉ requête
d'un couple paie le lookup) — quelle que soit l'impl du broker.

Le provider DOIT lire l'identité utilisateur **uniquement** dans le `sub`
**vérifié** du JWT. Il n'existe aucun en-tête d'identité alternatif.

### 4.3 Claims du token

| Claim     | Présence    | Sémantique                                                            |
| --------- | ----------- | --------------------------------------------------------------------- |
| `iss`     | OBLIGATOIRE | URL de l'instance CMS émettrice. Autorité d'identification du tenant.  |
| `aud`     | OBLIGATOIRE | Identifiant du provider destinataire. Anti-rejeu inter-providers.     |
| `sub`     | OPTIONNEL   | Id opaque (utilisateur, provider). Absent ⇒ pas d'utilisateur connecté.|
| `iat`     | OBLIGATOIRE | Émission.                                                             |
| `exp`     | OBLIGATOIRE | Expiration courte (cf. §4.6).                                         |
| `jti`     | OBLIGATOIRE | Identifiant unique du token (anti-rejeu).                             |

Il n'y a **pas** de claim `tenant` : le tenant est entièrement déterminé par
l'`iss` (et la clé de signature). Le provider mappe `iss` → son tenant interne.

### 4.4 Découverte des clés (`.well-known`)

Chaque instance CMS publie son métadocument de découverte selon la convention
standard **RFC 8414 (OAuth 2.0 Authorization Server Metadata)** :

- `{iss}/.well-known/oauth-authorization-server` — métadonnées, contenant au
  minimum : `issuer`, `jwks_uri`, les algorithmes de signature supportés, et
  un champ **`tenant_provisioner_contract_version`** (version du présent contrat de fil, pour
  négociation/évolution — cf. §4.8).
- `jwks_uri` y pointe vers le JWKS (clés publiques, chaque clé avec son `kid`).

Le provider :

- DOIT maintenir une **allowlist d'`iss` de confiance**, chaque entrée portant
  un **`role`** : `control-plane` (le central, **un seul**, ajouté en config
  statique à l'onboarding) ou `tenant` (auto-peuplé via le provisioning, §8).
  Un `iss` inconnu → rejet (cf. §4.5).
- DOIT découvrir le `jwks_uri` via le métadocument RFC 8414 ; il NE DOIT PAS
  coder en dur le chemin du JWKS.
- DOIT exiger que `jwks_uri` (et l'`issuer` du métadoc) soient **same-origin
  que l'`iss`** (même schéma + hôte + port). Tout `jwks_uri` cross-origin →
  rejet **+ log de sécurité** (protection **anti-SSRF** : un `iss` allowlisté
  mais compromis ne doit pas pouvoir faire fetcher une adresse interne).
- DOIT rejeter un métadoc dont `tenant_provisioner_contract_version` est incompatible avec la
  version supportée (cf. §4.8), plutôt que de deviner.
- NE DOIT PAS piner de clés en dur. Il DOIT **fetcher dynamiquement** le JWKS
  depuis le `jwks_uri` découvert, avec cache TTL et résolution par `kid`, afin
  que la rotation de clé ne nécessite **aucun redéploiement** du provider.
- DEVRAIT rafraîchir le JWKS sur `kid` inconnu, avec un cache négatif court
  pour ne pas marteler l'émetteur.

### 4.5 Procédure de vérification (ordre imposé)

1. Extraire le Bearer. Absent / malformé → `401`.
2. Lire l'en-tête JWT. `alg` DOIT être l'algorithme attendu (cf. §4.6) ;
   tout autre `alg` → rejet (protection contre l'`alg` confusion).
3. `iss` DOIT être dans l'allowlist statique. Sinon → `401` **+ log de
   sécurité** (anormal : tentative d'intrusion probable).
4. Récupérer la clé via le `kid` dans le JWKS de `{iss}` et **vérifier la
   signature**. Échec → `401` + log de sécurité.
5. `aud` DOIT être l'identifiant de **ce** provider. Sinon → `401` + log de
   sécurité.
6. `exp`/`iat` valides dans la tolérance d'horloge (§4.6). Sinon → `401`.
7. `jti` DEVRAIT être vérifié contre un cache anti-rejeu sur la fenêtre de vie
   du token.
8. Si `sub` présent → **scope utilisateur**. Absent → **scope anonyme /
   tenant** (données publiques ou propres au tenant uniquement).

Les trois contextes de requête que le provider DOIT gérer :

| Token              | Contexte                | Données servies                     |
| ------------------ | ----------------------- | ----------------------------------- |
| Absent / invalide  | —                       | `401` (refus)                       |
| Valide, sans `sub` | Anonyme / tenant        | Publiques / propres au tenant       |
| Valide, avec `sub` | Utilisateur             | Périmètre de cet utilisateur        |

### 4.6 Profil cryptographique

- **Algorithme** : signature à clés courtes (courbes elliptiques, ES256 /
  P-256 par défaut). *Tunable* via `signing_alg_values_supported` du `.well-known` (RFC 8414).
- **Durée de vie du token** : **courte**. Défaut `120 s` (plage tunable
  `60–300 s`) — le token est forgé par requête au niveau du proxy, on peut
  être agressif.
- **Tolérance d'horloge** : `±30 s` par défaut (*tunable*).

### 4.7 Plans & autorisation

**Le `role` n'est PAS un claim du token.** C'est une **propriété de l'entrée
d'allowlist** que l'`iss` a matchée côté provider (§4.4). L'émetteur ne
« déclare » jamais son rôle ; le provider le **dérive** de sa config statique
(« cet `iss`-là = le hub control-plane », « cet `iss`-là = tel tenant »). Un
émetteur ne peut donc pas s'auto-élever en control-plane : il faudrait être
dans l'allowlist avec ce rôle, posé hors-bande à l'onboarding.

Après la vérification §4.5, le provider DOIT autoriser selon le couple
(**`role` de l'entrée d'allowlist de l'`iss`**, **préfixe de chemin**) :

| Préfixe demandé | `role` requis | Sinon |
| --- | --- | --- |
| `/admin/*` | `control-plane` | `403` + log de sécurité |
| `/tenant/*` | `tenant` | `403` |
| racine (consommation) | `tenant` | `403` |

Un token `role: control-plane` NE DOIT PAS pouvoir lire/écrire des données
métier (plans 2/3) ; un token `role: tenant` NE DOIT PAS atteindre `/admin/*`.

### 4.8 Obligations de l'émetteur

Le provider ne peut vérifier que ce qui est dans le token + le métadoc ; le
reste est une **promesse de l'émetteur**, non vérifiable côté provider, donc
**normative ici**. Le proxy du CMS est *un* émetteur ; tout autre système qui
veut être tenant DOIT honorer ces obligations (c'est ce qui rend le contrat
réutilisable hors CMS — le provider n'est lié à aucun système précis).

Tout émetteur DOIT :

- **`sub` pairwise non corrélable** : un `sub` distinct et stable par couple
  (utilisateur, provider), non réversible et non corrélable entre providers.
  Le provider **ne peut pas** le contrôler — c'est garanti ici.
- **TTL court** : respecter le profil §4.6 ; ne jamais émettre de token
  longue durée.
- **`jti` unique** par token sur la fenêtre de vie (anti-rejeu côté provider
  utile seulement si l'émetteur ne réémet pas le même `jti`).
- **Publier la clé suivante avant de signer avec** : lors d'une rotation, la
  nouvelle clé DOIT apparaître dans le JWKS **avant** le premier token signé
  avec, et l'ancienne y rester jusqu'à expiration du dernier token émis avec
  (fenêtre de recouvrement ≥ TTL max + skew) — sinon course avec le cache
  négatif du provider → faux `401`.
- **Métadoc RFC 8414 conforme** : `issuer` == `iss` des tokens, `jwks_uri`
  same-origin, `tenant_provisioner_contract_version` renseignée.
- **Provisionner ses tenants** : un émetteur n'est accepté en `role: tenant`
  que s'il a été enregistré via le control-plane (§8) ou en config statique.
  Émettre des tokens ne suffit pas à exister côté provider.

---

## 5. Multi-tenant

Un même provider sert plusieurs instances CMS. Il DOIT **isoler strictement
les données par `iss`**. Aucune donnée d'un tenant ne DOIT être visible depuis
le token d'un autre `iss`, y compris en cas de `sub` identique par collision
improbable (les `sub` sont scoping (utilisateur, provider) mais le provider
DOIT toujours partitionner d'abord par `iss`).

Un official tenant-provisioner DOIT être un **déploiement partagé unique** :
isolation tenant **logique** (namespace / row-level par tenant), **jamais**
process-per-tenant (économie, simplicité).

> **Quotas / rate-limits** : volontairement **hors périmètre pour l'instant**
> (à rajouter plus tard). Aucune sémantique de quota n'est normative ici.

**Fraîcheur de l'état tenant.** L'état d'un tenant (actif / `suspend` /
`issuer` courant) évolue via le control-plane (§8) mais les tokens
restent valides jusqu'à `exp`. Le provider DOIT relire l'état tenant **à
chaque requête** depuis le `TenantRegistry` (cache autorisé, **TTL borné et
court**). Conséquence assumée : un `suspend`/`update` prend effet en **au plus
un TTL de cache** (la révocation n'est pas instantanée — l'horizon est borné,
pas nul). `force` sur un déprovisionnement n'attend pas ce TTL côté données
mais l'accès peut survivre jusqu'à expiration du cache.

---

## 6. Erreurs

Toute réponse d'erreur DOIT suivre **RFC 7807** (`application/problem+json`) :

```json
{
  "type": "https://provider.example/errors/<slug>",
  "title": "<résumé court>",
  "status": 401,
  "detail": "<message lisible>",
  "instance": "<chemin de la requête>"
}
```

Les rejets d'authentification de §4.5 DOIVENT rester **opaques** côté détail
(ne pas révéler quelle étape a échoué), tout en étant **précis dans les logs
serveur** (avec `iss`, `kid`, `aud`, `jti`). Ces logs serveur sont émis comme
`kind: security` du système standardisé — voir **§10**.

Statuts normatifs :

- Tenant `suspend`é (§5/§8) → **`403`** en RFC 7807.
- Plan refusé (§4.7) → **`403`** ; auth invalide (§4.5) → **`401`**.

---

## 7. Emplacement et structure

Chaque official tenant-provisioner vit dans un dossier dédié :
`official-tenant-provisioners/<name>/`, avec toute sa structure interne à
l'intérieur.

L'agencement interne **obligatoire** est spécifié dans
[`structure.md`](structure.md) : service Socle API-only, multi-tenant,
mono-runner, sans `static/` ni `components/`. Référence canonique dans le
repo : `packages/hub-api/`.

---

## 8. Provisioning — le plan superadmin (plan 1)

Le central (« hub ») est la **source de vérité** du cycle de vie des tenants ;
le provider en est un **replica**. Le contrat ci-dessous est **figé et
identique pour tous les providers** : le central a un seul client générique.

Authentification : JWT signé par le hub, `iss` = hub, `role: control-plane`
(§4.7). **Aucun secret statique.** Préfixe `/admin/*`, query-only (§3).

| Opération | Endpoint | Sémantique |
| --- | --- | --- |
| Créer / activer | `POST /admin/tenants` | Body `{ tenantId, issuer, displayName?, plan? }`. **Idempotent sur `tenantId`** : même `tenantId`+`issuer` → `200` ; `issuer` divergent → `409`. Le champ `issuer` **auto-peuple** l'allowlist `role: tenant` (§4.4) — aucune config tenant manuelle côté provider. |
| Mettre à jour | `PATCH /admin/tenants?tenantId=` | Rotation de l'`issuer`/clé du tenant, `suspend`/`resume`. **Obligatoire** : sans ça une rotation de clé CMS casse le plan 3. |
| Déprovisionner | `DELETE /admin/tenants?tenantId=&force=` | Offboarding. Le provider applique sa **politique par défaut** (purge immédiate **ou** délai de grâce), qu'il DOIT annoncer dans `/openapi.admin.json`. `force=true` → purge immédiate irréversible, outrepasse la grâce. |
| Lister | `GET /admin/tenants` | Inventaire, pour **réconciliation** hub↔provider (le provider dérive sur appels ratés). |

Onboarding d'un nouveau provider dans le central = **2 gestes** :

1. **Côté provider** : ajouter en config statique l'`iss` du hub
   (`role: control-plane`).
2. **Côté central** : ajouter l'URL de base du provider.

Tout le reste (création de tenants, propagation des `issuer`) coule via l'API
standard ci-dessus.

**Audit.** Toute action du control-plane (`POST`/`PATCH`/`DELETE
/admin/tenants`) DOIT être journalisée de façon **immuable** : horodatage,
`iss` appelant (le hub), `tenantId` visé, opération, résultat. C'est un plan
d'administration : sans piste d'audit, une création/suppression de tenant est
indétectable a posteriori. L'audit est le `kind: audit` du système de logs
standardisé — forme, immuabilité et récupération définies en **§10**.

---

## 9. Découpage OpenAPI (3 documents séparés)

Trois specs **distinctes et servies séparément** (pas un seul fichier taggé),
une par plan, alignées sur les préfixes de §1.1 :

| Document | Plan | Préfixe décrit | Récupéré par |
| --- | --- | --- | --- |
| `/openapi.json` | 3 — consommation | racine | l'importer tenant-provisioner du CMS |
| `/openapi.tenant.json` | 2 — tenant-admin | `/tenant/*` | l'admin du tenant |
| `/openapi.admin.json` | 1 — superadmin | `/admin/*` | le central seul |

Raisons du découpage en fichiers séparés (et non en tags `x-plane`) :

- **Moindre divulgation** : la spec vue par le CMS/tenant NE DOIT PAS révéler
  la surface de provisioning.
- **Routing déterministe** : préfixes disjoints → enforcement §4.7 trivial.
- **Codegen propre** : le client générique du central se génère depuis
  `/openapi.admin.json` seul.

`/openapi.admin.json` DOIT décrire la surface **exactement** comme au §8 (elle
est normative, pas spécifique au provider) et y déclarer la politique de
déprovisionnement par défaut.

---

## 10. Logs & récupération

Le SDK standardise **l'émission** d'un enregistrement de log unique, son
**vocabulaire d'événements versionné**, et **deux endpoints de récupération**.
Le backend, la durabilité et la rétention ne sont **pas** standardisés (cf.
§10.4). But : le central a une observabilité + un audit **uniformes sur tous
les providers**.

### 10.1 Deux axes orthogonaux

- `level` ∈ `debug | info | warn | error` — sévérité. **Non extensible** par
  le provider (sinon l'agrégation cross-provider est cassée).
- `kind` ∈ `security | audit | request` — nature (visibilité + routage).

### 10.2 Forme de l'enregistrement (`LogRecord`)

| Champ | Présence | Note |
| --- | --- | --- |
| `schemaVersion` | OBLIGATOIRE | version du schéma de log (distincte du contrat). |
| `ts` | OBLIGATOIRE | UTC RFC 3339 ms, depuis l'horloge injectée. |
| `kind` | OBLIGATOIRE | `security`\|`audit`\|`request`. |
| `level` | OBLIGATOIRE | `debug`\|`info`\|`warn`\|`error`. |
| `event` | OBLIGATOIRE | code stable du **catalogue versionné** (ex. `auth.replay`, `tenant.provision`). Le cœur est **figé** ; un provider émet ses events métier sous le préfixe réservé **`domain.`** (`domain.<name>`), sur n'importe quel `kind` — il choisit la voie par sémantique. `domain.*` ne peut pas usurper un event cœur ; le hub désambiguïse par `(providerId, event)` et ne corrèle ses règles génériques que sur les noms cœur. Tout autre event inconnu = erreur de prog (rejet). |
| `providerId` | OBLIGATOIRE | l'`aud` du provider (agrégation hub). |
| `tenantId` | OBLIGATOIRE (valeur `null` permise) | `null` si `iss` inconnu. Le champ DOIT exister (force le bon traitement de visibilité). |
| `actor` | OBLIGATOIRE | `anonymous`\|`tenant`\|`control-plane`\|`system`. |
| `visibility` | OBLIGATOIRE | `control-plane`\|`tenant`\|`both`. |
| `requestId` | OBLIGATOIRE pour `request`/`security` | corrélation (généré si absent). |
| `outcome` | CONDITIONNEL | `allow`\|`deny` (security) / `ok`\|`error` (audit). |
| `iss`, `sub`, `ctx` | OPTIONNELS, **PII-gouvernés** | `sub` = identité pseudonyme (raccroche au §Hors-scope #9). `ctx` JSON borné. |

**Jamais enregistré** : token brut, en-tête `Authorization`, clés, secrets.
Le Recorder DOIT stripper ces éléments de `ctx` (deny-list intégrée).

**Pas d'IP obligatoire, off par défaut.** Le provider n'étant appelé que
serveur-à-serveur par le proxy (§1, §3), toute IP vue = celle du **proxy**,
pas de l'utilisateur. Si présente, elle DOIT être documentée comme « adresse
de l'appelant immédiat (proxy) », jamais « utilisateur ». Aucun `userId` :
seule existe l'identité pseudonyme `sub`.

### 10.3 Visibilité & redaction par audience

- `security` → `visibility: control-plane` **uniquement**. Jamais exposé à un
  tenant (fuiterait d'autres tenants / des patterns d'attaque).
- `audit` → `control-plane` ; vue tenant éventuelle = **redacted**.
- `request` → `both`.

L'API de lecture tenant DOIT, **par construction**, ne renvoyer que les
enregistrements `tenantId == caller` ET `visibility != control-plane`, avec
**redaction par champ** (strip `iss`/identifiants d'autres tenants, `ctx`
interne type `kid`). Le superadmin voit le brut.

### 10.4 Durabilité scindée (non standardisée mais contrainte)

- `audit` : **synchrone, durable, immuable** (déjà §8). Perte = violation.
- `security` / `request` : **asynchrone best-effort**, rétention bornée,
  échantillonnage permis. Émission **non bloquante** sur le hot path.

### 10.5 Endpoints de récupération

Partie du contrat **figé** (donc dans les OpenAPI générés, §9) :

| Endpoint | Plan | `role` | Périmètre |
| --- | --- | --- | --- |
| `/admin/logs` | 1 | `control-plane` | tous tenants, tous `kind`, **brut**. Filtres `tenantId`/`kind`/`level`/temps. |
| `/tenant/logs` | 2 | `tenant` | `tenantId` **dérivé du token** (jamais passé en paramètre, §4.7/§5), **redacted** (§10.3). |

Les deux : query-only (§3), **pagination bornée obligatoire** (pas de dump),
soumis au middleware auth/plan (§4.5/§4.7). Une demande d'effacement
(§Hors-scope #9) DOIT aussi purger le `sub` des logs.

---

## 11 — Configuration tenant

### 11.1 Modèle (3 couches)

Un tenant porte trois couches de données :

- **Identité** (SDK) : `tenantId`, `issuer`, `status`. Stockée dans
  `TenantRegistry`, écrite via §8.
- **Méta libre** (SDK) : `displayName?`, `plan?`. Mêmes endpoints, opaque
  pour la logique SDK.
- **Config métier** (provider) : tout ce qui est propre au métier du
  provider (carriers d'un delivery, devises d'un payment, etc.). Stockée
  par le provider, jamais par le SDK.

### 11.2 Auto-discovery du schéma

Le provider PEUT exposer un schéma de sa config métier à
`GET /openapi.tenant-config.json` (control-plane gated, miroir de §9). Si le
provider n'a pas de config (toy / passthrough), il n'expose pas l'endpoint
et le hub considère « pas d'UI de config ».

Format : **JSON Schema Draft 2020-12** enveloppé d'un champ `version: "X.Y"`.
Vocabulaire `x-*` standardisé pour les hints UI : `x-widget`, `x-writable-by`,
`x-group` (la liste complète est documentée dans `_sdk.md`).

Le hub fetch ce schéma à l'import du tenant-provisioner, le cache, le re-fetch
à chaque major bump (cf. §11.6).

### 11.3 Wire

Le SDK accepte un champ optionnel `providerConfig?: unknown` dans :

- le body de `POST /admin/tenants` (provisioning initial)
- le body de `PATCH /admin/tenants?tenantId=` (update ultérieur)

Le SDK valide `providerConfig` contre le zod schema du provider AVANT
d'appeler `onProvision` / `onUpdate`, puis persiste via le
`TenantConfigStore` injecté APRÈS le hook OK (ordering transactionnel).
Le hook reçoit la valeur validée mais N'A PAS à la stocker — le SDK le
fait.

`TenantState` n'est PAS étendu — `providerConfig` est donnée provider,
elle reste dans le store du provider (séparée du registry SDK). La
représentation SDK du tenant reste canonique entre providers (cf. §9).

Trois endpoints sont auto-mountés par le SDK dès que le provider passe un
`tenantConfig` à `createProvider` :

| Endpoint                              | Rôle / scope     | Filtre `writeOnly` |
| :--- | :--- | :-: |
| `GET /admin/config?tenantId=X`        | control-plane    | non (CP voit tout) |
| `GET /tenant/config`                  | tenant + tenant scope (pas `user`) | oui |
| `PATCH /tenant/config`                | tenant + tenant scope (pas `user`) | oui (réponse) |

Aucun de ces endpoints n'a à être écrit par le provider — c'est de la
plomberie 100 % SDK.

### 11.4 Rôles & permissions

- **`control-plane`** (hub via `/admin/tenants` ou `/admin/config`) :
  peut LIRE et ÉCRIRE **tout champ** du schéma, y compris `writeOnly`.
  Pas de restriction.
- **`tenant`** scope `tenant` (via `/tenant/config`) : peut écrire les
  champs dont `x-writable-by` inclut `"tenant"` (défaut implicite tous,
  sauf override `x-writable-by: ["control-plane"]`). Lit la config avec
  filtrage `writeOnly`.
- **`tenant`** scope `user` (avec `sub`) : **aucune écriture**, aucune
  lecture. Le SDK rejette via le helper `requireTenantScope` (401).

Le SDK enforce ces règles automatiquement dans les handlers auto-mountés.

### 11.5 Champs sensibles

Le vocabulaire JSON Schema natif `writeOnly: true` signale qu'un champ ne
doit JAMAIS être retourné en lecture par le scope tenant. Le SDK filtre
automatiquement dans les réponses de `GET /tenant/config` et `PATCH
/tenant/config`. Le `GET /admin/config` (CP) ne filtre PAS — le central
voit toujours tout, c'est son rôle.

### 11.6 Versioning du schéma

- **Version mineure** (`1.0 → 1.1`) : additif compatible (nouveau champ
  optionnel uniquement). Hub re-fetch sans bloquer.
- **Version majeure** (`1.0 → 2.0`) : breaking. Hub DOIT re-fetcher, le
  cache invalidé, et REFUSER toute update jusqu'à migration explicite du
  client.

La cohabitation de versions n'est pas standardisée en v1.

### 11.7 Champs conditionnels (`x-visible-if`)

UI-only — n'affecte **pas** la validation. Un champ visible ou pas reste
validé par le schéma de la même façon. C'est le renderer du hub qui décide
de masquer/montrer ; le serveur ne gate rien là-dessus.

**Vocabulaire d'opérateurs (v1)** — AND implicite entre les clés, 4 prédicats
par valeur :

| Forme | Évaluation |
| :--- | :--- |
| `{ field: value }` | `currentValues[field] === value` |
| `{ field: { contains: x } }` | `Array.isArray(v) ? v.includes(x) : (typeof v === "string" && v.includes(x))` |
| `{ field: { in: [v1,v2] } }` | `[v1, v2].includes(currentValues[field])` |
| `{ field: { truthy: bool } }` | `Boolean(currentValues[field]) === bool` |

Opérateur inconnu → fail-closed (champ masqué). C'est volontaire : on
préfère cacher un champ qu'en exposer un sensible parce qu'on n'a pas
compris la clause.

Le SDK fournit `isVisible(fieldName, currentValues, schema)` que le hub
appelle à chaque re-render. Le provider n'a rien à coder.

### 11.8 Hors périmètre v1

- **Options dynamiques** (`x-options-source` — enums fetched depuis un
  endpoint runtime) : nom réservé, comportement non standardisé.
- **OR explicite** entre clauses (`x-visible-if: [...]`) : v1 ne supporte
  que l'AND implicite ; ajouter quand un cas réel apparaît.

---

## Annexe — décisions d'architecture figées

- **Id opaque (`sub`)** : **broker pluggable** au choix du déploiement
  (pairwise PPID d'un IdP comme Keycloak, table de mapping aléatoire, ou
  autre). Le contrat impose uniquement les **propriétés** (stable par couple,
  non corrélable entre providers, non réversible — cf. §4.2). Cache proxy
  agressif ; impact perf limité à la 1ʳᵉ requête d'un couple.
- **Émetteur** : pas d'émetteur global partagé. La clé propre de chaque
  instance CMS est l'identité du tenant ; un métadocument RFC 8414 par
  instance. Pas de claim `tenant` : tout passe par l'`iss`.
- **Découverte** : convention standard RFC 8414
  (`/.well-known/oauth-authorization-server`), `jwks_uri` découvert (jamais
  codé en dur), JWKS fetché dynamiquement (issuer allowlisté, clés non pinées).
- **Identité user** : uniquement le `sub` vérifié du JWT. Aucun en-tête
  d'identité alternatif (pas de `X-USER-ID`).
- **Machine-to-machine** : c'est la couche tenant (§4.1), pas un mécanisme
  séparé.
- **Pas de path params** : volontaire, sur **tous les plans** (inutile,
  rewrite proxy déterministe, un seul modèle mental).
- **Trois plans** : superadmin / tenant-admin / consommation, distingués par
  préfixe + `role` de l'`iss` (§1.1, §4.7).
- **Plan superadmin figé** : contrat identique pour tous → le central a **un
  seul client générique** ; spécificité provider uniquement plans 2 & 3.
- **Hub = control-plane** : le central est un `iss` `role: control-plane`,
  pas de secret admin statique.
- **OpenAPI** : 3 documents séparés (`/openapi.json`, `.tenant.json`,
  `.admin.json`), pas de tags ; admin non divulgué aux tenants.
- **Multi-tenant** : déploiement partagé unique, isolation logique, jamais
  process-per-tenant. (Quotas/rate-limits : hors périmètre pour l'instant.)
- **Déprovisionnement** : politique par défaut décidée par le provider
  (annoncée dans `/openapi.admin.json`), `force=true` pour purge immédiate.
- **Conformité = code partagé** : les parties identiques et critiques (§4.4,
  §4.5, §4.7, §6, §8, mount) ne sont **pas** réimplémentées par provider —
  elles vivent dans le package `_sdk` ([`_sdk.md`](_sdk.md)), point de
  contrôle unique versionné. Un provider = domaine (plans 2/3) + hooks.
- **Découplage système** : le provider n'est lié à **aucun** système précis.
  La confiance = allowlist d'`iss` + RFC 8414. Tout émetteur honorant §4.8
  peut être tenant (le CMS+proxy n'est qu'un émetteur parmi d'autres
  possibles). `_sdk` NE DOIT PAS dépendre du CMS/proxy.
- **Obligations émetteur (§4.8)** : `sub` pairwise, TTL court, `jti` unique,
  clé suivante publiée avant signature, métadoc conforme, tenant provisionné.
  Non vérifiable côté provider → normatif.
- **Anti-SSRF** : `jwks_uri`/`issuer` du métadoc DOIVENT être same-origin que
  l'`iss` ; sinon rejet + log.
- **Versionnement du contrat** : `tenant_provisioner_contract_version` dans le métadoc RFC
  8414 ; provider rejette une version incompatible (négociation explicite,
  distincte de la version du package `_sdk`).
- **Révocation bornée** : état tenant relu par requête, cache TTL court ;
  `suspend`/`update` effectif en ≤ 1 TTL (non instantané, mais borné).
- **Statuts** : `403` (suspend / plan refusé), `401` (auth) — RFC 7807.
- **Audit control-plane** : actions `/admin/tenants` journalisées de façon
  immuable — c'est le `kind: audit` du système de logs §10.
- **Logs standardisés (§10)** : émission + `LogRecord` + catalogue
  d'événements versionné figés par le SDK ; `level`×`kind` 2 axes non
  extensibles ; visibilité par audience + redaction ; durabilité scindée
  (audit sync/immuable, security/request async/best-effort) ; backend/
  rétention **non** standardisés. Endpoints `/admin/logs` (brut, tous) &
  `/tenant/logs` (dérivé du token, redacted). **Pas d'IP obligatoire**
  (serveur-à-serveur → IP = proxy) ; pas de `userId` (seul `sub`
  pseudonyme) ; jamais de token/secret loggé.
- **Pas de CORS** : appels serveur-à-serveur uniquement.
- **Direction B (proxy → provider)** : **TLS serveur simple (CA publique)**
  retenu **sciemment**. Risque résiduel **accepté** : usurpation par
  takeover de domaine ou CA compromise (un imposteur ne peut pas rejouer le
  JWT ailleurs — `aud` + `exp` + `jti` — le risque est la fuite/falsification
  des données échangées). Le **SPKI/cert pinning** (épinglage de la clé
  feuille avec rotation distribuée par le hub, ou épinglage de la CA
  émettrice) a été étudié et **différé volontairement**, pas oublié — option
  de durcissement connue si le modèle de menace évolue.

---

## Hors scope — à trancher plus tard

Identifiés, **volontairement non spécifiés** pour l'instant (à ne pas prendre
pour des oublis) :

- **Effacement par utilisateur (RGPD / droit à l'oubli)** : `sub` est
  pseudonyme par provider ; aucun chemin « forget `sub` » n'existe aujourd'hui.
  À ajouter au control-plane ou à acter explicitement comme géré ailleurs.
  **Inclut la purge du `sub` dans les logs §10** (audit/request/security) —
  l'effacement n'est pas complet s'il ne couvre pas les logs.
- **Lien OpenAPI plan 3 ↔ génération proxy** : ce que `/openapi.json` doit
  déclarer (schéma d'auth bearer, `servers`, …) pour que la génération nginx
  de l'importer soit déterministe n'est pas encore spécifié.
