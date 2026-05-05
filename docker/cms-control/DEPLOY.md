# Déploiement prod — `bernouy/cms-control`

Runbook pour déployer le CMS (admin/control uniquement) sur un serveur de
prod. MongoDB **externe**, CDN externe (broker pattern). TLS embarqué via
lego DNS-01.

---

## 1. Pré-requis côté serveur prod

| Pré-requis | Vérification |
|---|---|
| Linux + Docker installé | `docker --version` |
| Ports 80 + 443 libres | `sudo ss -tlnp 'sport = :80'` ; idem 443 |
| Docker daemon accessible (groupe ou sudo) | `docker ps` |
| Accès réseau au MongoDB externe | `mongosh "$MONGO_URL" --eval 'db.runCommand({ping:1})'` |
| Accès réseau au CDN | `curl -sI https://cdn.bernouy.com/admin/buckets` |

---

## 2. Pré-requis DNS

Un seul record :

| Record | Type | Valeur |
|---|---|---|
| `cms.bernouy.com` | `A` | `<ip-serveur-cms>` |

Vérifier : `dig +short cms.bernouy.com @1.1.1.1` doit renvoyer ton IP.

---

## 3. Pré-requis Keycloak

Dans `https://auth.bernouy.com/admin/`, realm `master` (ou un realm dédié) :

1. **Créer un client OIDC** distinct du `cdn` :
   - **Client ID** : `cms`
   - **Client authentication** : `On` (confidential).
   - **Valid Redirect URIs** : `https://cms.bernouy.com/auth/callback`
   - **Valid Post Logout Redirect URIs** : `https://cms.bernouy.com/auth/post-logout-callback`
2. Onglet **Credentials** → copier le **Client secret**.
3. **Realm Roles** → vérifier qu'un rôle `admin` existe (sinon créer + adapter
   `KEYCLOAK_ADMIN_ROLE`).
4. **Users** → assigner le rôle aux personnes qui doivent accéder à l'admin CMS.
5. **Manage tokens URL** — copier l'URL d'auto-management du compte Keycloak,
   typiquement `https://auth.bernouy.com/realms/master/account/`.

---

## 4. Pré-requis CDN — créer le bucket dédié + credential

Sur l'admin CDN (`https://cdn.bernouy.com/admin/buckets`) :

1. **Créer un bucket** dédié à ce CMS (e.g. `cms-prod`) avec les paramètres
   habituels (cacheControl, maxFileSize, MIME, …).
2. **`allowedUploadOrigins`** → ajouter l'origin du CMS :
   ```
   https://cms.bernouy.com
   ```
   (CSV-séparable si plusieurs ; `*` accepté pour permissif). Sans ça,
   le browser CMS ne pourra pas uploader cross-origin (CORS bloque).
3. **Émettre une credential** pour le bucket (page bucket-detail
   → "+ New credential"). **Copier le bearer token** — il ne sera plus
   affiché ensuite. Il sera mis dans `CDN_BUCKET_CREDENTIAL` plus bas.

---

## 5. Cert TLS — HTTP-01

Pas besoin de provider DNS. Lego provisionne le cert via HTTP-01 :
- **Premier boot** : lego en mode standalone (binde directement le port 80
  pendant le challenge — nginx n'est pas encore démarré).
- **Renouvellements** : webroot via nginx (challenge sert depuis
  `/var/lib/cms/lego/webroot/.well-known/acme-challenge/`).

Pré-requis : que le port 80 soit **joignable depuis Internet** (Let's Encrypt
fait un GET externe pour valider le challenge). Pas de firewall hébergeur
qui bloque, pas de proxy en amont.

---

## 6. Pré-requis MongoDB externe

Tu as un MongoDB joignable depuis le serveur prod. Le CMS y crée :
- Une DB `cms` (ou `MONGO_DB_NAME`)
- Collections `pages`, `blocs`, `templates`, `snippets`, `system`

Bonnes pratiques :
- Compte dédié à ce CMS (pas `root`), avec lecture/écriture seulement sur
  cette DB.
- Sauvegarde du Mongo gérée hors du container (mongodump cron côté provider
  Mongo, ou outils managed).

---

## 7. Transférer l'image sur le serveur

```bash
# Sur la dev box (déjà fait — produit /tmp/cms-deploy/cms-control-0.1.0.tar.gz)
docker save bernouy/cms-control:0.1.0 | gzip > cms-control-0.1.0.tar.gz

# Transférer
scp cms-control-0.1.0.tar.gz <user>@<server>:/tmp/

# Sur le serveur
sudo docker load < /tmp/cms-control-0.1.0.tar.gz
sudo docker images bernouy/cms-control
```

---

## 8. Préparer le `.env` côté serveur

Crée `/etc/cms/cms.env` (root-owned, mode 0600) :

```bash
# /etc/cms/cms.env

# ─── Required ──────────────────────────────────────────────────
MAIN_DOMAIN=cms.bernouy.com
LEGO_EMAIL=ops@bernouy.com

# ─── MongoDB externe ───────────────────────────────────────────
MONGO_URL=mongodb://user:pass@mongo.example.com:27017/?authSource=admin
MONGO_DB_NAME=cms

# ─── Keycloak ──────────────────────────────────────────────────
KEYCLOAK_ISSUER=https://auth.bernouy.com/realms/master
KEYCLOAK_CLIENT_ID=cms
KEYCLOAK_CLIENT_SECRET=...
KEYCLOAK_ADMIN_ROLE=admin
KEYCLOAK_TOKENS_URL=https://auth.bernouy.com/realms/master/account/
# IMPORTANT — généré une seule fois, stable. Régénération = tout le monde reloggé.
KEYCLOAK_SESSION_SECRET=<openssl rand -hex 32 — fait UNE fois>

# ─── CDN ───────────────────────────────────────────────────────
CDN_URL=https://cdn.bernouy.com
CDN_BUCKET_CREDENTIAL=<bearer token bucket>
```

```bash
sudo install -d -m 0700 -o root -g root /etc/cms
sudo install -m 0600 -o root -g root /dev/null /etc/cms/cms.env
sudo nano /etc/cms/cms.env   # paste + save
```

Génère le session secret une seule fois :
```bash
openssl rand -hex 32
```

---

## 9. (Optionnel) Test ACME staging d'abord

```bash
sudo docker run -d --name cms-staging \
    --restart unless-stopped \
    -p 80:80 -p 443:443 \
    -v cms-staging-data:/var/lib/cms \
    --env-file /etc/cms/cms.env \
    -e LEGO_SERVER=https://acme-staging-v02.api.letsencrypt.org/directory \
    bernouy/cms-control:0.1.0

sudo docker logs -f cms-staging
```

Vérifier le cert :
```bash
echo | openssl s_client -connect localhost:443 -servername cms.bernouy.com 2>/dev/null \
    | openssl x509 -noout -issuer -dates
# Issuer doit contenir "(STAGING) Let's Encrypt"
```

Drop staging quand OK :
```bash
sudo docker rm -f cms-staging
sudo docker volume rm cms-staging-data
```

---

## 10. Lancement prod

```bash
sudo docker run -d --name cms \
    --restart unless-stopped \
    -p 80:80 -p 443:443 \
    -v cms-data:/var/lib/cms \
    --env-file /etc/cms/cms.env \
    bernouy/cms-control:0.1.0

sudo docker logs -f cms
```

Premier boot = lego provisionne le cert via OVH (~1-3 min). Healthcheck
devient `healthy` quand bun a terminé le boot (init Mongo + broker
getBucketInfo + ControlCms ready).

---

## 11. Smoke test post-deploy

```bash
# 1. Container healthy
sudo docker ps --filter name=cms --format 'table {{.Status}}'

# 2. HTTPS répond — utiliser GET (pas -I qui envoie HEAD non routé)
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
    https://cms.bernouy.com/cms/admin/pages
# → expected: 302 -> /auth/login?returnTo=/cms/admin/pages

# 3. Cert prod
echo | openssl s_client -connect cms.bernouy.com:443 -servername cms.bernouy.com 2>/dev/null \
    | openssl x509 -noout -issuer -dates

# 4. Browser : https://cms.bernouy.com/cms/admin/pages
# → redirect Keycloak → login → page admin
# → tester un upload media : doit utiliser le broker → CDN sans erreur CORS
```

---

## 12. Update de l'image

```bash
# Sur dev — build + tag nouvelle version
docker buildx build --network=host \
    --build-context webcomponents=/home/.../WebComponents \
    -f docker/cms-control/Dockerfile \
    -t bernouy/cms-control:0.2.0 .
docker save bernouy/cms-control:0.2.0 | gzip > cms-control-0.2.0.tar.gz
scp ...

# Sur le serveur
sudo docker load < cms-control-0.2.0.tar.gz
sudo docker stop cms
sudo docker rename cms cms-old
sudo docker run -d --name cms --restart unless-stopped \
    -p 80:80 -p 443:443 \
    -v cms-data:/var/lib/cms \
    --env-file /etc/cms/cms.env \
    bernouy/cms-control:0.2.0
sudo docker logs -f cms

# Quand OK, drop l'ancien
sudo docker rm cms-old
```

Le volume `cms-data` ne porte que les certs lego — pas de données métier
(Mongo est externe).

---

## 13. Logs + observability

```bash
sudo docker logs -f cms
sudo docker inspect cms --format '{{json .State.Health}}' | jq
```

---

## 14. Renouvellement des certs

Boucle daily dans l'entrypoint invoque `lego renew` toutes les 24h. lego
ne renouvelle qu'à 30j de l'expiration. Aucune action requise.

---

## 15. Limites connues

- **Single failure domain** : si bun ou nginx crash, le `--restart
  unless-stopped` remonte le tout. Pas de tolérance multi-instance.
- **Single-tenant** — un container = un CMS = un bucket CDN. Multi-tenant
  par scoping de runner pas câblé dans cette image (faisable mais futur).
- **Pas de backup intégré** — Mongo est externe, donc backuper côté provider
  Mongo. Le volume `cms-data` ne contient que les certs lego (régénérables).
- **Mongo écrit `appendFile` sur control-components.js à chaque boot** — le
  fichier grossit légèrement à chaque restart (script d'hydratation). À
  surveiller à long terme si nombreux restarts.
