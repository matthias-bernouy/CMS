# Déploiement prod — `bernouy/cdn-edge`

Runbook pour le premier déploiement d'un edge sur un VPS vide. Le edge
est public-facing : il sert `*.<MAIN_DOMAIN>` et redirige les challenges
ACME vers l'origin.

> Pré-requis : un origin déjà déployé et accessible sur
> `https://<MAIN_DOMAIN>` (cf. `docker/cdn-origin/DEPLOY.md`).

---

## 1. Pré-requis côté VPS edge

| Pré-requis | Vérification |
|---|---|
| Linux + Docker installé | `docker --version` |
| Ports 80 + 443 + 22 libres | `sudo ss -tlnp 'sport = :22'` (modifier la config sshd host si conflit) |
| IP publique stable | `curl -s ifconfig.me` |
| Disque ≥ taille totale des buckets | `df -h /var/lib/docker` (si dispo) |

**Important** : le VPS doit être sur un **réseau différent** de
l'origin (provider distinct, datacenter distinct). C'est le principe de
la décentralisation : si un datacenter tombe, les autres edges
continuent de servir.

> **Attention au sshd du host** — le container du edge expose `22`. Si
> tu as déjà sshd sur le host (cas typique d'un VPS), bind un autre
> port côté host, p.ex. `-p 2222:22`. La connexion depuis l'origin
> utilisera alors `sshPort=2222` dans l'UI `+ Add edge`.

---

## 2. Pré-requis DNS public (round-robin)

| Record | Type | Valeur |
|---|---|---|
| `*.cdn.bernouy.com` | `A` | `<ip-edge-1>` |
| `*.cdn.bernouy.com` | `A` | `<ip-edge-2>` (si déjà existant) |
| `*.cdn.bernouy.com` | `A` | `<ip-edge-N>` |

Une seule entrée wildcard par edge. Le client résout l'une des IP au
hasard, ça donne un round-robin DNS basique.

> **Ne pas mettre l'origin dans ce record** — l'origin est privé.

TTL recommandé : `300` (5 min). Permet de retirer rapidement un edge
mort sans attendre une heure de propagation.

---

## 3. Build l'image

```bash
# Sur la dev box
docker build \
    -f docker/cdn-edge/Dockerfile \
    -t bernouy/cdn-edge:0.1.0 \
    docker/cdn-edge

docker save bernouy/cdn-edge:0.1.0 | gzip > cdn-edge-0.1.0.tar.gz
```

L'image est **autonome** (pas de build context monorepo nécessaire,
contrairement à cdn-origin), donc le build context est juste le dossier
`docker/cdn-edge/`.

---

## 4. Transférer + charger l'image

```bash
scp cdn-edge-0.1.0.tar.gz root@<edge>:/tmp/
ssh root@<edge> 'docker load < /tmp/cdn-edge-0.1.0.tar.gz'
```

---

## 5. Récupérer la pubkey de l'origin

Depuis un browser admin :
- `https://<MAIN_DOMAIN>/admin/origin/` → section **SSH public key**.

Ou par CLI sur la box origin :
```bash
sudo docker exec cdn-origin cat /var/lib/cdn/ssh/id_ed25519.pub
```

Tu obtiens une ligne comme :
```
ssh-ed25519 AAAAC3Nza…XXX cdn-origin@cdn-origin.bernouy.com
```

Note-la, on en a besoin pour `AUTHORIZED_ORIGIN_PUBKEY`.

---

## 6. Lancement du edge

```bash
sudo docker run -d --name cdn-edge \
    --restart unless-stopped \
    -p 80:80 -p 443:443 -p 2222:22 \
    -v cdn-edge-data:/var/lib/cdn \
    -e MAIN_DOMAIN=cdn.bernouy.com \
    -e ORIGIN_HOST=cdn-origin.bernouy.com \
    -e 'AUTHORIZED_ORIGIN_PUBKEY=ssh-ed25519 AAAAC3Nza…XXX cdn-origin@cdn-origin.bernouy.com' \
    bernouy/cdn-edge:0.1.0
```

> **`-p 2222:22`** : décale le sshd du container pour ne pas entrer en
> conflit avec le sshd du host (qui sert à toi pour administrer le VPS).
> Ajuste si tu as un autre port libre.

> **AUTHORIZED_ORIGIN_PUBKEY** : à passer **uniquement au premier
> boot**. Il est persisté dans `/home/cdn-sync/.ssh/authorized_keys` sur
> le volume. Tu peux drop la variable des `docker run` suivants.

Suivre :
```bash
sudo docker logs -f cdn-edge
```

Tu devrais voir :
1. `[edge] Installing AUTHORIZED_ORIGIN_PUBKEY into …`
2. `[edge] Generating sshd host keys (first boot)…`
3. `[edge] Rendering nginx config…`
4. `[edge] Waiting for /var/lib/cdn/lego/certificates/cdn.bernouy.com.crt (lsynced from origin)…`

L'edge est en attente de la première sync de l'origin. Passons à
l'enregistrement.

---

## 7. Enregistrer l'edge côté origin

UI origin : `https://<MAIN_DOMAIN>/admin/origin/edges` → **+ Add edge**.

| Champ      | Valeur                       |
|------------|------------------------------|
| `id`       | `edge-XX-N`                  |
| `label`    | (libre)                      |
| `hostname` | IP publique ou DNS du VPS    |
| `sshUser`  | `cdn-sync`                   |
| `sshPort`  | `2222` (cf. mapping étape 6) |
| `dataPath` | `/var/lib/cdn`               |

> **Attention `dataPath` = `/var/lib/cdn`** (PAS
> `/var/lib/cdn/buckets`) — l'origin lsync maintenant tout le volume
> avec excludes, pas juste `buckets/`.

À la création :
1. L'origin enregistre la ligne, regénère la config lsyncd.
2. lsyncd respawn et lance un `init` rsync vers la nouvelle IP.
3. Le edge reçoit `buckets/`, `lego/certificates/<MAIN_DOMAIN>.crt+key`,
   `nginx-generated/`. La fenêtre dépend du volume des buckets ; en
   général quelques secondes pour un cluster vide, plusieurs minutes
   pour des Go.
4. Le entrypoint du edge sort de sa boucle d'attente, fait `nginx -t`,
   démarre nginx + sshd + cert-reload-watcher.

Suivre l'init lsyncd côté origin :
```bash
sudo docker exec cdn-origin tail -F /var/lib/cdn/lsyncd/lsyncd.log
```

Et côté edge :
```bash
sudo docker logs -f cdn-edge
# attendre "Starting sshd + nginx + cert-reload-watcher…"
```

---

## 8. Probe + smoke test

UI origin → bouton **Probe** sur la ligne du edge.
- `usedBytes` doit matcher (à quelques bytes près) la taille de
  `/var/lib/cdn/buckets` côté origin.
- `fileCount` idem.

Smoke test depuis n'importe où :
```bash
# 1. cert wildcard valide
echo | openssl s_client -connect mybucket.cdn.bernouy.com:443 \
    -servername mybucket.cdn.bernouy.com 2>/dev/null \
    | openssl x509 -noout -issuer -ext subjectAltName

# 2. fichier existant servi
curl -I https://mybucket.cdn.bernouy.com/some-known-file.png

# 3. brotli
curl -H 'Accept-Encoding: br' -I https://mybucket.cdn.bernouy.com/index.html | grep -i content-encoding

# 4. DNS round-robin (si plusieurs edges)
dig +short cdn.bernouy.com
```

---

## 9. Ajouter au DNS public

Une fois le smoke test OK :

```
A  *.cdn.bernouy.com  → <ip-edge>
```

(En plus des records existants pour les autres edges, si applicable.)

> Mettre TTL=300 pour pouvoir bouger vite.

---

## 10. Ajouter d'autres edges

Reproduire les étapes 3 (push image) → 9 sur un nouveau VPS.
**Ne pas re-générer** la pubkey origin — elle est partagée entre
toutes les connexions edge.

---

## 11. Update de l'image

```bash
docker pull bernouy/cdn-edge:<new>
sudo docker stop cdn-edge && sudo docker rm cdn-edge
sudo docker run -d --name cdn-edge --restart unless-stopped \
    -p 80:80 -p 443:443 -p 2222:22 \
    -v cdn-edge-data:/var/lib/cdn \
    -e MAIN_DOMAIN=cdn.bernouy.com \
    -e ORIGIN_HOST=cdn-origin.bernouy.com \
    bernouy/cdn-edge:<new>
```

`AUTHORIZED_ORIGIN_PUBKEY` n'est pas requis sur les boots suivants.
Le volume persiste, donc pas de re-sync init complet (rsync est
incremental).

---

## 12. Logs + observability

```bash
# logs en live
sudo docker logs -f cdn-edge

# accès nginx
sudo docker exec cdn-edge tail -F /var/log/nginx/access.log

# config nginx active
sudo docker exec cdn-edge cat /etc/nginx/conf.d/cdn/nginx.conf

# fragments synced (doivent être en miroir de l'origin)
sudo docker exec cdn-edge ls -la /var/lib/cdn/nginx-generated/
sudo docker exec cdn-edge ls -la /var/lib/cdn/lego/certificates/
```

---

## 13. Retrait propre

1. Sur le DNS : retirer le record A `*.cdn.bernouy.com` du edge.
2. Attendre l'expiration du TTL (300s recommandé).
3. UI origin → **Remove** sur la ligne du edge → lsyncd respawn sans le target.
4. Sur la box edge : `sudo docker stop cdn-edge && sudo docker rm cdn-edge`.
5. Optionnel : `sudo docker volume rm cdn-edge-data` pour wiper.

---

## 14. Limites connues

- **Wildcard cert** issu via DNS-01 sur l'origin uniquement — l'edge ne
  parle jamais aux APIs DNS du provider. Si l'origin tombe et que le
  cert expire, l'edge servira un cert invalide jusqu'au retour de
  l'origin. Mitigation : monitoring de l'expiration côté origin.
- **Pas de canary** entre edges — un mauvais push (config nginx
  malformée, fichier corrompu) atteint tous les edges en parallèle.
  Le watcher fait `nginx -t` avant `nginx -s reload`, donc une syntax
  error ne tue pas nginx — mais une syntax-OK + semantic-bad passe.
- **inotify quirks** sur certains drivers Docker (overlayfs ancien,
  devicemapper) — fallback : `sudo docker exec cdn-edge sudo nginx -s reload`
  manuel après une issue de cert.
