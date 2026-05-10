# Déploiement bernouy.com — runbook global

Orchestration de bout en bout pour redéployer le cluster sur les 4
domaines :

| Domaine | Image | VPS |
|---|---|---|
| `auth.bernouy.com` | `bernouy/auth` (+ sibling `postgres:16-alpine`) | auth box |
| `cdn-origin.bernouy.com` | `bernouy/cdn-origin` | origin (1 box) |
| `cdn.bernouy.com` (round-robin) | `bernouy/cdn-edge` | N edges |
| `cdn-edge.bernouy.com` (SSH/admin host) | (alias DNS sur 1 edge) | edge VPS |
| `cms.bernouy.com` | `bernouy/cms-control-mt` | cms box |

> **Contexte** : déploiement « test en conditions réelles ». Tous les
> secrets sont à régénérer. Chaque DEPLOY.md détaillé est dans
> `docker/<image>/DEPLOY.md` ; ce document fixe l'ordre + les couplages
> entre services.

---

## Pré-requis transverses

### 0. OVHcloud Secret Manager (OKMS) — source unique des secrets

**Tous** les secrets et la config publique (sauf 5 vars de bootstrap)
vivent dans un OKMS domain. Chaque container fait un `mTLS GET` au boot
(via `docker/_shared/okms-fetch.sh`) qui pull un bundle KV2 et l'exporte
en env vars avant de chaîner sur le service entrypoint.

> **Important** : OVHcloud impose **3 entités IAM distinctes** par
> service (compte de service + access certificate + policy) avant que
> le mTLS ne fonctionne. Suivre les §0.1→0.6 dans l'ordre — sauter une
> étape provoque silencieusement un `bad certificate` au TLS handshake
> ou un `404` sur le path du secret. Cf. §Troubleshooting OKMS en bas
> de ce doc pour les erreurs courantes.

#### 0.1. Provisionner UN OKMS domain

Manager → Identity & Security → Secret Manager → Create domain. Choisir
la région (ex. `eu-west-rbx`, `eu-west-par`). **La région doit matcher
celle qu'on mettra dans `OKMS_REGION`** — sinon le serveur OVH refuse
le cert au TLS handshake (le cert est signé pour un datacenter précis).

Note l'**UUID** du domain + la **région**.

> Le Manager affiche aussi un endpoint en `<region>.okms.ovh.net:5696`
> — c'est le port **KMIP** pour les opérations crypto. L'API REST
> (Vault-compatible) qu'utilise `okms-fetch` est sur le **:443** du
> même hostname.

#### 0.2. Créer un compte de service par service

Manager → IAM/Sécurité → Identités et gestion des accès → onglet
**Comptes de service** → "Ajouter un compte de service". Un par service :

| Compte de service | Pour |
|---|---|
| `auth` | Keycloak self-hosted |
| `cdn-origin` | l'origin |
| `cms-control-mt` | le CMS multi-tenant |
| `cdn-edge-<edge-id>` | un par edge — **un par VPS edge** |

> Le compte de service est l'**identité IAM** à laquelle on bind le cert
> mTLS. L'URN qui s'affiche peut contenir le mot `oauth2` (legacy
> naming OVH), c'est sans importance — c'est bien une identité utilisable
> pour mTLS OKMS.

#### 0.3. Générer un access certificate par compte de service

Manager → Secret Manager → ton domain OKMS → onglet **Certificats
d'accès** → "Générer un certificat" → sélectionner le compte de service
correspondant. OVH affiche **une seule fois** le cert (`.pem`) et la
clé privée (`.pem`) — télécharger les 2 immédiatement.

> Le bouton "Générer" REQUIERT de sélectionner une identité existante
> (compte de service, user, ou groupe). C'est pour ça qu'on crée le
> compte de service en §0.2 d'abord.

#### 0.4. Attacher une policy IAM au compte de service

Manager → IAM/Sécurité → Identités et gestion des accès → onglet
**Politiques** → "Ajouter une politique".

| Champ | Valeur |
|---|---|
| Nom | `okms-<service>-read` (e.g. `okms-auth-read`) |
| Identités | Cocher le compte de service du §0.2 |
| Type de produit | `Key Management Service & Secret Manager (OKMS)` |
| Ressources | (vide — applique à toutes ressources OKMS) |
| Actions | `okms:secret:get` + `okms:secret:list` (ou `okms:*` pour le test) |

> **Sans policy, OVH refuse le cert au TLS handshake** — pas une 403
> HTTP, mais un `bad certificate` au niveau TLS. C'est le piège #1 du
> setup OKMS. Compter 30-60s de propagation après save.

#### 0.5. Provisionner les bundles KV2 (un par service)

Manager → Secret Manager → ton domain OKMS → onglet **Secrets** → "Ajouter
un secret" → Type **Clé/valeur (KV2)**.

| Path du secret (suggéré) | Pour |
|---|---|
| `prod/auth/config` | Keycloak self-hosted |
| `prod/cdn-origin/config` | origin |
| `prod/cms-control-mt/config` | CMS multi-tenant |
| `prod/cdn-edge/<edge-id>/config` | un par edge |

> Le path est libre (tu peux ajouter un namespace `prod/`, `staging/`,
> etc.). Ce qui compte c'est que `OKMS_SECRET_PREFIX` du §0.6 contienne
> exactement la même valeur (path complet, sans `/` final).

Le détail des clés à mettre dans chaque bundle est dans le DEPLOY.md
du service correspondant (§3 ou §5).

#### 0.6. Sur chaque VPS host : cert + key + bootstrap.env

```bash
# Adapter le SERVICE_DIR : /etc/auth, /etc/cdn, /etc/cms-mt, /etc/cdn-edge
SERVICE_DIR=/etc/auth

sudo install -d -m 0700 -o root -g root ${SERVICE_DIR}/okms
sudo install -m 0600 -o root -g root /dev/null ${SERVICE_DIR}/okms/client.crt
sudo install -m 0400 -o root -g root /dev/null ${SERVICE_DIR}/okms/client.key
# paste cert PEM (§0.3) puis key PEM
sudo nano ${SERVICE_DIR}/okms/client.crt
sudo nano ${SERVICE_DIR}/okms/client.key
sudo chmod 0600 ${SERVICE_DIR}/okms/client.crt
sudo chmod 0400 ${SERVICE_DIR}/okms/client.key

sudo install -m 0600 -o root -g root /dev/null ${SERVICE_DIR}/bootstrap.env
sudo nano ${SERVICE_DIR}/bootstrap.env
```

Contenu de `bootstrap.env` (5 vars) :

```
OKMS_REGION=eu-west-rbx
OKMS_DOMAIN_ID=<uuid-du-domain-§0.1>
OKMS_CERT_PATH=/etc/okms/client.crt    # path DANS le container, pas sur l'host
OKMS_KEY_PATH=/etc/okms/client.key
OKMS_SECRET_PREFIX=prod/auth/config    # path COMPLET du secret (cf. §0.5)
```

> **`OKMS_SECRET_PREFIX` = path complet du secret** (e.g.
> `prod/auth/config`), **pas** un préfixe court. Le script
> `okms-fetch.sh` ne fait plus d'auto-append.

### 1. Keycloak (self-hosted via `bernouy/auth`)

Déployer **en premier** dans la chaîne — cdn-origin et cms-control-mt
s'authentifient contre lui. Cf. [`auth/DEPLOY.md`](auth/DEPLOY.md).

Une fois Keycloak up, 3 clients OIDC à provisionner via l'admin UI
**avant** de booter les services consommateurs :

| Realm/Client | Pour | Ref |
|---|---|---|
| `cdn` realm, client `cdn-origin` | admin cdn-origin | auth/DEPLOY §8a |
| `platform` realm, client `cms-superadmin` | admin cms-control-mt | auth/DEPLOY §8b |
| (par tenant) `<tenant>` realm, client `cms` + `cms-cli` | admin tenant CMS | cms-control-mt DEPLOY §9 |

Chaque client secret généré à l'UI doit être recopié dans le bundle
OKMS du service consommateur **avant** de le booter (sinon le service
exit fatal au boot, KEYCLOAK_CLIENT_SECRET requis).

### 2. MongoDB externe (Atlas ou self-hosted)

**Une seule** instance. Crée 2 databases :
- `cdn` — partagé entre cdn-origin et cdn-buckets (mêmes collections,
  même KEK).
- `mt-cms` — pour cms-control-mt (collections `tenants`, `tenant_<id>__*`).

User dédié par DB recommandé.

### 3. KEK (envelope encryption key)

**Une seule** valeur pour tout le cluster CDN. Génère :

```bash
openssl rand -base64 32
```

Stocker dans le bundle OKMS `cdn-origin/config` sous la clé
`CDN_BUCKETS_KEK`. **Nulle part ailleurs** (cms-control-mt et cdn-edge
n'en ont pas besoin — l'encryption est server-side dans cdn-origin
via `MongoBucketProxyRepository`).

Si tu redéploies à zéro avec un **nouveau** KEK : la collection
`bucket_proxies` existante devient illisible. Soit tu purges la
collection (re-saisir tous les Data Providers via les admins CMS),
soit tu réutilises le KEK existant.

### 4. DNS records

Tous en TTL=300 pour pouvoir bouger vite.

| Record | Type | Cible |
|---|---|---|
| `cms.bernouy.com` | A | `<ip-cms-vps>` |
| `cdn-origin.bernouy.com` | A | `<ip-origin-vps>` |
| `cdn.bernouy.com` | A (round-robin) | `<ip-edge-1>`, `<ip-edge-2>`, … |
| `cdn-edge.bernouy.com` (optionnel) | A | `<ip-edge-1>` (juste pour ton SSH/admin) |

**N'inclure aucune IP origin** dans le RR `cdn.bernouy.com`.

### 5. OVH credentials (DNS-01)

Recommandé pour le cert origin. Variables `OVH_ENDPOINT`,
`OVH_APPLICATION_KEY`, `OVH_APPLICATION_SECRET`, `OVH_CONSUMER_KEY`. Cf.
[lego docs](https://go-acme.github.io/lego/dns/ovh/).

---

## Ordre de déploiement

```
        ┌─────────────────────┐
        │ 0. auth (Keycloak)  │   upstream — tout le reste auth contre lui
        │    auth.bernouy.com │   + UI : créer realms cdn + platform,
        └──────┬──────────────┘     clients cdn-origin + cms-superadmin,
               │                    copier secrets dans bundles OKMS
               ▼
        ┌─────────────────────┐
        │ 1. cdn-origin       │
        │    cdn-origin.b.com │
        └──────┬──────────────┘
               │ génère pubkey SSH
               ▼
        ┌─────────────────────┐
        │ 2. registrer        │
        │    edge dans admin  │   → récupère plaintextToken
        └──────┬──────────────┘
               │
               ▼
        ┌─────────────────────┐
        │ 3. cdn-edge         │
        │    cdn.bernouy.com  │   ← bootstrap mode, attend cert
        └──────┬──────────────┘
               │ ACME proxy_back
               ▼
        ┌─────────────────────┐
        │ 4. PUBLIC_DOMAIN    │   l'origin retry au renew
        │    cert minted      │   → lsync vers edge
        └──────┬──────────────┘
               │
               ▼
        ┌─────────────────────┐
        │ 5. cms-control-mt   │   indépendant, peut commencer en parallèle de 1
        │    cms.bernouy.com  │   mais ne peut onboarder un tenant qu'après 4
        └─────────────────────┘
```

### Étape 1 — cdn-origin

Suivre [`cdn-node/DEPLOY.md`](cdn-node/DEPLOY.md). À la fin :
- `https://cdn-origin.bernouy.com/admin/origin/` accessible et auth via Keycloak.
- pubkey SSH affichée + cert MAIN_DOMAIN valide.
- Dashboard edges vide.
- **Cert PUBLIC_DOMAIN absent** (renew loop le retry quand un edge sera up).

### Étape 2 — Déploiement du 1er edge

Tout vit dans [`cdn-edge/DEPLOY.md`](cdn-edge/DEPLOY.md) : bootstrap
host (`init-server.sh --role edge`), pubkey origin → host edge
(§3-§4), enregistrement de l'edge dans l'admin origin avec récup du
`plaintextToken` via la modale (§6), bundle OKMS de l'edge incluant
`EDGE_TOKEN` (§7), run du container (§8). Le container boot en mode
bootstrap (port 80 only) en attendant le cert `PUBLIC_DOMAIN`.

### Étape 3 — Cert PUBLIC_DOMAIN + sync complet

Sur l'origin :
```bash
sudo docker restart cdn-origin
# → relance le boot, retry HTTP-01 webroot via l'edge → cert minted en ~20s
# → lsyncd push vers l'edge → l'edge sort du bootstrap, full nginx :443
```

Smoke test :
```bash
echo | openssl s_client -connect cdn.bernouy.com:443 \
    -servername cdn.bernouy.com 2>/dev/null \
    | openssl x509 -noout -issuer -dates
```

Mettre à jour le DNS public `cdn.bernouy.com` → IP de l'edge.

### Étape 4 — cms-control-mt

Suivre [`cms-control-mt/DEPLOY.md`](cms-control-mt/DEPLOY.md). Peut être
démarré dès l'étape 1 (indépendant de la chaîne CDN), mais
l'onboarding d'un premier tenant requiert :
- un bucket créé via `https://cdn-origin.bernouy.com/admin/buckets`
- une `bucketCredential` émise pour ce bucket
- `<PUBLIC_DOMAIN>` qui sert effectivement (étape 4 OK)

---

## Smoke test global après déploiement

```bash
# 1. Origin
curl -sI https://cdn-origin.bernouy.com/admin/origin/ | head -1
# → HTTP/2 302 (redirect Keycloak)

# 2. Edge serving
curl -sI https://cdn.bernouy.com/<bucket-id>/<known-key> | head -1
# → HTTP/2 200

# 3. Manifest secrets sur l'edge
sudo docker logs cdn-edge --tail 50 | grep fetch-secrets
# → "[fetch-secrets] manifest updated (etag=..., N entries)" (au moins une fois)

# 4. CMS superadmin
curl -sI https://cms.bernouy.com/superadmin/ | head -1
# → HTTP/2 302 (redirect Keycloak)
```

---

## Test end-to-end : un Data Provider qui marche

Une fois 1+2+3+4+5 OK :

1. Onboarder un tenant via `https://cms.bernouy.com/superadmin/`
2. Login en tant qu'admin du tenant via `https://cms.bernouy.com/cms/<id>/admin/`
3. Aller sur `/admin/data` → "+ Add provider" → URL OpenAPI publique.
4. Save → l'admin du tenant voit la liste des endpoints.
5. Vérifier côté edge :
   ```bash
   sudo docker exec cdn-edge cat /run/nginx-runtime/aliasesServers.conf
   # → contient `location /.cms/data/<provider-id>/`
   ```
6. Browser, depuis une page du tenant qui consomme ce provider via
   un bloc data-aware : l'inspecteur réseau montre des requêtes
   `https://<bucket-domain>/.cms/data/<provider-id>/...` qui
   répondent 2xx avec les données upstream.

Si la route 502 → check `sudo docker logs cdn-edge` pour les erreurs
nginx + check que `fetch-secrets` a bien tourné après l'ajout du
provider.

---

## Documents détaillés par image

- [auth/DEPLOY.md](auth/DEPLOY.md) — Keycloak self-hosted (Postgres sibling)
- [cdn-node/DEPLOY.md](cdn-node/DEPLOY.md) — origin (admin, lsyncd, edge-secrets)
- [cdn-edge/DEPLOY.md](cdn-edge/DEPLOY.md) — edge (host bootstrap, public-facing nginx, secrets poll, full edge deploy)
- [cms-control-mt/DEPLOY.md](cms-control-mt/DEPLOY.md) — multi-tenant CMS Control

---

## Troubleshooting OKMS

Diagnostiquer un container qui boucle au boot avec `[okms-fetch] FATAL`.
Lancer chaque commande sur le VPS du service en panne — adapter
`SERVICE_DIR` au service (`/etc/auth`, `/etc/cdn`, etc.).

### Symptôme : `sslv3 alert bad certificate` au TLS handshake

OVH refuse le cert client. Quatre causes par ordre de fréquence :

1. **Mauvaise région** dans `OKMS_REGION` — la valeur doit matcher la
   région où le domain a été créé (cf. §0.1). Le cert est signé pour
   un datacenter précis.
2. **Pas de policy IAM attachée au compte de service** (cf. §0.4) —
   sans actions OKMS autorisées, OVH rejette même le handshake.
   Compter 30-60s de propagation après save.
3. **Cert et key ne matchent pas** — vérifier :
   ```bash
   sudo openssl x509 -in ${SERVICE_DIR}/okms/client.crt -pubkey -noout | sha256sum
   sudo openssl pkey -in ${SERVICE_DIR}/okms/client.key -pubout 2>/dev/null | sha256sum
   ```
   Les 2 hash doivent être identiques. Sinon, regénérer un access cert
   (§0.3) — OVH ne te re-donne pas la key d'un cert déjà téléchargé.
4. **Cert pour un autre domain OKMS** — vérifier que le compte de
   service auquel le cert est bind est bien dans le même domain qu'on
   query.

### Symptôme : `404 Not Found` après TLS handshake OK

Le secret bundle n'existe pas au path queried. Trois causes :

1. **Bundle pas encore créé** dans OKMS (cf. §0.5).
2. **Path différent** entre `OKMS_SECRET_PREFIX` et le path saisi en
   Manager — vérifier exact match (espaces, slashes, casse) :
   ```bash
   sudo cat ${SERVICE_DIR}/bootstrap.env | grep OKMS_SECRET_PREFIX
   # comparer avec le path affiché dans Manager → Secret Manager → Secrets
   ```
3. **Confusion ancienne convention** — `okms-fetch.sh` ne fait **plus**
   d'auto-append `/config`. Si tu as `OKMS_SECRET_PREFIX=auth` qui
   marchait avant, repasser à `OKMS_SECRET_PREFIX=auth/config` (path
   complet du secret).

### Diagnostic manuel — curl mTLS direct

Court-circuite okms-fetch.sh pour voir la réponse brute d'OVH :

```bash
sudo bash -c 'set -a; source ${SERVICE_DIR}/bootstrap.env; set +a;
  curl -v --cert ${SERVICE_DIR}/okms/client.crt --key ${SERVICE_DIR}/okms/client.key \
    "https://${OKMS_REGION}.okms.ovh.net/api/${OKMS_DOMAIN_ID}/v1/secret/data/${OKMS_SECRET_PREFIX}" \
    2>&1 | tail -40'
```

Lecture rapide :
- `HTTP 200` → tout est OK, problème ailleurs.
- `HTTP 403` → cert reconnu mais policy IAM trop restrictive (élargir actions §0.4).
- `HTTP 404` → cert+IAM OK mais secret introuvable (cf. ci-dessus).
- `bad certificate` au handshake → cf. ci-dessus.

### Symptôme : logs container montrent encore l'ancienne erreur après fix

`docker restart` **ne purge pas** les logs. Pour ne voir que les
tentatives récentes :

```bash
sudo docker logs <container> --since=30s
```

Ou recréer proprement le container (`docker rm -f <name>` puis
`docker run` complet).
