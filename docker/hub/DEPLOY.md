# Déploiement prod — `bernouy/hub`

Runbook pour déployer le hub : UI superadmin (`/admin/*`), API
d'orchestration (`/api/*`), et issuer (signe des tokens control-plane
pour les data-providers conformants).

**Pattern** : le hub parle plain HTTP sur `:3000` derrière le container
`bernouy/nginx-proxy` (qui termine TLS + gère ACME). Le hub n'est PAS
exposé directement sur l'host — il est joignable uniquement depuis le
docker network. Cf. [`../nginx-proxy/DEPLOY.md`](../nginx-proxy/DEPLOY.md).

---

## 1. Pré-requis côté serveur prod

```bash
scp docker/init-server.sh root@<hub-host>:/tmp/
sudo bash /tmp/init-server.sh --role hub
```

| Pré-requis | Vérification |
|---|---|
| Linux + Docker | `docker --version` |
| Docker network `bernouy-net` créé | `docker network ls | grep bernouy-net` (sinon `docker network create bernouy-net`) |
| `bernouy/nginx-proxy` running sur ce network | cf. [`../nginx-proxy/DEPLOY.md`](../nginx-proxy/DEPLOY.md) |
| Accès Keycloak | `curl -fI https://auth.bernouy.com/realms/master/.well-known/openid-configuration` |

> Optionnel mais recommandé : MongoDB accessible pour persister le
> registre des data-providers importés. Sans Mongo, ils sont stockés
> en mémoire et perdus au redémarrage.

> Le hub ne publie **AUCUN port sur l'host** — il est joignable
> uniquement depuis le docker network `bernouy-net`. `nginx-proxy`
> est le seul container qui expose `:80` / `:443`.

---

## 2. DNS

| Record | Type | Valeur |
|---|---|---|
| `hub.bernouy.com` | `A` | `<ip-serveur>` |

Vérifier : `dig +short hub.bernouy.com @1.1.1.1`.

Le DNS pointe vers `nginx-proxy` (qui termine TLS) ; le proxy route ensuite
le trafic vers le container `hub` via le docker network. Vérifier que
le bundle OKMS de nginx-proxy contient `hub.bernouy.com=hub:3000` dans
`UPSTREAMS`.

---

## 3. Pré-requis Keycloak

Le hub utilise Keycloak pour UNE seule chose : **authentifier les
superadmins** sur `/admin/*` (login cookie OIDC). **Il ne crée plus de
realms, ni d'users, ni de service accounts** — la gestion d'identité des
tenants est sortie du hub (pivot). Pas de `hub-orchestrator`, pas de
`realm-management` roles, pas de SMTP.

### OIDC client `hub-admin`

Dans le realm de ton choix (typiquement `master`) :

1. **+ Create client** :
   - Client ID : `hub-admin`
   - Client authentication : `On` (confidential)
   - Authentication flow : **Standard flow** seulement
   - Valid Redirect URIs : `https://hub.bernouy.com/admin/auth/*`
   - Web Origins : `https://hub.bernouy.com`
2. Tab **Credentials** → copier le client secret (→ bundle OKMS, clé
   `HUB_KEYCLOAK_CLIENT_SECRET`)
3. Realm Roles → créer `superadmin` (ou réutiliser)
4. Users → assigner ce rôle à toi-même + tes ops

> Adapte `KEYCLOAK_API_AUTH_REALM` dans le bundle si tu utilises un realm
> autre que `master`.

---

## 4. Pré-requis MongoDB (recommandé)

URL accessible depuis le hub. Stocke deux registres :
- `data_provider_imports` (DPs importés + schémas cachés)
- `hub_namespaces` + `hub_namespace_provisions` (namespaces + leurs
  provisions par DP, avec issuers de confiance + config)

Sans Mongo → tout en mémoire (perdu au restart, smoke test only).
Bonne pratique : un user dédié read/write sur une DB `hub_meta`.

---

## 5. Provisionner le secret bundle dans OKMS

Le container ne lit aucun secret depuis un `.env` — tout vient d'un
bundle KV dans **OVHcloud Secret Manager**. Pré-requis : un OKMS domain
provisionné — note l'**UUID** + la **région**.

### 5a. Créer le bundle `prod/hub/config`

Manager OVHcloud → OKMS domain → Secrets → New secret.
- Path : `prod/hub/config` (doit matcher `OKMS_SECRET_PREFIX` du §8b)
- Type : KV2 / object
- Clés à renseigner :

| Clé | Valeur |
|---|---|
| `MAIN_DOMAIN` | `hub.bernouy.com` |
| `LEGO_EMAIL` | `ops@bernouy.com` (pour nginx-proxy) |
| `HUB_PUBLIC_URL` (opt) | `https://hub.bernouy.com` (défaut `https://${MAIN_DOMAIN}`) |
| `KEYCLOAK_BASE_URL` | `https://auth.bernouy.com` |
| `KEYCLOAK_API_AUTH_REALM` (opt) | `master` (défaut) — realm qui authentifie les superadmins |
| `KEYCLOAK_API_AUTH_ROLE` (opt) | `superadmin` (défaut) |
| `HUB_KEYCLOAK_CLIENT_ID` | `hub-admin` |
| `HUB_KEYCLOAK_CLIENT_SECRET` | secret du §3 |
| `HUB_SESSION_SECRET` | `openssl rand -hex 32` |
| `HUB_KEK_KEY_ID` | UUID de la **service key** OVH créée au §6 |
| `MONGO_URL` (opt) | `mongodb+srv://...` — sans, registres en mémoire |
| `MONGO_DB_NAME` (opt) | `hub_meta` (défaut) |

> Plus de `KEYCLOAK_ADMIN_CLIENT_*` ni de `SMTP_*` : le hub ne gère plus
> l'identité des tenants. Ces clés ont disparu du bundle.

### 5b. Générer un access certificate pour le hub

Manager → OKMS domain → **Access certificates** → "Generate an access
certificate". Policy IAM scopée au domain avec les actions :

- `secretConfig/get` (pour lire le bundle KV2 ci-dessus)
- `serviceKey/dataKey/create` + `serviceKey/dataKey/decrypt` (pour
  wrap/unwrap les DEK qui chiffrent les clés signantes du hub-issuer)

Télécharger le **cert** + la **private key** (download unique).

---

## 6. Provisionner la Customer Managed Key pour le hub-issuer

Le hub mint des tokens `control-plane` pour parler aux data-providers ;
leur **private key signe** chaque token. Sur disque
(`/var/lib/hub/keys/keys.json`), ces clés sont chiffrées en envelope
encryption : un DEK par clé signante, wrappé par une CMK qui vit dans
le HSM OVH OKMS et n'est jamais lisible côté process.

Perdre cette CMK = perdre la capacité du hub à déchiffrer ses clés
signantes = il en regen au prochain boot = tous les data-providers
rejettent ses tokens jusqu'à propagation de la nouvelle JWKS.

### 6a. Créer la service key

Manager OVHcloud → Identity & Security → KMS → OKMS domain →
**Encryption keys** → **+ Create a key** :

| Champ | Valeur |
|---|---|
| Name | `hub-issuer-kek` |
| Type | `oct` |
| Size | `256` |
| Operations | **`wrapKey`** + **`unwrapKey`** |
| Protection level | `SOFTWARE` ou `HSM` |

Submit → copie l'UUID dans le bundle OKMS du §5a sous `HUB_KEK_KEY_ID`.

### 6b. Vérifier l'accès mTLS (optionnel)

Sur le VPS hub (après §8) :

```bash
sudo bash -c 'set -a; source /etc/hub/bootstrap.env; set +a;
  curl -v --cert /etc/hub/okms/client.crt --key /etc/hub/okms/client.key \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"smoke-test\",\"size\":256}" \
    "https://${OKMS_REGION}.okms.ovh.net/api/${OKMS_DOMAIN_ID}/v1/servicekey/${HUB_KEK_KEY_ID}/datakey" \
    2>&1 | tail -20'
```

Attendu : HTTP 201 + body `{"key":"<JWE>","plaintext":"<base64-32B>"}`.

---

## 7. Build + transfert de l'image

```bash
docker buildx build --network=host \
    -f docker/hub/Dockerfile \
    -t bernouy/hub:0.1.0 .
docker save bernouy/hub:0.1.0 | gzip > hub-0.1.0.tar.gz
scp hub-0.1.0.tar.gz <user>@<server>:/tmp/

# Sur le serveur
sudo docker load < /tmp/hub-0.1.0.tar.gz
```

---

## 8. Bootstrap du host

### 8a. Déposer le cert + key OKMS

```bash
sudo install -d -m 0700 -o root -g root /etc/hub/okms
sudo install -m 0600 -o root -g root /dev/null /etc/hub/okms/client.crt
sudo install -m 0400 -o root -g root /dev/null /etc/hub/okms/client.key
sudo nano /etc/hub/okms/client.crt
sudo nano /etc/hub/okms/client.key
sudo chmod 0600 /etc/hub/okms/client.crt
sudo chmod 0400 /etc/hub/okms/client.key
```

### 8b. `bootstrap.env`

```bash
sudo install -d -m 0700 -o root -g root /etc/hub
sudo install -m 0600 -o root -g root /dev/null /etc/hub/bootstrap.env
sudo nano /etc/hub/bootstrap.env
```

Contenu (5 vars) :

```bash
OKMS_REGION=eu-west-rbx
OKMS_DOMAIN_ID=<uuid-du-domain>
OKMS_CERT_PATH=/etc/okms/client.crt              # path DANS le container
OKMS_KEY_PATH=/etc/okms/client.key
OKMS_SECRET_PREFIX=prod/hub/config               # path complet du secret
```

---

## 9. Lancement

**Préalable** : `bernouy/nginx-proxy` doit déjà tourner sur le network
`bernouy-net`, avec `hub.bernouy.com=hub:3000` dans son bundle UPSTREAMS.

```bash
sudo docker run -d --name hub \
    --restart unless-stopped \
    --network bernouy-net \
    --dns 1.1.1.1 --dns 8.8.8.8 \
    -v hub-data:/var/lib/hub \
    -v /etc/hub/okms/client.crt:/etc/okms/client.crt:ro \
    -v /etc/hub/okms/client.key:/etc/okms/client.key:ro \
    --env-file /etc/hub/bootstrap.env \
    bernouy/hub:0.1.0

sudo docker logs -f hub
```

Au boot tu verras `[okms-fetch] fetched bundle (prefix=prod/hub/config)`
+ la liste des keys exportées, puis `[hub] Starting bun on :3000…`.
Aucune étape lego ici — c'est `nginx-proxy` qui s'en occupe.

---

## 10. Smoke test

```bash
# 1. Container healthy
sudo docker ps --filter name=hub --format 'table {{.Status}}'

# 2. Hub-issuer publication accessible (publique)
curl -fsSL https://hub.bernouy.com/.well-known/oauth-authorization-server | jq
curl -fsSL https://hub.bernouy.com/jwks.json | jq '.keys | length'

# 3. /admin/ redirige vers Keycloak
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
    https://hub.bernouy.com/admin/
# → 302 -> https://auth.bernouy.com/.../auth?...

# 4. Browser : https://hub.bernouy.com/admin/
#    → login Keycloak (role superadmin) → dashboard
```

---

## 11. Setup côté data-providers

Pour qu'un data-provider accepte les tokens du hub, sa config doit
contenir dans son `allowlist` :

```json
{
    "iss":  "https://hub.bernouy.com",
    "role": "control-plane"
}
```

L'UI hub (`/admin/`) affiche le snippet exact au moment où l'opérateur
veut importer un nouveau data-provider.

---

## 12. Update de l'image

Build + scp + `docker load` + `docker stop hub && docker rm hub` puis
relancer §9. Le volume `hub-data` conserve les certs lego + **les clés
signantes du hub-issuer** — ne JAMAIS supprimer ce volume sauf si tu
acceptes que tous les DPs rejettent les tokens jusqu'à publication des
nouvelles clés.

---

## 13. Limites connues v0.1

- **Single-instance.** Le `FileKeyStore` est sur disque ; pour scale
  horizontal, il faudra un `KeyStore` réseau (DB-backed) — non livré.
- **Un seul issuer forwarded par (namespace, DP).** La trust-list stocke
  plusieurs issuers mais seul le 1er est envoyé au DP (la SDK n'accepte
  qu'un iss par tenant). Multi-issuer = roadmap SDK.
- **Pas de grouping visuel par `providerKind`** dans la liste des DPs.
- **Pas d'autoredirect `/` → `/admin/`.** L'opérateur tape `/admin/`.

---

## 14. Mode dev (sans OKMS, sans nginx-proxy)

Le hub embarque trois flags pour le dev local :

| Flag | Effet |
|---|---|
| `HUB_ENV=dev` | **Confirmation explicite obligatoire** pour que `OKMS_SKIP=1` soit accepté. Sans ce flag, `okms-fetch.sh` refuse de booter. C'est le garde-fou anti-foot-gun en prod. |
| `OKMS_SKIP=1` | `okms-fetch.sh` court-circuite l'appel OVH OKMS et chaîne directement vers `hub-entrypoint.sh`. Les vars du bundle doivent venir d'`--env-file` / `-e`. Exige `HUB_ENV=dev`. |
| `HUB_LOCAL_KEK_B64=<32 bytes base64>` | `server.ts` instancie `LocalKekProvider` au lieu de `OvhOkmsKekProvider`. Aucun mTLS, aucune CMK. `entrypoint.sh` skip aussi la copie du cert. Obligatoire si `OKMS_SKIP=1`. |

**À ne JAMAIS poser en prod** — la prod doit échouer à booter si OKMS est down, c'est précisément le filet de sécurité.

### Démarrage rapide : `compose.dev.yml`

Stack locale complète (Keycloak + Mongo + hub + 2 data-providers conformants), un seul `up` :

```bash
docker compose -f docker/hub/compose.dev.yml up --build
```

| Service | URL | Note |
|---|---|---|
| Hub `/admin/` | http://hub.localtest.me:3000/admin/ | login `dev@local` / `dev` |
| Keycloak | http://keycloak.localtest.me:8080 | admin / admin (auth superadmin only) |
| Example DP | http://example-dp.localtest.me:4000 | notes DP (tenantConfig) |
| Addresses DP | http://addresses-dp.localtest.me:4001 | BAN proxy (FR) |

> Les URLs `*.localtest.me` résolvent toujours vers `127.0.0.1` (DNS public). On les déclare aussi en alias Docker network, donc browser ET containers utilisent la même URL pour parler à chaque service — pas d'`/etc/hosts`, l'iss claim colle.

### Workflow end-to-end testable

Une fois le stack up :

1. Ouvre http://hub.localtest.me:3000/admin/, login `dev@local / dev`.
2. **Providers → Importer un DP** : URL = `http://example-dp.localtest.me:4000` (puis `:4001` pour addresses). Le hub fetch les 4 docs de discovery et persiste l'import.
3. **Namespaces → Nouveau namespace** : crée par ex. `acme` (juste un id + nom, aucune création Keycloak).
4. **Namespace acme → carte DP → Configurer** : sur la page dédiée, renseigne la trust-list (issuers de confiance) + la config. Le hub mint un CP token, POST/PATCH `/admin/tenants` sur le DP.
5. **Vérifie** : GET `/api/namespaces/providers/config?namespaceId=acme&providerId=…` renvoie la config persistée côté DP.

Détail dans le fichier `compose.dev.yml` lui-même (annoté).

### Variables dev minimales (si tu veux faire à la main, sans compose)

```bash
# dev.env
HUB_ENV=dev
OKMS_SKIP=1
HUB_LOCAL_KEK_B64=$(openssl rand -base64 32)   # généré une fois, à coller en clair
MAIN_DOMAIN=hub.localtest.me:3000
HUB_PUBLIC_URL=http://hub.localtest.me:3000
KEYCLOAK_BASE_URL=http://keycloak.localtest.me:8080
KEYCLOAK_API_AUTH_REALM=master
HUB_KEYCLOAK_CLIENT_ID=hub-admin
HUB_KEYCLOAK_CLIENT_SECRET=dev-admin-secret
HUB_SESSION_SECRET=$(openssl rand -hex 32)
MONGO_URL=mongodb://mongo:27017
MONGO_DB_NAME=hub_dev
```

```bash
docker run --rm -it \
    --network bernouy-dev-net \
    -p 3000:3000 \
    --env-file ./dev.env \
    bernouy/hub:dev
```
