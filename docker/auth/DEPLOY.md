# Déploiement prod — `bernouy/auth`

Runbook pour déployer **Keycloak self-hosted** sur `auth.bernouy.com`. Le
container embarque nginx (TLS terminate, lego HTTP-01) + Keycloak (HTTP
sur 127.0.0.1:8080). La DB Postgres tourne dans un container sibling
`auth-postgres` sur le même VPS, via un docker network user-defined.

> **Pré-requis** : ce service est upstream de tout le reste. cdn-origin
> et cms-control-mt s'authentifient contre lui — il doit booter en
> premier dans la séquence globale (cf. `docker/DEPLOY.md`).

---

## 1. Pré-requis VPS

```bash
sudo bash docker/init-server.sh --role auth
```

→ apt + Docker CE + ufw (80/443 publics) + systemd-timesyncd. Idempotent.

| Pré-requis | Vérification |
|---|---|
| Linux + Docker | `docker --version` |
| Ports 80 + 443 libres | `sudo ss -tlnp 'sport = :80'` ; idem 443 |
| Disque ≥ 20 GB libres pour la DB Postgres | `df -h /var/lib/docker` |
| Port 80 ouvert depuis Internet (HTTP-01 lego) | `curl -I http://<your-ip>` depuis dehors |

---

## 2. DNS

| Record | Type | Valeur |
|---|---|---|
| `auth.bernouy.com` | `A` | `<ip-auth-vps>` |

TTL=300. Vérifier : `dig +short auth.bernouy.com @1.1.1.1`.

---

## 3. Provisionner le secret bundle dans OKMS

Pré-requis : un OKMS domain provisionné (peut être le même que les
autres services — note l'**UUID** + la **région**).

### 3a. Générer les credentials Postgres

```bash
openssl rand -base64 24   # → KC_DB_PASSWORD (note-le, tu le ré-utiliseras au §6)
openssl rand -base64 24   # → KEYCLOAK_ADMIN_PASSWORD (initial bootstrap admin)
```

### 3b. Créer le bundle secret

Manager OVHcloud → ton OKMS domain → Secrets → "Ajouter un secret".
- Path : `prod/auth/config` (ou autre — ce qui compte c'est de mettre
  exactement la même valeur dans `OKMS_SECRET_PREFIX` du §5b)
- Type : Clé/valeur (KV2)
- Clés à renseigner :

| Clé | Valeur |
|---|---|
| `MAIN_DOMAIN` | `auth.bernouy.com` |
| `LEGO_EMAIL` | `ops@bernouy.com` |
| `KC_DB_URL_HOST` | `auth-postgres` (alias docker du container Postgres, cf. §6) |
| `KC_DB_URL_DATABASE` | `keycloak` |
| `KC_DB_USERNAME` | `keycloak` |
| `KC_DB_PASSWORD` | (le base64 du §3a) |
| `KEYCLOAK_ADMIN` | `admin` (ou autre login bootstrap) |
| `KEYCLOAK_ADMIN_PASSWORD` | (le base64 du §3a) |

> **Le password Postgres apparaît à 2 endroits** : ici dans le bundle
> OKMS pour Keycloak, ET passé en `POSTGRES_PASSWORD` au container
> `auth-postgres` au §6. Postgres ne lit pas OKMS — il faut le saisir
> aux 2 endroits avec **exactement la même valeur**.

### 3c. Compte de service + access cert + policy IAM

Procédure complète détaillée dans le **runbook global** §0.2 → §0.4
([`docker/DEPLOY.md`](../DEPLOY.md#0-ovhcloud-secret-manager-okms--source-unique-des-secrets)).
Résumé pour le service auth :

1. **Compte de service** : IAM/Sécurité → Identités → Comptes de service
   → "Ajouter" → nom `auth`.
2. **Access cert** : Secret Manager → ton domain → Certificats d'accès
   → "Générer" en sélectionnant le compte `auth` → télécharger cert + key.
3. **Policy IAM** : IAM/Sécurité → Politiques → "Ajouter" :
   - Identités : compte `auth`
   - Type de produit : OKMS
   - Ressources : vide
   - Actions : `okms:secret:get` + `okms:secret:list` (ou `okms:*`)
   - Save → attendre 30-60s de propagation.

⚠️ Sans la policy, OVH refuse même le TLS handshake (`bad certificate`).
Cf. §Troubleshooting OKMS du runbook global.

---

## 4. Build + transfert de l'image

```bash
# Sur la dev box, depuis la racine du repo
docker buildx build \
    -f docker/auth/Dockerfile \
    -t bernouy/auth:0.1.0 .

docker save bernouy/auth:0.1.0 | gzip > auth-0.1.0.tar.gz
scp auth-0.1.0.tar.gz root@<auth-vps>:/tmp/

# Sur le VPS auth
sudo docker load < /tmp/auth-0.1.0.tar.gz
sudo docker images bernouy/auth
```

---

## 5. Bootstrap du host

### 5a. Déposer le cert + key OKMS

```bash
sudo install -d -m 0700 -o root -g root /etc/auth/okms
sudo install -m 0600 -o root -g root /dev/null /etc/auth/okms/client.crt
sudo install -m 0400 -o root -g root /dev/null /etc/auth/okms/client.key
sudo nano /etc/auth/okms/client.crt   # paste cert PEM (§3c)
sudo nano /etc/auth/okms/client.key   # paste key PEM
sudo chmod 0600 /etc/auth/okms/client.crt
sudo chmod 0400 /etc/auth/okms/client.key
```

### 5b. `bootstrap.env`

```bash
sudo install -d -m 0700 -o root -g root /etc/auth
sudo install -m 0600 -o root -g root /dev/null /etc/auth/bootstrap.env
sudo nano /etc/auth/bootstrap.env
```

Contenu (5 vars) :

```bash
OKMS_REGION=eu-west-rbx
OKMS_DOMAIN_ID=<uuid-du-domain>
OKMS_CERT_PATH=/etc/okms/client.crt          # path DANS le container
OKMS_KEY_PATH=/etc/okms/client.key
OKMS_SECRET_PREFIX=prod/auth/config          # path COMPLET du secret (cf. §3b)
```

> `OKMS_REGION` doit matcher la région où le domain a été créé
> (`eu-west-rbx`, `eu-west-par`, etc.). `OKMS_SECRET_PREFIX` est le
> path complet du secret, **pas** un préfixe — `okms-fetch.sh` ne fait
> plus d'auto-append `/config`.

### 5c. Fichier de password pour Postgres

Postgres ne lit pas OKMS — on lui donne le password directement à
`docker run` via `--env-file`. **Même valeur** que `KC_DB_PASSWORD`
dans le bundle OKMS (§3a, §3b).

```bash
sudo install -m 0600 -o root -g root /dev/null /etc/auth/postgres.env
sudo nano /etc/auth/postgres.env
```

Contenu :

```bash
POSTGRES_DB=keycloak
POSTGRES_USER=keycloak
POSTGRES_PASSWORD=<même-valeur-que-KC_DB_PASSWORD>
```

---

## 6. Lancement

### 6a. Réseau docker dédié

```bash
sudo docker network create auth-net
```

→ permet à `auth` de joindre `auth-postgres` par hostname.

### 6b. Postgres

```bash
sudo docker run -d --name auth-postgres \
    --restart unless-stopped \
    --network auth-net \
    -v auth-pg-data:/var/lib/postgresql/data \
    --env-file /etc/auth/postgres.env \
    postgres:16-alpine
```

→ Postgres bind sur le réseau `auth-net` uniquement. Aucun port
exposé sur l'host. Vérifier :

```bash
sudo docker logs auth-postgres | tail -5
# → "database system is ready to accept connections"
sudo docker exec auth-postgres pg_isready -U keycloak
# → "/var/run/postgresql:5432 - accepting connections"
```

### 6c. Keycloak

```bash
sudo docker run -d --name auth \
    --restart unless-stopped \
    --network auth-net \
    -p 80:80 -p 443:443 \
    -v auth-data:/var/lib/auth \
    -v /etc/auth/okms/client.crt:/etc/okms/client.crt:ro \
    -v /etc/auth/okms/client.key:/etc/okms/client.key:ro \
    --env-file /etc/auth/bootstrap.env \
    bernouy/auth:0.1.0

sudo docker logs -f auth
```

Au boot, dans l'ordre :
1. `[okms-fetch] fetched bundle (prefix=auth)` + liste des keys exportées.
2. `[auth] Rendering nginx config for MAIN_DOMAIN=auth.bernouy.com…`
3. `[auth] Provisioning auth.bernouy.com via lego (HTTP-01 standalone)…` (~30s)
4. `[auth] Starting nginx + Keycloak…`
5. Keycloak fait sa migration de schéma sur Postgres au premier boot
   (~60s) puis devient READY.

---

## 7. Smoke test

```bash
# 1. Containers healthy
sudo docker ps --filter name=auth --format 'table {{.Names}}\t{{.Status}}'

# 2. Cert valide
echo | openssl s_client -connect auth.bernouy.com:443 \
    -servername auth.bernouy.com 2>/dev/null \
    | openssl x509 -noout -issuer -dates

# 3. Master realm OIDC discovery
curl -s https://auth.bernouy.com/realms/master/.well-known/openid-configuration | jq .issuer
# → "https://auth.bernouy.com/realms/master"

# 4. Browser : https://auth.bernouy.com/admin/
#    → login avec KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD du §3a
```

---

## 8. Configuration post-boot — realms + clients

Une fois admin Keycloak accessible, créer les realms + clients
nécessaires aux autres services. Chaque secret Keycloak qui est généré
ici doit être **copié dans le bundle OKMS du service consommateur**
avant de booter ce service.

### 8a. Realm `cdn` + client `cdn-origin`

UI Keycloak → "Create realm" → name `cdn` → Create.

Realm `cdn` → Clients → Create client :
- Client ID : `cdn-origin`
- Client authentication : `On`
- Valid Redirect URIs : `https://cdn-origin.bernouy.com/auth/callback`
- Valid Post Logout Redirect URIs : `https://cdn-origin.bernouy.com/auth/post-logout-callback`
- Save.

Tab **Credentials** → copier le client secret → coller dans le bundle
OKMS `cdn-origin/config` sous la clé `KEYCLOAK_CLIENT_SECRET`.

Realm Roles → Create role `admin` → assigner ce rôle à toi-même
(Users → ton user → Role mapping).

### 8b. Realm `platform` + client `cms-superadmin`

UI → Create realm → name `platform` → Create.

Realm `platform` → Clients → Create client :
- Client ID : `cms-superadmin`
- Client authentication : `On`
- Valid Redirect URIs : `https://cms.bernouy.com/superadmin/auth/callback`
- Valid Post Logout Redirect URIs : `https://cms.bernouy.com/superadmin/auth/post-logout-callback`
- Save.

Tab **Credentials** → copier le client secret → coller dans le bundle
OKMS `cms-control-mt/config` sous la clé
`SUPERADMIN_KEYCLOAK_CLIENT_SECRET`.

Realm Roles → Create role `cms-superadmin` → assigner à toi-même.

### 8c. Per-tenant (au moment de l'onboarding, plus tard)

Chaque tenant CMS qu'on onboarde nécessite son propre realm Keycloak
(ou un client OIDC dans un realm partagé). Voir
`docker/cms-control-mt/DEPLOY.md` §9.

---

## 9. Backup

Postgres est l'unique source de vérité (toute la config Keycloak vit
en DB). Backup minimum : `pg_dump` quotidien. Exemple via cron host :

```bash
sudo docker exec auth-postgres pg_dump -U keycloak -d keycloak \
    | gzip > /var/backups/auth/$(date +%F).sql.gz
```

À planifier en cron host (`crontab -e`).

---

## 10. Update de l'image

```bash
# Sur dev box : rebuild + save + scp.
# Sur le VPS auth :
sudo docker stop auth && sudo docker rm auth
sudo docker run -d --name auth --restart unless-stopped \
    --network auth-net \
    -p 80:80 -p 443:443 \
    -v auth-data:/var/lib/auth \
    -v /etc/auth/okms/client.crt:/etc/okms/client.crt:ro \
    -v /etc/auth/okms/client.key:/etc/okms/client.key:ro \
    --env-file /etc/auth/bootstrap.env \
    bernouy/auth:<new>
```

Volume `auth-data` persiste les certs lego. Volume `auth-pg-data`
persiste toute la config Keycloak (realms, clients, users). `auth-postgres`
n'a pas besoin d'update à chaque rev de l'image `auth`.

Update Postgres : `docker pull postgres:16-alpine` + `stop` + `rm` +
`run` avec le **même volume `auth-pg-data`**. Vérifier les release notes
postgres pour les sauts de major version (16 → 17 nécessite `pg_upgrade`).

---

## 11. Rotation du password Postgres

Cas : compromission ou rotation périodique.

1. Connexion à Postgres et changement du password :
   ```bash
   sudo docker exec -it auth-postgres psql -U keycloak -d keycloak \
       -c "ALTER USER keycloak WITH PASSWORD 'NEW_PASSWORD';"
   ```
2. Mettre à jour `/etc/auth/postgres.env` avec la nouvelle valeur (pour
   les futurs `docker run` du container Postgres).
3. Mettre à jour le bundle OKMS `auth/config` clé `KC_DB_PASSWORD`.
4. Restart le container auth :
   ```bash
   sudo docker restart auth
   ```

---

## 12. Logs

```bash
sudo docker logs -f auth                      # nginx + Keycloak interleaved
sudo docker logs -f auth-postgres
sudo docker exec auth tail -F /var/log/nginx/access.log
sudo docker exec auth cat /etc/nginx/conf.d/auth/nginx.conf
```

---

## 13. Limites connues

- **Keycloak version pinned** dans le Dockerfile (`KEYCLOAK_VERSION`).
  Update = nouveau build. Schéma DB migré automatiquement par Keycloak
  au boot ; les downgrades ne sont **pas** supportés.
- **Single instance** : pas de cluster. Si le VPS auth tombe, plus
  d'auth nulle part. Mitigation acceptable pour test conditions
  réelles, à revoir avant la vraie prod.
- **`KC_HOSTNAME_STRICT=true`** : Keycloak refuse les requêtes sur
  d'autres hostnames que `auth.bernouy.com`. Voulu — protège contre
  les open-redirect via Host header.
- **Initial admin password figé en OKMS** : la rotation côté Keycloak
  (Master realm → users → admin → Reset password) ne re-synchronise
  pas le bundle OKMS. À jour le bundle manuellement après chaque
  rotation, sinon la prochaine recréation du container échouera (le
  flag `KEYCLOAK_ADMIN_PASSWORD` est ignoré une fois l'utilisateur
  existe en DB, donc pas de blocage immédiat — mais tu n'as plus la
  source de vérité).
