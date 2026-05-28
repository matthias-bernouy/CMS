# Résumé — Mail / paiement / interfaces de domaine

> Source : conversation 2026-05-28. Suite directe du plan data-providers (`.agents/data-providers/plan.md`).
> Statut : **brainstorm fixé**, à transformer en spec normative quand les Couches 1+2 seront branchées.

---

## 1. Question de départ

> "Rendre le setup mail + paiement directement dans le core du CMS, bonne ou mauvaise idée ?"

Mauvaise idée si "dans le core" = **implémentation Stripe/Mailgun en dur**. Couple le core à un fournisseur, duplique la plomberie data-provider en cours de construction, casse l'interchangeabilité par tenant.

Bonne idée si "dans le core" = **les contrats normatifs (interfaces)**, pas les adapters. Le core définit `payment@1.0`, `mail@1.0` ; Stripe / PayPal / Mailgun sont des data-providers externes qui *implémentent* ces interfaces.

C'est le pattern **ports & adapters** (Spring `JavaMailSender`, AWS SDK abstr., etc.).

## 2. Les trois couches

| Couche | Direction | Sert à | Statut v1 |
| --- | --- | --- | --- |
| **1. Generic data-provider** | CMS → DP (entrant côté DP) | Découverte, auth, capabilities, affichage générique. C'est le contrat data-provider en cours. | **Cible v1** |
| **2. Domain interfaces** | CMS → DP typé | Le CMS appelle `cms.payment.charge()` depuis ses blocs/admin sans savoir quel vendor. | **Cible v1** |
| **3. Inter-provider broker** | DP → CMS → autre DP | Un DP (ex. e-commerce) appelle un autre DP (ex. payment) via le CMS, sans connaître l'implémentation. | **Reporté** |

### 2.1 Couche 2 — Domain interfaces

- Le core définit une liste figée de concepts qu'il connaît : `payment@1.0`, `mail@1.0`, `storage@1.0`, `auth@1.0`.
- Chaque concept = fragment OpenAPI versionné + types TS. `operationId` et schémas figés (`POST /charge`, `POST /refund`, `GET /transactions/{id}`, etc.).
- Un provider Stripe :
  - reste un data-provider Couche 1 (OpenAPI, JWT, capabilities) ;
  - déclare dans son discovery `x-cms-implements: ["payment@1.0"]` ;
  - son OpenAPI conforme au fragment normatif (le CMS valide à l'import).
- Le code CMS écrit `cms.payment.charge(...)` ; le proxy résout l'adapter configuré pour le tenant.
- **Ce qui vit dans le core** : interfaces + client typé + validation de conformité à l'import.
- **Ce qui vit dehors** : les adapters Stripe / PayPal / Mailgun / Resend / S3 / Keycloak.

### 2.2 Couche 3 — Inter-provider broker (reporté)

Cas d'usage : un data-provider e-commerce déclare `x-cms-requires: [payment@1.0, mail@1.0]`. À l'exécution, il fait un appel sortant `POST {cmsUrl}/services/payment/charge`. Le CMS :

1. Vérifie l'identité du DP appelant (JWT entrant, signé par le DP).
2. Vérifie sa capability "peut appeler `payment.charge`".
3. Résout quel provider est configuré pour ce tenant.
4. Mint un JWT pour ce provider, mappe `payment@1.0` → OpenAPI réel.
5. Forwarde, log, retourne.

Implications :
- **Identité sortante** par DP (paire de clés, JWKS publié par le DP). Le `_issuer-kit` qu'on allait jeter retrouve un usage.
- **Délégation** : propager le contexte (tenant, user) du DP appelant vers le DP appelé. Token-exchange (RFC 8693).
- **Mapping** entre interface normative et OpenAPI réel de l'adapter.

C'est un service mesh vertical intégré au CMS. Gros bénéfice **si** plusieurs DPs se composent ; over-kill sinon.

## 3. Décision d'orchestration (à trancher quand un vrai cas e-commerce arrive)

Avant d'implémenter la Couche 3, choisir qui orchestre la commande :

- **Option A — Frontend orchestre** : le site appelle e-commerce DP pour le panier, puis `cms.payment.charge()` (Couche 2), puis dit à l'e-commerce DP "commande confirmée". Pas besoin de Couche 3. Logique business moitié dans le site, moitié dans le DP.
- **Option B — DP orchestre** : l'e-commerce DP pilote tout. Le site appelle `POST /checkout`, le DP fait payment + mail + état. Besoin de Couche 3. Plus propre business, mais infra broker à construire.

## 4. Décisions actées

- **Mail et paiement ne sont PAS implémentés dans le core.** Le core porte les interfaces (`payment@1.0`, `mail@1.0`), pas les adapters.
- **Couches 1 + 2 en v1.** Mail et paiement seront les *premiers vrais data-providers branchés* — ça force le pattern à être utilisable et évite la duplication.
- **Couche 3 reportée.** Pas dans le contrat v1, à décider sur un cas concret. Mais espace de design réservé :
  - L'identité sortante d'un DP (paire de clés, JWKS publié) doit rester possible.
  - Les interfaces Couche 2 (`payment@1.0`, etc.) serviront tel quel à la Couche 3 quand elle arrivera.

## 5. Impact sur le plan data-providers existant

Ajouts à intégrer dans `.agents/data-providers/plan.md` :

- **Nouveau stage** entre Stage 4 (proxy) et Stage 5 (migrer exemples) : *"Domain interfaces (`payment`, `mail`, `storage`, `auth`)"*.
  - Définir les fragments OpenAPI normatifs.
  - Helper `cms.payment.charge()` etc. côté Control / Delivery.
  - Validation `x-cms-implements` à l'import.
- **Premiers data-providers réels à brancher** : un Stripe-adapter et un Mailgun/Resend-adapter, comme exemples canoniques (remplacent ou complètent `addresses` / `notes`).
- **Couche 3** : noter "hors v1, espace réservé" dans le `base.md` normatif (§ "Hors scope") pour ne pas le perdre.
