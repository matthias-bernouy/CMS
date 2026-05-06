# Déploiement prod — `bernouy/cdn-origin`

Runbook pour le premier déploiement de l'image cdn-origin sur un serveur
de prod. Ce serveur sera l'**origin** d'un cluster CDN — il n'est **PAS**
dans le DNS public (cf. README.md) ; il sert uniquement l'admin / upload
sur `MAIN_DOMAIN`.

Pour la procédure de connexion d'un edge, voir
[EDGE-SETUP.md](EDGE-SETUP.md).

---

## 1. Pré-requis côté serveur origin

| Pré-requis | Vérification |
|---|---|
| Linux + Docker installé | `docker --version` |
| Ports 80 + 443 libres | `sudo ss -tlnp 'sport = :80'` ; même chose pour 443 |
| Sortie SSH ouverte vers les edges (TCP/22) | `ssh -i /tmp/test-key user@edge` (après [EDGE-SETUP.md](EDGE-SETUP.md) §1) |
| Entrée HTTP/80 ouverte depuis les edges (pour ACME proxy back) | côté firewall provider |

**Important** : choisir un origin **dans un réseau différent** des
edges (provider distinct, datacenter distinct). Le but est d'éviter
qu'une panne de zone tue origin + edges en même temps.

---

## 2. Pré-requis DNS

Un seul record, pointant vers l'IP publique de l'origin :

| Record | Type | Valeur |
|---|---|---|
| `cdn-origin.bernouy.com` | `A` | `<ip-origin>` |

**Ne pas** créer `*.cdn-origin.bernouy.com` — l'origin ne sert pas les
buckets sur ses sous-domaines.

Le DNS public (le round-robin pour `*.cdn.bernouy.com`) est géré
séparément, côté edges (cf. EDGE-SETUP.md §6).

---

## 3. Pré-requis Keycloak

Comme cdn-keycloak. Créer un client OIDC :
- **Client ID** : `cdn-origin` (distinct du `cdn` actuel).
- **Client authentication** : `On`.
- **Valid Redirect URIs** : `https://cdn-origin.bernouy.com/auth/callback`.
- **Valid Post Logout Redirect URIs** : `https://cdn-origin.bernouy.com/auth/post-logout-callback`.
- Réutiliser le rôle `admin` existant ou en créer un.

---

## 4. Pré-requis OVH (creds DNS-01)

Comme cdn-keycloak (cf. son DEPLOY.md §4). L'origin a besoin d'un cert
**single-host** pour `MAIN_DOMAIN` ; pas de wildcard. Mais lego utilise
quand même DNS-01 (l'origin n'est pas joignable par Let's Encrypt sur
HTTP-01 — il n'est pas dans le DNS public, ou plus précisément il n'est
pas associé au sous-domaine que l'opérateur va utiliser pour les certs
des aliases clients, qui passent par les edges).

---

## 5. Build + transfert de l'image

```bash
# Sur la dev box
docker buildx build --network=host \
    --build-context webcomponents=/path/to/WebComponents \
    -f docker/cdn-origin/Dockerfile \
    -t bernouy/cdn-origin:0.1.0 .
docker save bernouy/cdn-origin:0.1.0 | gzip > cdn-origin-0.1.0.tar.gz

scp cdn-origin-0.1.0.tar.gz root@<origin>:/tmp/

# Sur l'origin
docker load < /tmp/cdn-origin-0.1.0.tar.gz
docker images bernouy/cdn-origin
```

---

## 6. `.env` côté origin

Crée `/etc/cdn/cdn.env` (root-owned, mode 0600). Strictement les mêmes
variables que cdn-keycloak ; adapter `MAIN_DOMAIN=cdn-origin.bernouy.com`.

`KEYCLOAK_SESSION_SECRET` : généré une fois, `openssl rand -hex 32`.

---

## 7. Premier lancement

```bash
sudo docker run -d --name cdn-origin \
    --restart unless-stopped \
    -p 80:80 -p 443:443 \
    -v cdn-origin-data:/var/lib/cdn \
    -v /etc/cdn/rclone.conf:/etc/cdn/rclone.conf:ro \
    --env-file /etc/cdn/cdn.env \
    bernouy/cdn-origin:0.1.0

sudo docker logs -f cdn-origin
```

Premier boot :
1. Génération de la SSH keypair `/var/lib/cdn/ssh/id_ed25519` (la pubkey est imprimée — note-la, tu en auras besoin pour les edges).
2. lego mint le cert pour `MAIN_DOMAIN` via DNS-01.
3. nginx + bun démarrent.
4. lsyncd-supervisor reste en attente (pas d'edge → pas de sync target).

---

## 8. Smoke test

```bash
# 1. Container healthy
sudo docker ps --filter name=cdn-origin --format 'table {{.Status}}'

# 2. HTTPS répond
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
    https://cdn-origin.bernouy.com/admin/origin/
# → 302 -> https://cdn-origin.bernouy.com/auth/login?...

# 3. Cert
echo | openssl s_client -connect cdn-origin.bernouy.com:443 \
    -servername cdn-origin.bernouy.com 2>/dev/null \
    | openssl x509 -noout -issuer -dates

# 4. Browser : https://cdn-origin.bernouy.com/admin/origin/
#    → login Keycloak → dashboard (0 edge, lsyncd "not configured")

# 5. Récupérer la pubkey origin
sudo docker exec cdn-origin cat /var/lib/cdn/ssh/id_ed25519.pub
# (visible aussi dans /admin/origin/)
```

---

## 9. Connecter un premier edge

Voir [EDGE-SETUP.md](EDGE-SETUP.md). En résumé :

1. Standup d'un serveur edge (image `bernouy/cdn-edge` — future, pas dans ce paquet).
2. Créer l'user `cdn-sync` sur l'edge + `mkdir /var/lib/cdn/buckets`.
3. Coller la pubkey de l'origin dans `~cdn-sync/.ssh/authorized_keys`.
4. Ouvrir TCP/22 de l'origin vers l'edge.
5. UI origin `/admin/origin/edges` → "+ Add edge" avec id, hostname, sshUser, sshPort, dataPath.
6. lsyncd se reconfigure tout seul, fait un init rsync vers le nouveau target.
7. Mettre à jour le DNS public `*.cdn.bernouy.com` pour ajouter l'IP de l'edge.

---

## 10. Backup

Identique à cdn-keycloak. Variables `BACKUP_*`, off-site rclone, etc.

À noter : les edges ont une copie des buckets via lsyncd, donc le tar
nightly de l'origin est partly redundant. Mais il fige un point dans le
temps que les edges ne donnent pas (eux pourraient avoir absorbé un
`rm` accidentel propagé via lsyncd `--delete`).

---

## 11. Update de l'image

Identique à cdn-keycloak (cf. son DEPLOY.md §11). Le volume persiste,
les edges ne voient rien.

---

## 12. Logs

```bash
sudo docker logs -f cdn-origin

# logs lsyncd dédiés
sudo docker exec cdn-origin tail -F /var/lib/cdn/lsyncd/lsyncd.log

# config lsyncd actuelle
sudo docker exec cdn-origin cat /etc/lsyncd/lsyncd.conf.lua
```

---

## 13. Limites connues

- **lsyncd respawn delay** : ~2s entre la mort de lsyncd (manuelle ou
  crash) et le respawn par le supervisor. Pendant cette fenêtre, les
  écritures ne sont pas pushées. lsyncd les rattrape au démarrage via
  `init = true` (full rsync), donc pas de perte — juste un retard.
- **Pas de cert reload sur les edges** : quand lego mint un nouveau
  cert pour un alias, le fichier est lsynced vers les edges, mais leur
  nginx ne se reload pas tout seul. Solution court terme : cron
  `nginx -s reload` quotidien sur l'edge. Solution long terme : hook
  explicite dans `@bernouy/cdn-buckets` qui SSH-trigger un reload remote.
- **Aucun canary** : un mauvais push se propage à tous les edges en
  parallèle. Pas un problème pour des fichiers blob immuables, mais un
  bug dans un asset critique (ex. `manifest.json` cassé) peut affecter
  toute la flotte. Future : staged rollout.
