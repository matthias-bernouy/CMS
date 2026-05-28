# Déploiement prod — `bernouy/cms-control-mt`

Runbook pour déployer le CMS Control multi-tenant. **Une seule** instance
sert N tenants — chaque tenant apporte sa propre Keycloak. MongoDB externe,
partagé par tous les tenants (préfixe de collections par tenant).

Le stockage des fichiers (médias) est servi par le CMS lui-même via
`/api/files` : arbre dans Mongo (`tenant_<id>__`) + octets dans un blob
backend. En prod, S3-compatible si `CMS_S3_BUCKET` est défini (isolation par
préfixe de clé `tenant_<id>/`), sinon un dossier local (`CMS_FILES_DIR`).
Aucune credential par tenant à saisir à l'onboarding.

---

## 1. Pré-requis côté serveur prod

```bash
# Sur la dev box (depuis la racine du repo) — push le script vers le VPS cms
scp docker/init-server.sh root@<cms-host>:/tmp/

# Sur le VPS cms
sudo bash /tmp/init-server.sh --role cms
```

→ apt + Docker CE + ufw (OpenSSH + 80/443 publics) + systemd-timesyncd.
Idempotent.

| Pré-requis | Vérification |
|---|---|
| Linux + Docker installé | `docker --version` |
| Ports 80 + 443 libres | `sudo ss -tlnp 'sport = :80'` ; idem 443 |
| Accès réseau au MongoDB externe | `mongosh "$MONGO_URL" --eval 'db.runCommand({ping:1})'` |
| Port 80 ouvert depuis Internet (HTTP-01) | `curl -I http://<your-ip>` depuis dehors |

---

## 2. DNS

Un seul record A vers le serveur :

| Record | Type | Valeur |
|---|---|---|
| `cms.example.com` | `A` | `<ip-serveur>` |

Vérifier : `dig +short cms.example.com @1.1.1.1`.

---

## 3. Pré-requis Keycloak (superadmin uniquement)

C'est la Keycloak **de la plateforme**, pas celle d'un tenant. Crée un
realm dédié (ou réutilise le tien) :

1. **Créer un client OIDC** :
   - Client ID : `cms-superadmin`
   - Client authentication : `On` (confidential)
   - Valid Redirect URIs : `https://cms.example.com/superadmin/auth/callback`
   - Valid Post Logout Redirect URIs : `https://cms.example.com/superadmin/auth/post-logout-callback`
2. Tab **Credentials** → copier le client secret
3. **Realm Roles** → créer `cms-superadmin` (ou choisir un autre nom +
   adapter `SUPERADMIN_KEYCLOAK_ADMIN_ROLE`)
4. **Users** → assigner ce rôle à toi-même + tes ops

---

## 4. Pré-requis MongoDB externe

URL accessible depuis le serveur. Le CMS y écrit :
- `tenants` — registry des tenants (1 doc par tenant)
- `tenant_<id>__pages`, `tenant_<id>__blocs`, etc. — données par tenant
- `tenant_<id>__secrets` — secrets admin du tenant **chiffrés en envelope** (cf. §5 + §6)
- `cms_deks` — DEKs par tenant, **wrapped** par le CMK OVH (jamais en clair en Mongo)

Bonnes pratiques : un user dédié à ce CMS avec lecture/écriture sur cette
DB seulement.

---

## 5. Provisionner le secret bundle dans OKMS

Le container ne lit aucun secret depuis un `.env` — tout vient d'un
bundle KV dans **OVHcloud Secret Manager**. Pré-requis : un OKMS
domain provisionné (peut être le même que cdn-origin) — note l'**UUID**
+ la **région**.

### 5a. Créer le bundle `prod/cms-control-mt/config`

Manager OVHcloud → ton OKMS domain → Secrets → New secret.
- Path : `prod/cms-control-mt/config` (doit matcher exactement la valeur
  de `OKMS_SECRET_PREFIX` du §8b — slashes, casse, pas de `/` final).
- Type : KV2 / object
- Clés à renseigner :

| Clé | Valeur |
|---|---|
| `MAIN_DOMAIN` | `cms.bernouy.com` |
| `LEGO_EMAIL` | `ops@bernouy.com` |
| `MONGO_URL` | `mongodb+srv://user:pass@<cluster>.mongodb.net/?retryWrites=true` |
| `MONGO_DB_NAME` | `mt-cms` |
| `SUPERADMIN_KEYCLOAK_ISSUER` | `https://auth.bernouy.com/realms/platform` |
| `SUPERADMIN_KEYCLOAK_CLIENT_ID` | `cms-superadmin` |
| `SUPERADMIN_KEYCLOAK_CLIENT_SECRET` | depuis Keycloak |
| `SUPERADMIN_KEYCLOAK_SESSION_SECRET` | `openssl rand -hex 32` |
| `SUPERADMIN_KEYCLOAK_ADMIN_ROLE` | `cms-superadmin` |
| `CMS_KEK_KEY_ID` | UUID de la **service key** OVH créée au §6 (CMK pour les secrets tenant) |
| `CMS_SESSION_SECRET` | `openssl rand -hex 32` — clé partagée qui signe les cookies de session admin (tous tenants). Seul secret d'auth platform-level : l'auth est CMS-owned (provider local builtin + providers OIDC dynamiques par tenant, stockés en data) |
| `CMS_S3_BUCKET` | bucket S3-compatible **partagé** pour les médias (isolation par préfixe de clé `tenant_<id>/`) |
| `CMS_S3_ACCESS_KEY_ID` | access key S3 |
| `CMS_S3_SECRET_ACCESS_KEY` | secret key S3 |
| `CMS_S3_REGION` | région (ex. `gra` chez OVH) |
| `CMS_S3_ENDPOINT` | endpoint non-AWS (ex. OVH `https://s3.gra.io.cloud.ovh.net`) — omis pour AWS |

> Médias : si `CMS_S3_BUCKET` est absent, fallback sur `CMS_FILES_DIR` (dossier
> local) — déconseillé en prod multi-node (non partagé entre instances).
> Authz admin : l'OIDC ci-dessus n'**authentifie** que ; les rôles sont gérés
> par le CMS (admin ssi email vérifié ∈ member set, seedé via `initialAdminEmail`).

### 5b. Générer un access certificate dédié à cms-control-mt

Manager → OKMS domain → **Access certificates** → "Generate an access
certificate". Policy IAM scopée au domain (cf. §6 pour les actions
exactes — il faut à la fois `secretConfig/get` pour le bundle ET
`serviceKey/dataKey/{create,decrypt}` pour la CMK). Télécharger le
**cert** + la **private key** (download unique).

---

## 6. Provisionner la Customer Managed Key (CMK) pour les secrets tenant

Les secrets que les admins tenants saisissent dans `/admin/secrets`
(API keys d'upstreams data-providers, webhook signing keys, …) sont
**chiffrés en envelope** avant d'atterrir en Mongo : un DEK par
tenant, lui-même wrappé par une **CMK qui vit dans le HSM OVH OKMS**
et n'est jamais lisible côté process. Le run-time fait des appels
mTLS à OVH pour wrap/unwrap les DEKs (~50-200ms par cache miss, TTL
30 min côté `EnvelopeSecretCrypto`).

### 6a. Créer la service key dans OVH

Manager OVHcloud → Identity & Security → Key Management Service →
ton OKMS domain → onglet **Encryption keys** → **+ Create a key** :

| Champ | Valeur |
|---|---|
| Name | `cms-secrets-kek` (libre, juste pour t'y retrouver) |
| Type | `oct` (clé symétrique) |
| Size | `256` (AES-256) |
| Operations | cocher **`wrapKey`** + **`unwrapKey`** |
| Protection level | `SOFTWARE` (suffisant) ou `HSM` / `MANAGED_HSM` (plus cher, plus strict) |

Submit → l'UI affiche un **UUID**. Copie cette valeur dans le bundle
OKMS du §5a sous la clé `CMS_KEK_KEY_ID`.

### 6b. Étendre la policy IAM du compte de service

Le compte de service `cms-control-mt` (créé au §5b, déjà autorisé à
lire le bundle KV2) a besoin de deux actions supplémentaires pour
appeler l'API crypto OVH :

Manager → IAM/Sécurité → Politiques → ouvrir la policy de ce compte →
ajouter aux **Actions** :

- `okms:apikms:serviceKey/dataKey/create` (générer un DEK wrappé)
- `okms:apikms:serviceKey/dataKey/decrypt` (unwrap un DEK existant)

Save → attendre 30-60s de propagation. Sans ces actions, le 1er secret
écrit par un admin tenant fait crash le boot de
`EnvelopeSecretCrypto._fetchOrCreate` avec un `OvhOkmsError: HTTP 403`.

### 6c. Vérification mTLS direct (optionnel mais utile)

Sur le VPS cms (avec le cert OKMS déjà déployé au §8a) :

```bash
sudo bash -c 'set -a; source /etc/cms-mt/bootstrap.env; set +a;
  curl -v --cert /etc/cms-mt/okms/client.crt --key /etc/cms-mt/okms/client.key \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"smoke-test\",\"size\":256}" \
    "https://${OKMS_REGION}.okms.ovh.net/api/${OKMS_DOMAIN_ID}/v1/servicekey/${CMS_KEK_KEY_ID}/datakey" \
    2>&1 | tail -20'
```

Attendu : HTTP 201 + body `{"key":"<JWE>","plaintext":"<base64-32B>"}`.
Si 403 → policy IAM (revérifier §6b). Si 404 → mauvais `CMS_KEK_KEY_ID`
ou clé pas dans ce domain. Si `bad certificate` → cert/key/region
incohérents (cf. §Troubleshooting OKMS du runbook global).

---

## 7. Build + transfert de l'image

```bash
# Sur la dev box (depuis la racine du repo)
docker buildx build --network=host \
    -f docker/cms-control-mt/Dockerfile \
    -t bernouy/cms-control-mt:0.2.0 .
docker save bernouy/cms-control-mt:0.2.0 | gzip > cms-control-mt-0.2.0.tar.gz
scp cms-control-mt-0.2.0.tar.gz <user>@<server>:/tmp/

# Sur le serveur
sudo docker load < /tmp/cms-control-mt-0.2.0.tar.gz
sudo docker images bernouy/cms-control-mt
```

---

## 8. Bootstrap du host

### 8a. Déposer le cert + key OKMS

```bash
sudo install -d -m 0700 -o root -g root /etc/cms-mt/okms
sudo install -m 0600 -o root -g root /dev/null /etc/cms-mt/okms/client.crt
sudo install -m 0400 -o root -g root /dev/null /etc/cms-mt/okms/client.key
sudo nano /etc/cms-mt/okms/client.crt   # paste cert PEM (§5b download)
sudo nano /etc/cms-mt/okms/client.key   # paste key PEM
sudo chmod 0600 /etc/cms-mt/okms/client.crt
sudo chmod 0400 /etc/cms-mt/okms/client.key
```

### 8b. `bootstrap.env`

```bash
sudo install -d -m 0700 -o root -g root /etc/cms-mt
sudo install -m 0600 -o root -g root /dev/null /etc/cms-mt/bootstrap.env
sudo nano /etc/cms-mt/bootstrap.env
```

Contenu (5 vars) :

```bash
OKMS_REGION=eu-west-rbx
OKMS_DOMAIN_ID=<uuid-du-domain>
OKMS_CERT_PATH=/etc/okms/client.crt              # path DANS le container
OKMS_KEY_PATH=/etc/okms/client.key
OKMS_SECRET_PREFIX=prod/cms-control-mt/config    # path COMPLET du secret
```

> `OKMS_REGION` doit matcher la région où le domain a été créé.
> `OKMS_SECRET_PREFIX` est le path complet du secret, **pas** un préfixe.
> Cf. [global DEPLOY.md §0](../DEPLOY.md#0-ovhcloud-secret-manager-okms--source-unique-des-secrets) pour la procédure
> compte de service + access cert + policy IAM.

---

## 9. Lancement

```bash
sudo docker run -d --name cms-mt \
    --restart unless-stopped \
    --dns 1.1.1.1 --dns 8.8.8.8 \
    -p 80:80 -p 443:443 \
    -v cms-mt-data:/var/lib/cms \
    -v /etc/cms-mt/okms/client.crt:/etc/okms/client.crt:ro \
    -v /etc/cms-mt/okms/client.key:/etc/okms/client.key:ro \
    --env-file /etc/cms-mt/bootstrap.env \
    bernouy/cms-control-mt:0.2.0

sudo docker logs -f cms-mt
```

Au boot tu verras d'abord `[okms-fetch] fetched bundle (prefix=cms-control-mt)` +
la liste des keys exportées. Premier boot ~1 min (lego HTTP-01
standalone).

---

## 10. Smoke test

```bash
# 1. Container healthy
sudo docker ps --filter name=cms-mt --format 'table {{.Status}}'

# 2. Superadmin redirige vers Keycloak
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
    https://cms.example.com/superadmin/
# → 302 -> https://auth.example.com/realms/platform/.../auth?...

# 3. Browser : https://cms.example.com/superadmin/
#    → login Keycloak (rôle cms-superadmin) → dashboard tenants vide
```

---

## 11. Onboarder un premier tenant

**Côté tenant** (à faire par le client ou toi pour son compte) :

1. **Auth de départ** : rien à provisionner côté IdP. Au provisioning, le
   tenant reçoit un provider local (email/mot de passe) builtin et un premier
   admin seedé depuis `initialAdminEmail` + `initialAdminPassword`. Des
   providers OIDC supplémentaires (Google, Keycloak, …) s'ajoutent ensuite
   comme **data** depuis l'admin (Settings → Identity), avec redirect URI
   `https://cms.example.com/cms/<tenant-id>/auth/<provider-id>/callback`.
   Les accès CLI / server-to-server se font via un Personal Access Token créé
   dans l'admin (page Profile).

2. **Stockage fichiers** : rien à provisionner par tenant. Au niveau de
   l'image, définir les env `CMS_S3_*` (bucket S3-compatible partagé,
   isolation par préfixe de clé) en prod ; sinon `CMS_FILES_DIR` (dossier
   local, single-node).

**Côté superadmin** :

1. `https://cms.example.com/superadmin/` → login → "+ New tenant"
2. Remplir : id (slug), name, infos Keycloak du tenant.
3. Submit → le tenant est immédiatement mounté à `/cms/<tenant-id>/*`
   (repo Mongo + files backend préfixés `tenant_<id>__`).

Le tenant accède à son admin via
`https://cms.example.com/cms/<tenant-id>/admin/pages`. Les médias se
gèrent via `/admin/files` (uploads → `/api/files`, stockés dans le blob
backend configuré).

---

## 12. Update de l'image

Identique à `cms-control` : build + scp + docker load + swap. Le volume
`cms-mt-data` ne porte que les certs lego. La data tenant vit en Mongo.

---

## 13. Limites connues v0.1

- **Pas d'édition** d'un tenant existant via UI — seulement create/delete.
  Pour rotater une credential CDN, delete + recreate (perd la data Mongo
  sauf si tu réimportes la même collection prefix).
- **Suppression d'un tenant = drop des collections** `tenant_<id>__*`.
  Backup côté Mongo avant de cliquer Delete.
- **Cookies par tenant** scoped via `cookieName` (`cms-<id>-session`)
  mais pas via `cookiePath` — ce qui est inoffensif (différents noms ne
  collisionnent pas) mais le cookie est envoyé sur toutes les URLs.
- **Pas de Delivery dans CETTE image** — Control uniquement. Le rendu
  public n'est pas servi par cette image ; le champ `tenant.delivery`
  est réservé à une future image de Delivery.
