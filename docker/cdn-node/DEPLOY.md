# Déploiement prod — `bernouy/cdn-origin`

Runbook pour déployer **l'origin** d'un cluster CDN. L'origin :
- héberge `/var/lib/cdn/buckets` (source de vérité des blobs)
- expose l'admin sur `https://<MAIN_DOMAIN>` (Keycloak-protected)
- pousse les blobs vers tous les edges via `lsyncd` over SSH
- mint le cert `<MAIN_DOMAIN>` (admin, single-host) ET `<PUBLIC_DOMAIN>`
  (servi par les edges, validé en HTTP-01 via les edges qui proxy_pass back)
- expose `/edge-api/secrets` que chaque edge poll en bearer pour récupérer
  le manifest de secrets proxy (cf. cdn-edge)

Pour la procédure complète de déploiement d'un edge (host bootstrap,
pubkey paste, enregistrement dans l'admin, OKMS bundle, run du
container, smoke tests), voir [`docker/cdn-edge/DEPLOY.md`](../cdn-edge/DEPLOY.md).

---

## 1. Pré-requis serveur

```bash
# Sur la dev box (depuis la racine du repo) — push le script vers le VPS
scp docker/init-server.sh root@<origin>:/tmp/

# Sur le VPS origin
sudo bash /tmp/init-server.sh --role origin
```

→ apt + Docker CE + ufw (OpenSSH + 80/443 publics) + systemd-timesyncd.
Idempotent.

| Pré-requis | Vérification |
|---|---|
| Linux + Docker | `docker --version` |
| Ports 80 + 443 libres | `sudo ss -tlnp 'sport = :80'` ; idem 443 |
| Sortie SSH (TCP/22) ouverte vers les edges | testée après [`cdn-edge/DEPLOY.md`](../cdn-edge/DEPLOY.md) §4 |
| Entrée HTTP/80 ouverte depuis les edges (proxy_back ACME) | côté firewall |
| Accès réseau au MongoDB externe | `mongosh "$MONGO_URL" --eval 'db.runCommand({ping:1})'` |

**Important** : choisir un origin **dans un réseau différent** des edges
(provider distinct, datacenter distinct) — défense en profondeur contre
les pannes de zone.

---

## 2. DNS

| Record | Type | Valeur |
|---|---|---|
| `cdn-origin.bernouy.com` | `A` | `<ip-origin>` |

L'origin ne sert que son admin sur ce host — aucun bucket n'est servi
ici. Les buckets sont path-based (`https://<PUBLIC_DOMAIN>/<bucket-id>/...`),
servis par les edges. Le DNS public `cdn.bernouy.com` (round-robin A vers
les edges) est géré au moment de l'enregistrement des edges (cf. cdn-edge
DEPLOY §9).

---

## 3. Pré-requis Keycloak

Pré-requis : `auth.bernouy.com` déjà déployé (cf. [`auth/DEPLOY.md`](../auth/DEPLOY.md)).

Sur l'admin Keycloak (`https://auth.bernouy.com/admin/`) :

1. **Créer un tenant** (= un realm Keycloak) qui hébergera le client
   `cdn-origin`. Le nom du realm est libre — réutilise un realm tenant
   existant ou crée-en un dédié à l'admin de l'infra.
2. Dans ce realm, créer un client OIDC :
   | Champ | Valeur |
   |---|---|
   | Client ID | `cdn-origin` |
   | Client authentication | `On` (confidential) |
   | Valid Redirect URIs | `https://cdn-origin.bernouy.com/auth/callback` |
   | Valid Post Logout Redirect URIs | `https://cdn-origin.bernouy.com/auth/post-logout-callback` |
3. Tab **Credentials** → copier le client secret → coller dans le
   bundle OKMS `prod/cdn-origin/config` sous la clé `KEYCLOAK_CLIENT_SECRET`
   (cf. §5b). Renseigne aussi `KEYCLOAK_ISSUER` avec le realm choisi
   (`https://auth.bernouy.com/realms/<ton-realm>`).
4. Realm Roles → créer `admin` → assigner aux ops via Users → `<user>`
   → Role mapping.

---

## 4. Certs ACME (HTTP-01 only)

L'origin a besoin de **deux** certs single-host, tous deux émis en
HTTP-01 :

- `MAIN_DOMAIN` (e.g. `cdn-origin.bernouy.com`) : émis en HTTP-01
  **standalone** au premier boot (lego bind :80 directement). Requiert
  TCP/80 ouvert depuis Internet et le record DNS A déjà propagé.
- `PUBLIC_DOMAIN` (e.g. `cdn.bernouy.com`) : émis en HTTP-01
  **webroot**, validé via les edges qui proxy_pass
  `/.well-known/acme-challenge/` vers l'origin.

Les buckets sont path-based (`https://<PUBLIC_DOMAIN>/<bucket-id>/...`) —
un seul cert single-host pour `PUBLIC_DOMAIN` couvre tous les buckets.
Les domaines custom de tenants passent par le système d'aliases (cert
per-alias émis via HTTP-01 côté edge).

---

## 5. Provisionner le secret bundle dans OKMS

Pré-requis : un OKMS domain provisionné (cf. [global DEPLOY.md §0.1](../DEPLOY.md#01-provisionner-un-okms-domain)).
Note l'**UUID** + la **région** (e.g. `eu-west-rbx`).

### 5a. Générer le KEK

```bash
openssl rand -base64 32
```

44 chars base64 → 32 bytes (AES-256). **Si tu perds le KEK plus tard,
tu perds toutes les auth de proxies en Mongo.**

### 5b. Créer le bundle secret

Manager OVHcloud → ton OKMS domain → Secrets → "Ajouter un secret".
- Path : `prod/cdn-origin/config` (ou autre — ce qui compte c'est de
  mettre exactement la même valeur dans `OKMS_SECRET_PREFIX` du §7b)
- Type : Clé/valeur (KV2)
- Clés à renseigner :

| Clé | Valeur |
|---|---|
| `MAIN_DOMAIN` | `cdn-origin.bernouy.com` |
| `PUBLIC_DOMAIN` | `cdn.bernouy.com` |
| `LEGO_EMAIL` | `ops@bernouy.com` |
| `MONGO_URL` | `mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true` |
| `MONGO_DB_NAME` | `cdn` |
| `CDN_BUCKETS_KEK` | (le base64 de §5a) |
| `KEYCLOAK_ISSUER` | `https://auth.bernouy.com/realms/<ton-realm>` (cf. §3) |
| `KEYCLOAK_CLIENT_ID` | `cdn-origin` |
| `KEYCLOAK_CLIENT_SECRET` | depuis Keycloak (§3) |
| `KEYCLOAK_SESSION_SECRET` | `openssl rand -hex 32` |
| `KEYCLOAK_ADMIN_ROLE` | `admin` |

> `KEYCLOAK_CLIENT_SECRET` ne sera disponible qu'après l'étape 3 (création
> du client `cdn-origin` dans Keycloak). Tu peux créer le bundle vide pour
> ces 2 clés et compléter ensuite, ou faire l'étape 3 d'abord.

**Exemple JSON copy-paste** (remplace les `REPLACE_*` par les vraies
valeurs ; l'UI OVH Secret Manager accepte un import JSON via le bouton
"Mode JSON" / "Edit raw" selon la version) :

```json
{
  "MAIN_DOMAIN": "cdn-origin.bernouy.com",
  "PUBLIC_DOMAIN": "cdn.bernouy.com",
  "LEGO_EMAIL": "ops@bernouy.com",
  "MONGO_URL": "mongodb+srv://USER:PASS@cluster.mongodb.net/?retryWrites=true",
  "MONGO_DB_NAME": "cdn",
  "CDN_BUCKETS_KEK": "REPLACE_WITH_BASE64_KEK_FROM_5A",
  "KEYCLOAK_ISSUER": "https://auth.bernouy.com/realms/REPLACE_REALM_NAME",
  "KEYCLOAK_CLIENT_ID": "cdn-origin",
  "KEYCLOAK_CLIENT_SECRET": "REPLACE_WITH_KEYCLOAK_CLIENT_SECRET",
  "KEYCLOAK_SESSION_SECRET": "REPLACE_WITH_OPENSSL_RAND_HEX_32",
  "KEYCLOAK_ADMIN_ROLE": "admin"
}
```

### 5c. Compte de service + access cert + policy IAM

Procédure complète détaillée dans le **runbook global** §0.2 → §0.4
([`docker/DEPLOY.md`](../DEPLOY.md#0-ovhcloud-secret-manager-okms--source-unique-des-secrets)).
Résumé pour le service cdn-origin :

1. **Compte de service** : IAM/Sécurité → Identités → Comptes de service
   → "Ajouter" → nom `cdn-origin`.
2. **Access cert** : Secret Manager → ton domain → Certificats d'accès
   → "Générer" en sélectionnant le compte `cdn-origin` → télécharger
   cert + key (**download unique**).
3. **Policy IAM** : IAM/Sécurité → Politiques → "Ajouter" :
   - Identités : compte `cdn-origin`
   - Type de produit : OKMS
   - Ressources : vide
   - Actions : `okms:apikms:secretConfig/get` (ou `okms:apikms:*` pour
     simplifier)
   - Save → attendre 30-60s de propagation.

⚠️ Sans la policy, OVH refuse même le TLS handshake (`bad certificate`).
Cf. §Troubleshooting OKMS du runbook global.

---

## 6. Build + transfert de l'image

```bash
# Sur la dev box (depuis la racine du repo)
docker buildx build --network=host \
    -f docker/cdn-node/Dockerfile \
    -t bernouy/cdn-origin:0.2.0 .
docker save bernouy/cdn-origin:0.2.0 | gzip > cdn-origin-0.2.0.tar.gz

scp cdn-origin-0.2.0.tar.gz root@<origin>:/tmp/

# Sur l'origin
sudo docker load < /tmp/cdn-origin-0.2.0.tar.gz
sudo docker images bernouy/cdn-origin
```

---

## 7. Bootstrap du host

### 7a. Déposer le cert + key OKMS

```bash
sudo install -d -m 0700 -o root -g root /etc/cdn/okms
sudo install -m 0600 -o root -g root /dev/null /etc/cdn/okms/client.crt
sudo install -m 0400 -o root -g root /dev/null /etc/cdn/okms/client.key
# Copier le cert et la key depuis ta dev box (depuis le download §5c)
sudo nano /etc/cdn/okms/client.crt   # paste cert PEM
sudo nano /etc/cdn/okms/client.key   # paste key PEM
sudo chmod 0600 /etc/cdn/okms/client.crt
sudo chmod 0400 /etc/cdn/okms/client.key
```

### 7b. `bootstrap.env`

```bash
sudo install -d -m 0700 -o root -g root /etc/cdn
sudo install -m 0600 -o root -g root /dev/null /etc/cdn/bootstrap.env
sudo nano /etc/cdn/bootstrap.env
```

Contenu (5 vars) :

```bash
OKMS_REGION=eu-west-rbx
OKMS_DOMAIN_ID=<uuid-du-domain>
OKMS_CERT_PATH=/etc/okms/client.crt          # path DANS le container
OKMS_KEY_PATH=/etc/okms/client.key
OKMS_SECRET_PREFIX=prod/cdn-origin/config    # path COMPLET du secret (cf. §5b)
```

> `OKMS_REGION` doit matcher la région où le domain a été créé.
> `OKMS_SECRET_PREFIX` est le path complet du secret, **pas** un préfixe.
> Cf. [global DEPLOY.md §0](../DEPLOY.md#0-ovhcloud-secret-manager-okms--source-unique-des-secrets) pour la procédure
> compte de service + access cert + policy IAM (étape obligatoire).

---

## 8. Premier lancement

```bash
sudo docker run -d --name cdn-origin \
    --restart unless-stopped \
    -p 80:80 -p 443:443 \
    -v cdn-origin-data:/var/lib/cdn \
    -v /etc/cdn/okms/client.crt:/etc/okms/client.crt:ro \
    -v /etc/cdn/okms/client.key:/etc/okms/client.key:ro \
    --env-file /etc/cdn/bootstrap.env \
    bernouy/cdn-origin:0.2.0

sudo docker logs -f cdn-origin
```

Au boot, tu verras d'abord les logs `[okms-fetch] fetched bundle …` +
`[okms-fetch] exported keys: MAIN_DOMAIN PUBLIC_DOMAIN …` avant que
l'entrypoint origin ne démarre. Si OKMS est injoignable ou auth
refusée, le container exit fatal — **pas de fallback silencieux**.

Premier boot, dans l'ordre :
1. Création du layout `/var/lib/cdn/{buckets,lego,ssh,lsyncd,nginx-generated,access-logs}`.
2. Génération de la SSH keypair `/var/lib/cdn/ssh/id_ed25519` (la pubkey
   est imprimée dans les logs — note-la, indispensable pour les edges).
3. lego mint le cert `MAIN_DOMAIN` (DNS-01 si `LEGO_DNS_PROVIDER`,
   sinon HTTP-01 standalone).
4. nginx + bun démarrent.
5. lsyncd-supervisor reste en attente (pas d'edge → rien à pousser).
6. lego tente le cert `PUBLIC_DOMAIN` via HTTP-01 webroot — **échoue à
   ce stade** (aucun edge online). Le renew loop quotidien retry.

Le cert PUBLIC_DOMAIN sera émis dès qu'un premier edge est registered et
proxy_pass `/.well-known/acme-challenge/` correctement vers l'origin.

---

## 9. Smoke test post-boot

```bash
# 1. Container healthy
sudo docker ps --filter name=cdn-origin --format 'table {{.Status}}'

# 2. Admin répond (302 vers Keycloak)
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
    https://cdn-origin.bernouy.com/admin/origin/

# 3. Cert MAIN_DOMAIN valide
echo | openssl s_client -connect cdn-origin.bernouy.com:443 \
    -servername cdn-origin.bernouy.com 2>/dev/null \
    | openssl x509 -noout -issuer -dates

# 4. Récupérer la pubkey origin (à coller sur les edges)
sudo docker exec cdn-origin cat /var/lib/cdn/ssh/id_ed25519.pub

# 5. Browser : https://cdn-origin.bernouy.com/admin/origin/
#    → login Keycloak (rôle admin) → dashboard (0 edge)
```

---

## 10. Connecter le premier edge

Procédure complète dans [`docker/cdn-edge/DEPLOY.md`](../cdn-edge/DEPLOY.md).
En résumé côté origin tu ne fais que :

- **+ Add edge** dans `/admin/origin/edges` (saisir `id`, `hostname`,
  `sshUser=cdn-sync`, `sshPort=22`, `dataPath=/var/lib/cdn`).
- Copier le `plaintextToken` via la modale "Edge added" → il sera la
  clé `EDGE_TOKEN` du bundle OKMS de l'edge.

Une fois l'edge online sur :80, l'origin retry le cert `PUBLIC_DOMAIN`
au prochain renew (ou `docker restart cdn-origin` pour forcer immédiat).
Penser ensuite à ajouter l'IP de l'edge au record A `cdn.bernouy.com`.

---

## 11. Vérifier que le proxy CMS marche

Après qu'un tenant CMS ait sauvegardé un Data Provider (cf. cms-control-mt
DEPLOY §10), le `BucketProxyPublisher` du tenant pousse une règle sur
`POST <BUCKET_BROKER>/api/proxies` :

```bash
# Liste les proxies stockés (admin, peut tous les voir)
curl -H "Authorization: Bearer <keycloak-jwt>" \
    "https://cdn-origin.bernouy.com/admin/api/proxies/list?bucketId=<bucket-id>"
```

Le manifest envoyé aux edges est consultable via :

```bash
sudo docker exec cdn-origin curl -s -H "Authorization: Bearer <edge-token>" \
    "http://localhost:3000/edge-api/secrets" | jq .
```

(En interne — sans la couche nginx, sur le port bun direct.)

---

## 12. Backup

Daily `cdn-backup.sh` à 03:00 UTC par défaut. Variables `BACKUP_*` (cf.
README §Optional env vars). À noter : les edges ont une copie via lsyncd,
donc le tar nightly de l'origin est partly redundant — mais il fige un
point dans le temps que les edges ne donnent pas (ils pourraient avoir
absorbé un `rm` accidentel propagé via lsyncd `--delete`).

---

## 13. Update de l'image

```bash
# Sur dev box : rebuild + save + scp
# Sur l'origin :
sudo docker stop cdn-origin && sudo docker rm cdn-origin
sudo docker run -d --name cdn-origin --restart unless-stopped \
    -p 80:80 -p 443:443 \
    -v cdn-origin-data:/var/lib/cdn \
    -v /etc/cdn/okms/client.crt:/etc/okms/client.crt:ro \
    -v /etc/cdn/okms/client.key:/etc/okms/client.key:ro \
    --env-file /etc/cdn/bootstrap.env \
    bernouy/cdn-origin:<new>
```

Le volume persiste : keypair SSH, certs lego, buckets, lsyncd state. Les
edges ne voient rien (lsyncd reprend à la prochaine modif).

---

## 14. Logs

```bash
sudo docker logs -f cdn-origin
sudo docker exec cdn-origin tail -F /var/lib/cdn/lsyncd/lsyncd.log
sudo docker exec cdn-origin cat /etc/lsyncd/lsyncd.conf.lua
```

---

## 15. Limites connues

- **lsyncd respawn delay** : ~2s entre la mort de lsyncd et le respawn ;
  les écritures durant la fenêtre sont rattrapées au prochain `init` rsync.
- **Pas de canary** entre edges : un mauvais push se propage en parallèle.
  Le `nginx -t` côté edge bloque les configs malformées, mais pas les
  fichiers blob corrompus.
- **PUBLIC_DOMAIN cert dépend des edges** : si TOUS les edges tombent en
  même temps que l'expiration, le cert ne peut pas se renouveler. Mitigation :
  monitoring de l'expiration côté origin + au moins 2 edges.
- **KEK en .env aujourd'hui** : itération suivante = docker secret, terme
  long = HSM. Cf. commit `3da5c00`.
