# Déploiement prod — `bernouy/cdn-keycloak`

Runbook pour le premier déploiement de l'image cdn-keycloak sur un serveur
de prod. Tout passe en un seul `docker run` avec un volume.

---

## 1. Pré-requis côté serveur prod

| Pré-requis | Vérification |
|---|---|
| Linux + Docker installé | `docker --version` |
| Ports 80 + 443 libres | `sudo ss -tlnp 'sport = :80'` ; même chose pour 443 |
| Docker daemon accessible (groupe ou sudo) | `docker ps` ou `sudo docker ps` |

---

## 2. Pré-requis DNS

Deux records, tous les deux pointant vers l'IP publique du serveur :

| Record | Type | Valeur |
|---|---|---|
| `cdn.bernouy.com` | `A` | `<ip-serveur>` |
| `*.cdn.bernouy.com` | `A` | `<ip-serveur>` |

Vérifier la propagation : `dig +short cdn.bernouy.com @1.1.1.1` doit
renvoyer ton IP. Idem pour un sous-domaine random sous `*`, e.g.
`dig +short any.cdn.bernouy.com @1.1.1.1`.

---

## 3. Pré-requis Keycloak (realm prod)

Dans ton Keycloak (`https://auth.bernouy.com/admin/`, realm `master` ou un
realm dédié) :

1. Créer un client OIDC :
   - **Client ID** : `cdn` (ou ce que tu veux pour la prod, distinct du
     `cdn-test` qu'on utilise en dev).
   - **Client authentication** : `On` (confidential).
   - **Valid Redirect URIs** : `https://cdn.bernouy.com/auth/callback`
   - **Valid Post Logout Redirect URIs** : `https://cdn.bernouy.com/auth/post-logout-callback`
2. Onglet **Credentials** → copier le **Client secret**.
3. **Realm Roles** → vérifier qu'un rôle `admin` existe (ou choisir un
   nom et adapter `KEYCLOAK_ADMIN_ROLE` plus bas).
4. **Users** → assigner ce rôle aux personnes qui doivent accéder à l'UI.

---

## 4. Pré-requis OVH (creds DNS-01 pour le wildcard)

Si déjà fait, sauter. Sinon :

1. Aller sur **https://eu.api.ovh.com/createToken/**.
2. Account ID + Password.
3. **Script name** `cdn-bernouy-lego`, validity `Unlimited`.
4. **Rights** :
   - `GET    /domain/zone/bernouy.com/*`
   - `POST   /domain/zone/bernouy.com/record`
   - `PUT    /domain/zone/bernouy.com/record/*`
   - `DELETE /domain/zone/bernouy.com/record/*`
   - `POST   /domain/zone/bernouy.com/refresh`
5. Submit. Noter `Application Key`, `Application Secret`, `Consumer Key`.

---

## 5. Transférer l'image sur le serveur

L'image n'est pas encore sur un registry, on passe par tarball :

```bash
# Sur la dev box (déjà fait — produit /tmp/cdn-deploy/cdn-keycloak-0.1.0.tar.gz)
docker save bernouy/cdn-keycloak:0.1.0 | gzip > cdn-keycloak-0.1.0.tar.gz

# Transférer
scp cdn-keycloak-0.1.0.tar.gz root@<server>:/tmp/

# Sur le serveur
docker load < /tmp/cdn-keycloak-0.1.0.tar.gz
docker images bernouy/cdn-keycloak    # confirme la tag
```

---

## 6. Préparer le `.env` côté serveur

Crée `/etc/cdn/cdn.env` (root-owned, mode 0600) :

```bash
# /etc/cdn/cdn.env

# ─── Required ──────────────────────────────────────────────────
MAIN_DOMAIN=cdn.bernouy.com
LEGO_EMAIL=ops@bernouy.com

# ─── DNS-01 (wildcard cert) ────────────────────────────────────
LEGO_DNS_PROVIDER=ovh
OVH_APPLICATION_KEY=...
OVH_APPLICATION_SECRET=...
OVH_CONSUMER_KEY=...
OVH_ENDPOINT=ovh-eu

# ─── Keycloak (auth admin) ─────────────────────────────────────
KEYCLOAK_ISSUER=https://auth.bernouy.com/realms/master
KEYCLOAK_CLIENT_ID=cdn
KEYCLOAK_CLIENT_SECRET=...
KEYCLOAK_ADMIN_ROLE=admin
# IMPORTANT — généré une seule fois, gardé stable. Si tu le régénères
# tous les utilisateurs sont reloggés (cookies invalidés).
KEYCLOAK_SESSION_SECRET=<openssl rand -hex 32 — fait UNE fois>

# ─── Backup (cf. section 10) ───────────────────────────────────
# BACKUP_DISABLED=true                # opt-out total des backups
BACKUP_TIME=03:00                     # heure UTC du daily run (défaut 03:00)
BACKUP_LOCAL_RETENTION_DAYS=7         # rétention locale dans le volume
BACKUP_OFFSITE_RETENTION_DAYS=30      # rétention chez le provider distant
BACKUP_RCLONE_REMOTE=b2:bernouy-cdn-backups/prod   # remote rclone (vide = local only)
# BACKUP_RCLONE_CONFIG_PATH=/etc/cdn/rclone.conf   # défaut, rarement à override
```

```bash
sudo install -m 0600 -o root -g root /dev/null /etc/cdn/cdn.env
sudo nano /etc/cdn/cdn.env   # paste + save
```

Génère le session secret une seule fois :

```bash
openssl rand -hex 32
```

Et colle le résultat dans `KEYCLOAK_SESSION_SECRET=`.

---

## 7. (Optionnel) Test ACME staging d'abord

Avant de péter ton quota Let's Encrypt prod (5 certs identiques / semaine),
test contre staging :

```bash
sudo docker run -d --name cdn-staging \
    --restart unless-stopped \
    -p 80:80 -p 443:443 \
    -v cdn-staging-data:/var/lib/cdn \
    -v /etc/cdn/rclone.conf:/etc/cdn/rclone.conf:ro \
    --env-file /etc/cdn/cdn.env \
    -e LEGO_SERVER=https://acme-staging-v02.api.letsencrypt.org/directory \
    bernouy/cdn-keycloak:0.1.0

sudo docker logs -f cdn-staging   # watch lego provision via OVH
```

Le premier boot prend 1-3 min (lego DNS-01 + propagation TXT). Tu dois voir :
```
[cdn] Provisioning *.cdn.bernouy.com via lego (--dns ovh)…
[INFO] [cdn.bernouy.com, *.cdn.bernouy.com] acme: Obtaining bundled SAN certificate
...
[INFO] Server responded with a certificate.
```

Vérifier le cert :
```bash
echo | openssl s_client -connect localhost:443 -servername cdn.bernouy.com 2>/dev/null \
    | openssl x509 -noout -issuer -dates
# Issuer doit contenir "(STAGING) Let's Encrypt"
```

Si OK, drop le staging et passe en prod :
```bash
sudo docker rm -f cdn-staging
sudo docker volume rm cdn-staging-data
```

---

## 8. Lancement prod

```bash
sudo docker run -d --name cdn \
    --restart unless-stopped \
    -p 80:80 -p 443:443 \
    -v cdn-data:/var/lib/cdn \
    -v /etc/cdn/rclone.conf:/etc/cdn/rclone.conf:ro \
    --env-file /etc/cdn/cdn.env \
    bernouy/cdn-keycloak:0.1.0

sudo docker logs -f cdn
```

Premier boot = lego provisionne le wildcard via OVH (~1-3 min).
Une fois le cert obtenu, nginx démarre, healthcheck devient `healthy`.

---

## 9. Smoke test post-deploy

```bash
# 1. Container healthy
sudo docker ps --filter name=cdn --format 'table {{.Status}}'
# → expected: Up X (healthy)

# 2. HTTPS répond — utiliser GET, pas HEAD (`-I`) : bun ne route pas HEAD
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://cdn.bernouy.com/admin/buckets
# → expected: 302 -> https://cdn.bernouy.com/auth/login?returnTo=%2Fadmin%2Fbuckets

# 3. cert prod
echo | openssl s_client -connect cdn.bernouy.com:443 -servername cdn.bernouy.com 2>/dev/null \
    | openssl x509 -noout -issuer -ext subjectAltName
# → Issuer doit contenir "Let's Encrypt" (sans "STAGING")
# → SAN: DNS:*.cdn.bernouy.com, DNS:cdn.bernouy.com

# 4. Browser : https://cdn.bernouy.com/admin/buckets
# → redirect Keycloak → login → page admin
```

---

## 10. Backup

Le container embarque un job quotidien qui :

1. **mongodump** → `/var/lib/cdn/backups/mongo-<DATE>.archive.gz` (gzipped archive)
2. **tar** de `/var/lib/cdn/buckets` → `/var/lib/cdn/backups/buckets-<DATE>.tar.gz`
3. **rclone copy** (optionnel) vers un remote off-site
4. Rotation locale (`BACKUP_LOCAL_RETENTION_DAYS`, défaut 7)
5. Rotation off-site (`BACKUP_OFFSITE_RETENTION_DAYS`, défaut 30)

Tout est piloté par les `BACKUP_*` du `.env` (cf. section 6). Le job tourne
chaque jour à `BACKUP_TIME` UTC (défaut `03:00`). Pour désactiver totalement :
`BACKUP_DISABLED=true`.

### 10.1 Off-site avec rclone

Crée `/etc/cdn/rclone.conf` côté host (mode 0600 root). Exemple Backblaze B2 :

```ini
[b2]
type = b2
account = <keyID>
key = <applicationKey>
hard_delete = true
```

Exemple S3 (AWS, MinIO, Wasabi, …) :

```ini
[s3]
type = s3
provider = AWS
access_key_id = ...
secret_access_key = ...
region = eu-west-3
```

Crée le bucket distant **avant** le premier run :
```bash
sudo docker run --rm -v /etc/cdn/rclone.conf:/cfg/rclone.conf \
    rclone/rclone --config /cfg/rclone.conf mkdir b2:bernouy-cdn-backups
```

Le container monte le fichier en lecture seule (cf. `docker run` section 8).
Pose `BACKUP_RCLONE_REMOTE=b2:bernouy-cdn-backups/prod` dans le `.env` —
laissé vide, les backups restent local-only.

> **Sécurité** : génère une *application key* B2/S3 limitée au bucket de
> backup, pas une clé root. Si la box prod est compromise, l'attaquant ne
> doit pas pouvoir vider l'historique en remontant la chaîne.

### 10.2 Vérifier qu'il tourne

```bash
# Logs du dernier run
sudo docker logs cdn 2>&1 | grep '\[backup\]' | tail

# Liste les backups locaux
sudo docker exec cdn ls -la /var/lib/cdn/backups/

# Liste off-site
sudo docker exec cdn rclone --config /etc/cdn/rclone.conf ls "${BACKUP_RCLONE_REMOTE}"
```

### 10.3 Trigger manuel (avant un upgrade par exemple)

```bash
sudo docker exec cdn /usr/local/bin/cdn-backup.sh
```

### 10.4 Restore

```bash
# 1. Récupérer un backup off-site → host
sudo docker exec cdn rclone --config /etc/cdn/rclone.conf copy \
    b2:bernouy-cdn-backups/prod/mongo-20260505-030000.archive.gz   /tmp/
sudo docker exec cdn rclone --config /etc/cdn/rclone.conf copy \
    b2:bernouy-cdn-backups/prod/buckets-20260505-030000.tar.gz     /tmp/

# 2. Restore mongo (--drop écrase la DB existante)
sudo docker exec -i cdn mongorestore --gzip --archive=/tmp/mongo-20260505-030000.archive.gz --drop

# 3. Restore buckets (sur volume neuf si recovery total, sinon écrase)
sudo docker exec cdn sh -c \
    'rm -rf /var/lib/cdn/buckets && tar -C /var/lib/cdn -xzf /tmp/buckets-20260505-030000.tar.gz'

# 4. Reload nginx (le mapping de buckets est statique, mais safety)
sudo docker exec cdn sudo nginx -s reload
```

Pour un recovery *complet* (perte totale du serveur) : déploie un nouveau
container vide selon les sections 5-8, puis applique 10.4 sur un volume
fraîchement créé.

---

## 11. Update de l'image

```bash
# Sur dev — build + tag nouvelle version
docker buildx build --network=host \
    --build-context webcomponents=/home/.../WebComponents \
    -f docker/cdn-keycloak/Dockerfile \
    -t bernouy/cdn-keycloak:0.2.0 .
docker save bernouy/cdn-keycloak:0.2.0 | gzip > cdn-keycloak-0.2.0.tar.gz
scp ...

# Sur le serveur
docker load < cdn-keycloak-0.2.0.tar.gz
sudo docker stop cdn
sudo docker rename cdn cdn-old   # garder l'ancien quelques jours
sudo docker run -d --name cdn --restart unless-stopped \
    -p 80:80 -p 443:443 \
    -v cdn-data:/var/lib/cdn \
    -v /etc/cdn/rclone.conf:/etc/cdn/rclone.conf:ro \
    --env-file /etc/cdn/cdn.env \
    bernouy/cdn-keycloak:0.2.0
sudo docker logs -f cdn

# Quand confirmé OK, drop l'ancien
sudo docker rm cdn-old
```

Le volume `cdn-data` persiste entre les versions, donc pas de perte de
données. Mongo upgrades major (e.g. 7→8) nécessitent une procédure de
migration spécifique — voir [docs Mongo](https://www.mongodb.com/docs/).

---

## 12. Logs + observability

```bash
# logs en live
sudo docker logs -f cdn

# state actuel du healthcheck
sudo docker inspect cdn --format '{{json .State.Health}}' | jq

# inspect mongo (loopback only)
sudo docker exec -it cdn mongosh cdn

# dump des fragments nginx générés
sudo docker exec cdn cat /etc/nginx/conf.d/cdn/generated/aliases.conf
sudo docker exec cdn cat /etc/nginx/conf.d/cdn/generated/aliasesServers.conf
sudo docker exec cdn cat /etc/nginx/conf.d/cdn/generated/cacheControls.conf
```

---

## 13. Renouvellement des certs

- **Wildcard `*.cdn.bernouy.com`** : la boucle daily dans l'entrypoint
  invoque `lego renew` toutes les 24h. lego ne renouvelle qu'à 30j de
  l'expiration. Aucune action requise.
- **Aliases (clients)** : `POST /admin/api/aliases/renew` parcourt tous
  les aliases et lance `lego renew`. À déclencher via cron côté host
  (curl avec session admin) ou via un job in-process.

---

## 14. Limites connues

- **Single failure domain** : mongod + nginx + bun share le même container.
  Si l'un crash, l'entrypoint kill tout, le `--restart unless-stopped`
  remonte le tout. OK pour un déploiement medium-traffic ; pour du SLA-
  sensitive, séparer mongo en sidecar.
- **Mongo sans auth** : bind 127.0.0.1 only. Personne d'autre que le bun
  process ne peut atteindre le port 27017 (via réseau du container).
- **Pas de log shipping natif** — `docker logs` only. Brancher un driver
  syslog/json-file → loki/datadog si besoin.
- **UI : pas de confirm avant bucket delete** — destructif, attention au
  click. Fix prévu mais pas bloquant.
