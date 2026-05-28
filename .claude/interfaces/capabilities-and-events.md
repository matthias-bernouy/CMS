# Capabilities & Events — récap

> Source : conversation 2026-05-28. Consolide les brainstorms sur (1) un registre de capabilities + événements, (2) le débat sur les capabilities dynamiques vs auth mode.
> Statut : **concept réservé**, **non implémenté en v1**. À matérialiser dans le contrat data-provider et à coder quand un vrai cas le justifie.

---

## 1. Position normative

> **CMS capabilities are coarse-grained gatekeeping. Resource-level authorization remains the provider's responsibility.**

À placer telle quelle en tête de la section authz du `.agents/data-providers/base.md`. Elle évite 80 % des dérives de design en une phrase.

Conséquences directes :
- Le CMS gate les *catégories d'action* (`cart:read`, `payment:refund`).
- Le DP gate les *ressources spécifiques* (`cart.ownerSub == sub`).
- **Pas de capabilities dynamiques type `cart:read:100011`** côté CMS — voir §6.

## 2. Le modèle à deux axes

Un endpoint déclare **deux propriétés orthogonales** :

### Axe A — `x-cms-auth.mode`

| Mode | `sub` | Sens |
| --- | --- | --- |
| `anonymous` | absent | Public. Pas de session requise. |
| `user` | présent, type user | End-user authentifié. Le DP applique le row-level. |
| `admin` | présent, type admin CMS | Caller est un admin du CMS. |
| `system` | absent | Identité machine de confiance (CMS lui-même, autre DP via Couche 3, scheduler). |

### Axe B — `x-cms-capabilities` (optionnel)

Liste de capability slugs requis. Flat strings, statiques, role-level :

```yaml
x-cms-capabilities:
  - cart:read
  - cart:read-any
```

Pas d'id de ressource dans le slug. Pas de paramètres. Si tu veux exprimer "admin voit tout, user voit le sien", crée **deux capabilities** (`cart:read` et `cart:read-any`).

### Combinaisons typiques

```yaml
# Endpoint public
x-cms-auth: { mode: anonymous }
x-cms-capabilities: []

# /me/cart — user authentifié, DP fait tout le reste
x-cms-auth: { mode: user }
x-cms-capabilities: []

# Liste de carts pour un rôle support — capability requise
x-cms-auth: { mode: user }
x-cms-capabilities: [cart:read]

# Admin only
x-cms-auth: { mode: admin }
x-cms-capabilities: [provider:manage]

# Cron / webhook entrant CMS → DP
x-cms-auth: { mode: system }
x-cms-capabilities: [sync:run]
```

**Décision clé** : forcer une capability quand il n'y a pas de distinction de rôle à enforce (`/me/cart`) = theater. Le mode `user` seul suffit.

## 3. Registre des capabilities

Le CMS porte un **registre unique** des capabilities. Chaque entrée :

| Champ | Sens |
| --- | --- |
| `id` | Slug (`storage:write`). |
| `description` | Texte lisible pour l'UI consent. |
| `producer` | `built-in` (le CMS) ou `dp:<providerId>` (un DP qui l'expose). |
| `scope` | `per-tenant` / `per-user` / `global`. |
| `status` | `available` / `unavailable` (selon que l'impl est branchée). |

Le registre est **extensible par les DPs** via `x-cms-provides.capabilities` (cf. §5). Un DP `translation` peut déclarer `translate:translate` ; d'autres DPs peuvent ensuite le requérir.

Conséquence : le catalogue devient un graphe producteurs ↔ consommateurs.

## 4. Registre des événements

Même modèle, parallèle :

| Champ | Sens |
| --- | --- |
| `id` | Slug (`file.uploaded`, `order.completed`). |
| `schemaRef` | Référence vers le schéma du payload (JSON Schema). |
| `publisher` | `built-in` ou `dp:<providerId>`. |
| `subscribers` | DPs qui ont demandé et obtenu le grant. |

Évènements built-in candidats (à figer au moment de l'impl) : `tenant.created`, `user.created`, `file.uploaded`, `provider.imported`, `provider.revoked`.

## 5. Manifest côté DP

Un DP déclare dans son discovery :

```yaml
x-cms-requires:
  capabilities:
    - id: storage:write
      reason: "Stockage des pièces jointes des formulaires de contact"
      scope: per-tenant
    - id: mail:send
      reason: "Confirmation de soumission au visiteur"
  events:
    - id: file.uploaded
      reason: "Lance le scan antivirus"

x-cms-provides:
  capabilities:
    - id: forms:submit
      description: "Soumet un formulaire"
  events:
    - id: form.submitted
      schemaRef: "#/components/schemas/FormSubmittedEvent"
```

Le `reason` est obligatoire — c'est ce que l'admin verra dans l'UI consent. Un DP qui ne le fournit pas est rejeté à l'import.

## 6. Pourquoi pas de capabilities dynamiques en v1

Tenté : `cart:read:100011`. **Dead end.**

- Le catalogue explose (une entrée par ressource), imbuvable côté UI consent.
- Le CMS doit connaître l'existence de la ressource → couplage métier.
- Cache invalidation cauchemardesque (auto-grant aux nouvelles ressources ? sur quelle règle ?).
- Réinvention de XACML / Zanzibar en strings, sans les garanties.

Seul AWS IAM resource ARNs fait ça réellement, dans des **policies pré-écrites**, pas dans des scopes JWT request-time. Différent.

**Si jamais ça devient nécessaire un jour**, la piste est un système de *templates* (`cart:read:{cartId}` avec resolver de params), pas une liste infinie. Mais ça implique : resolver runtime, stockage des grants dynamiques, UI plus complexe, risque de fuite métier dans le CMS. **Hors v1.**

## 7. Flow de consentement à l'import

À l'import d'un DP, l'UI CMS affiche :

> Ce data-provider demande :
> - 🔓 **storage:write** — *"Stockage des pièces jointes des formulaires de contact"*
> - 🔓 **mail:send** — *"Confirmation de soumission au visiteur"*
> - 📡 Écouter `file.uploaded` — *"Lance le scan antivirus"*
>
> Il fournit en échange :
> - 🛠️ Capability `forms:submit`
> - 📤 Événement `form.submitted`
>
> [Approuver tout] [Refuser tout] [Personnaliser]

Chaque grant stocké dans la DB CMS : `{ dpId, capability|event, scope, grantedBy, grantedAt }`. Révocable depuis la settings page du DP.

Aligné UX avec OAuth consent screen (familier), **pas le protocole OAuth** (cf. §10).

## 8. Runtime enforcement

### Capability call (Couche 3 — DP → CMS → autre DP)

1. DP appelle `POST {cmsUrl}/services/payment/charge` avec son JWT signé.
2. CMS vérifie l'identité du DP appelant (JWKS).
3. CMS vérifie le grant : `dpId` a-t-il `payment:charge` ?
4. CMS résout le provider configuré pour `payment@1.0` sur ce tenant.
5. CMS mint un JWT pour le provider cible, mappe l'opération, forwarde.
6. Log d'accès.

### Event delivery

1. Émission interne (`emit("file.uploaded", payload)`).
2. CMS lookup les subscribers actifs pour cet event.
3. Pour chaque subscriber : signe le payload, POST vers son webhook endpoint.
4. Retry avec backoff + idempotency key (cf. question ouverte §11).
5. Log de livraison.

## 9. Forme du JWT

Minimaliste :

```json
{
  "iss": "https://cms.example",
  "aud": "cart-provider",
  "sub": "pairwise-opaque-user-id",
  "cap": ["cart:read"],
  "iat": ...,
  "exp": ...,
  "jti": "..."
}
```

**Pas de `ctx.scope` ni de `mode` explicite.** Le mode se dérive :
- pas de `sub` + `iss=cms` → `system`
- `sub` type admin → `admin`
- `sub` type user → `user`
- pas de token → `anonymous`

Mettre `mode` en clair dans le token = redondant + invite à le falsifier ou le surcharger.

L'array `cap` est computée au moment du mint à partir du grant `rôle → capabilities` côté CMS.

## 10. Pourquoi pas OAuth comme protocole

J'emprunte à OAuth deux choses :
- La **notation scope** (strings plates `resource:action`).
- L'**UX du consent screen** (familière, lisible).

Je rejette OAuth comme **protocole** :
- Conçu pour la confiance tierce-partie (3 parties qui ne se connaissent pas) — chez toi, les DPs sont pré-enregistrés explicitement par un admin.
- Redirect flows, PKCE, authorization code grant — inutiles en server-to-server.
- Dynamic client registration, token endpoints, refresh tokens — machinerie pour un écosystème ouvert.
- End-user consent — chez toi c'est l'admin qui consent au nom de l'instance.

Tu as déjà ton propre JWT mint dans `cms-data-provider-sdk`. Empiler OAuth = +80 % de complexité, 0 % de bénéfice.

## 11. Questions ouvertes

1. **Granularité scope** : per-tenant uniquement, ou global (un DP grant valable cross-tenant) ? Vote : **per-tenant**, alignement avec l'isolation tenant générale.
2. **Events push vs pull** : push (webhook signé) classique, simple côté DP mais complexe côté CMS (retry, DLQ, idempotency, ordering). Pull (DP appelle `GET /events?since=cursor`) plus robuste mais polling. Vote initial : **push avec retry + idempotency key**, mais décision à part entière.
3. **`admin` mode en impl** : si pool unique de users avec rôle admin (cf. `user-auth-architecture`), `mode: admin` ≡ capability built-in `cms:admin`. À acter au code, pas dans le contrat.
4. **`system` mode portée** : seulement le CMS, ou n'importe quelle identité machine de confiance (autre DP via Couche 3) ? Vote : **identité machine en général**, prépare la Couche 3.
5. **Reason obligatoire** : rejette-t-on un DP qui n'en fournit pas, ou on tolère avec un placeholder ? Vote : rejet, ça force la qualité du consent screen.

## 12. Hors scope v1

- Implémentation du registre lui-même (catalog + UI).
- Flow de consentement et stockage des grants.
- Runtime enforcement Couche 3 (DP → CMS → autre DP).
- Webhook delivery (signature + retry + DLQ).
- Capability templates dynamiques.
- Cross-tenant grants.

**Ce qu'on fait dès maintenant** (peu de code, bonne posture) :
- Réserver les clés de manifest `x-cms-requires.{capabilities,events}` et `x-cms-provides.{capabilities,events}` dans la spec data-provider — aucune impl, juste "ces champs sont à toi, ne les utilise pas pour autre chose".
- Documenter le concept dans ce fichier.
- Convenir que `payment@1.0`, `mail@1.0`, futur `storage@1.0` seront *exprimés comme capabilities* dans ce futur registre — pas un système parallèle.

## 13. Impact sur les autres docs

- `.agents/data-providers/plan.md` : ajouter en "Hors scope v1 / espace réservé" : registre capabilities + events, manifest `x-cms-requires` / `x-cms-provides`, consent flow.
- Futur `.agents/data-providers/base.md` : ouvrir la section authz par la phrase normative §1, ajouter §2 (modèle deux axes), réserver §x pour les manifests futurs.
- `.claude/interfaces/resume.md` (mail/paiement) : la Couche 3 décrite là-bas s'articule directement sur ce registre — `payment@1.0` sera une capability built-in du CMS portée par l'adapter configuré.
- `.claude/interfaces/storage.md` : `storage@1.0` aussi, le jour où il devient une interface Couche 2.
