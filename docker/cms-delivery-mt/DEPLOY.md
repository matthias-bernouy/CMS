# Déploiement prod — `bernouy/cms-delivery-mt`

Runbook pour déployer le **Delivery cron** multi-tenant. Ce service est
le **pendant headless** de `cms-control-mt` : pas d'inbound HTTP, pas de
TLS, pas de nginx — juste un process bun qui tick toutes les
`DELIVERY_INTERVAL_MS`, itère les tenants enregistrés, et pour chaque
tenant avec `delivery.enabled === true` fait :

- render des pages via `DeliveryBuilder.runOnce()`
- génère les variants images (Playwright + Chromium)
- upload tout dans le bucket CDN public du tenant

Partage la même DB Mongo (`tenants` collection) que `cms-control-mt`.
Tourne typiquement sur la même VM que ce dernier.

> Pré-requis : `cms-control-mt` déjà déployé et au moins un tenant
> onboardé avec `delivery.enabled === true` dans son record Mongo
> (cf. [`docker/cms-control-mt/DEPLOY.md`](../cms-control-mt/DEPLOY.md) §10).

---

## 1. Pré-requis serveur

Si tu déploies sur la même VM que `cms-control-mt`, le bootstrap
`init-server.sh --role cms` a déjà été fait → **skip ce §1**.

Sinon (VM dédiée pour le delivery, configuration plus rare) :

```bash
# Sur la dev box (depuis la racine du repo)
scp docker/init-server.sh root@<delivery-host>:/tmp/

# Sur le VPS delivery
sudo bash /tmp/init-server.sh --role cms
```

→ apt + Docker CE + ufw (OpenSSH publics) + systemd-timesyncd.
Idempotent.

| Pré-requis | Vérification |
|---|---|
| Linux + Docker | `docker --version` |
| Accès réseau au MongoDB externe | `mongosh "$MONGO_URL" --eval 'db.runCommand({ping:1})'` |
| Accès réseau au broker du bucket CDN du tenant | `curl -sI <tenant.assetsCdn.url>` |
| ~250 MB de RAM par worker concurrent (Chromium) | `free -m` |

> Pas de port public à ouvrir : ce container n'expose rien.

---

## 2. Provisionner le secret bundle dans OKMS

Le container ne lit aucun secret depuis un `.env` — tout vient d'un
bundle KV2 dans **OVHcloud Secret Manager**.

### 2a. Créer le bundle `prod/cms-delivery-mt/config`

Manager OVHcloud → ton OKMS domain → Secrets → New secret.
- Path : `prod/cms-delivery-mt/config` (doit matcher exactement la
  valeur de `OKMS_SECRET_PREFIX` du §3b — slashes, casse, pas de `/`
  final).
- Type : KV2 / object
- Clés à renseigner :

| Clé | Valeur | Notes |
|---|---|---|
| `MONGO_URL` | `mongodb+srv://user:pass@<cluster>.mongodb.net/?retryWrites=true` | Même cluster que cms-control-mt. User read-only sur `tenants` est suffisant pour l'instant ; lecture/écriture sur `tenant_<id>__*` collections futures. |
| `MONGO_DB_NAME` | `mt-cms` | Même DB que cms-control-mt. |
| `DELIVERY_INTERVAL_MS` | `60000` | (optionnel) ms entre deux ticks. Défaut 60s. |
| `DELIVERY_CONCURRENCY` | `4` | (optionnel) nb max de tenants buildés en parallèle. Cap soft à `min(N tenants, valeur)`. |
| `DELIVERY_VARIANT_URL_PATTERN` | `https://cdn.bernouy.com/{bucketId}/{path}?w={width}` | (optionnel) pattern d'URL pour les variants images générées. Si absent, pas de génération de variants. |
| `DELIVERY_DISABLE_PLAYWRIGHT` | `false` | (optionnel) si `true`, skip l'enhancement images. Utile en dev / sur une box sans Chromium. |

### 2b. Compte de service + access cert + policy IAM

Procédure dans le **runbook global** §0.2 → §0.4
([`docker/DEPLOY.md`](../DEPLOY.md#0-ovhcloud-secret-manager-okms--source-unique-des-secrets)).
Résumé pour le service `cms-delivery-mt` :

1. **Compte de service** : IAM/Sécurité → Comptes de service →
   "Ajouter" → nom `cms-delivery-mt`.
2. **Access cert** : Secret Manager → ton domain → Certificats d'accès
   → "Générer" en sélectionnant le compte → télécharger cert + key
   (**download unique**).
3. **Policy IAM** : IAM → Politiques → "Ajouter" :
   - Identités : compte `cms-delivery-mt`
   - Type de produit : OKMS
   - Ressources : (vide — toutes ressources OKMS du domain)
   - Actions : `okms:apikms:secretConfig/get` (ou `okms:apikms:*`)
   - Save → attendre 30-60s de propagation.

> Si la VM héberge déjà `cms-control-mt`, **n'utilise PAS le même
> access cert** — chaque service son propre couple (compte de service +
> cert + policy) pour limiter le blast radius si l'un fuit.

---

## 3. Bootstrap du host

### 3a. Déposer le cert + key OKMS

```bash
sudo install -d -m 0700 -o root -g root /etc/cms-delivery-mt/okms
sudo install -m 0600 -o root -g root /dev/null /etc/cms-delivery-mt/okms/client.crt
sudo install -m 0400 -o root -g root /dev/null /etc/cms-delivery-mt/okms/client.key
sudo nano /etc/cms-delivery-mt/okms/client.crt   # paste cert PEM (§2b)
sudo nano /etc/cms-delivery-mt/okms/client.key   # paste key PEM
sudo chmod 0600 /etc/cms-delivery-mt/okms/client.crt
sudo chmod 0400 /etc/cms-delivery-mt/okms/client.key
```

### 3b. `bootstrap.env`

```bash
sudo install -d -m 0700 -o root -g root /etc/cms-delivery-mt
sudo install -m 0600 -o root -g root /dev/null /etc/cms-delivery-mt/bootstrap.env
sudo nano /etc/cms-delivery-mt/bootstrap.env
```

Contenu (5 vars) :

```bash
OKMS_REGION=eu-west-rbx
OKMS_DOMAIN_ID=<uuid-du-domain>
OKMS_CERT_PATH=/etc/okms/client.crt              # path DANS le container
OKMS_KEY_PATH=/etc/okms/client.key
OKMS_SECRET_PREFIX=prod/cms-delivery-mt/config   # path COMPLET du secret (§2a)
```

---

## 4. Build + transfert de l'image

```bash
# Sur la dev box (depuis la racine du repo)
docker buildx build --network=host \
    -f docker/cms-delivery-mt/Dockerfile \
    -t bernouy/cms-delivery-mt:0.2.0 .
docker save bernouy/cms-delivery-mt:0.2.0 | gzip > cms-delivery-mt-0.2.0.tar.gz
scp cms-delivery-mt-0.2.0.tar.gz <user>@<server>:/tmp/

# Sur le serveur
sudo docker load < /tmp/cms-delivery-mt-0.2.0.tar.gz
sudo docker images bernouy/cms-delivery-mt
```

> Image lourde (~700 MB compressé) : embarque Chromium pour Playwright.

---

## 5. Lancement

```bash
sudo docker run -d --name cms-delivery-mt \
    --restart unless-stopped \
    --dns 1.1.1.1 --dns 8.8.8.8 \
    -v /etc/cms-delivery-mt/okms/client.crt:/etc/okms/client.crt:ro \
    -v /etc/cms-delivery-mt/okms/client.key:/etc/okms/client.key:ro \
    --env-file /etc/cms-delivery-mt/bootstrap.env \
    bernouy/cms-delivery-mt:0.2.0

sudo docker logs -f cms-delivery-mt
```

Au boot tu verras :
1. `[okms-fetch] fetched bundle (prefix=prod/cms-delivery-mt/config)`
2. `[okms-fetch] exported keys: MONGO_URL MONGO_DB_NAME …`
3. `✅ cms-delivery-mt started (interval=60000ms, concurrency=4, playwright=true, variants=true)`
4. À chaque tick, lignes `[delivery] tenant <id>: building…` puis
   `[delivery] tenant <id>: built N pages, M variants in <ms>ms`.

> Pas de healthcheck HTTP : le container ne sert rien. La supervision
> se fait via `docker logs` et l'état des artefacts dans le bucket CDN
> de chaque tenant.

---

## 6. Smoke test

```bash
# 1. Container running
sudo docker ps --filter name=cms-delivery-mt --format 'table {{.Status}}'

# 2. Premier tick visible dans les logs (attendre ~60s après start)
sudo docker logs cms-delivery-mt 2>&1 | grep -E "tenant .*: built"

# 3. Vérifier qu'au moins un fichier est arrivé sur le bucket d'un tenant
curl -I https://<PUBLIC_DOMAIN>/<tenant-bucket-id>/index.html
# → HTTP/2 200 (avec Content-Type: text/html)
```

---

## 7. Update de l'image

```bash
# Sur dev box : rebuild + save + scp
# Sur le VPS :
sudo docker stop cms-delivery-mt && sudo docker rm cms-delivery-mt
sudo docker run -d --name cms-delivery-mt --restart unless-stopped \
    --dns 1.1.1.1 --dns 8.8.8.8 \
    -v /etc/cms-delivery-mt/okms/client.crt:/etc/okms/client.crt:ro \
    -v /etc/cms-delivery-mt/okms/client.key:/etc/okms/client.key:ro \
    --env-file /etc/cms-delivery-mt/bootstrap.env \
    bernouy/cms-delivery-mt:<new>
```

Pas de volume persisté : l'état vit en Mongo + dans le bucket CDN du
tenant (idempotent — un re-run ré-upload ce qui a déjà été uploadé).

---

## 8. Logs + observability

```bash
sudo docker logs -f cms-delivery-mt
sudo docker logs cms-delivery-mt 2>&1 | grep -E "ERROR|FATAL|tenant .*: failed"
```

Pas de log file dédié : tout passe par stdout. Pour archiver, brancher
un sidecar `vector` / `promtail` côté host.

---

## 9. Limites connues

- **Pas de back-pressure inter-tick** : si un tick prend plus de
  `DELIVERY_INTERVAL_MS`, le suivant attend la fin du précédent. Pas de
  ré-entrance. Sous charge, augmenter `DELIVERY_INTERVAL_MS` ou
  `DELIVERY_CONCURRENCY`.
- **Playwright = ~250 MB par worker** : `DELIVERY_CONCURRENCY=8` veut
  dire ~2 GB de RAM réservés en peak. Calibrer selon la VM.
- **Pas de retry par tenant** : si un build de tenant fail, log l'erreur
  et passe au suivant. Le prochain tick re-tentera.
- **Pas de delete-tracking** : un fichier supprimé côté Control n'est
  pas supprimé du bucket par cette image. Cleanup manuel ou via le
  `BucketProxyPublisher` côté Control (futur).
