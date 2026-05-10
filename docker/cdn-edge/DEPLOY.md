# Déploiement prod — `bernouy/cdn-edge`

Runbook pour le premier déploiement d'un edge sur un VPS vide. Le edge
est public-facing : il sert `<PUBLIC_DOMAIN>` (e.g. `cdn.bernouy.com`)
en HTTPS, redirige les challenges ACME vers l'origin, et poll les
secrets manifest depuis l'origin pour activer les proxies data-provider
côté nginx.

> Pré-requis : un origin déjà déployé et accessible sur
> `https://<MAIN_DOMAIN>` (cf. [`docker/cdn-node/DEPLOY.md`](../cdn-node/DEPLOY.md)).

> **Architecture SSH** : le sshd est celui du **host** (port 22),
> pas du container. lsyncd depuis l'origin se connecte sur
> `<edge-host>:22` en tant que `cdn-sync` (UID 1099 sur le host, créé
> par `init-server.sh --role edge`). Le `/var/lib/cdn` est bind-mounté
> dans le container cdn-edge ; le user cdn-sync (UID 1099 dans le
> container aussi) garantit que nginx (`www-data`, membre du groupe
> `cdn-sync`) lit les blobs lsyncés sans gymnastique de chmod.

---

## 1. Pré-requis VPS edge

```bash
# Sur la dev box (depuis la racine du repo) — push le script vers le VPS edge
scp docker/init-server.sh root@<edge>:/tmp/

# Sur le VPS edge (remplacer <ip-origin> par l'IP publique de l'origin)
sudo bash /tmp/init-server.sh --role edge --origin-ip <ip-origin>
```

→ apt + Docker CE + ufw (OpenSSH + 80/443 publics + rule informative
port 22 depuis `<ip-origin>`) + systemd-timesyncd + création du user
`cdn-sync` (UID/GID **1099**) + `/var/lib/cdn` (mode 0750, owner
`cdn-sync:cdn-sync`) + `~cdn-sync/.ssh/authorized_keys` vide (à remplir
au §3). Idempotent.

| Pré-requis | Vérification |
|---|---|
| Linux + Docker | `docker --version` |
| Ports 80 + 443 libres | `sudo ss -tlnp 'sport = :80'` ; idem 443 |
| Inbound TCP/22 depuis l'origin | `ssh cdn-sync@<edge-host>` depuis l'origin une fois la pubkey collée (§3-§4) |
| IP publique stable | `curl -s ifconfig.me` |
| Disque ≥ taille totale des buckets | `df -h /var/lib/cdn` |
| Accès réseau au MAIN_DOMAIN de l'origin | `curl -sI https://<MAIN_DOMAIN>/` |

**Important** : le VPS doit être sur un **réseau différent** de
l'origin (provider distinct, datacenter distinct) — défense en
profondeur contre les pannes de zone.

---

## 2. DNS public (round-robin)

| Record | Type | Valeur |
|---|---|---|
| `cdn.bernouy.com` | `A` | `<ip-edge-1>` |
| `cdn.bernouy.com` | `A` | `<ip-edge-2>` (si déjà existant) |
| `cdn.bernouy.com` | `A` | `<ip-edge-N>` |

> Les buckets sont path-based : `https://cdn.bernouy.com/<bucketId>/...`.
> Pas besoin de wildcard cert. Les clients avec un domaine custom passent
> par le système d'aliases (cert per-alias émis via HTTP-01).

> **Ne pas mettre l'origin** dans ce record — l'origin est privé.

TTL recommandé : `300` pour pouvoir bouger vite si un edge meurt.

---

## 3. Récupérer la pubkey de l'origin

Depuis un browser admin :
- `https://<MAIN_DOMAIN>/admin/origin/` → section **SSH public key**.

Ou en CLI sur l'origin :
```bash
sudo docker exec cdn-origin cat /var/lib/cdn/ssh/id_ed25519.pub
```

Tu obtiens :
```
ssh-ed25519 AAAAC3Nza…XXX cdn-origin@cdn-origin.bernouy.com
```

---

## 4. Coller la pubkey origin sur le VPS edge

Sur le VPS edge :

```bash
# Coller la ligne récupérée au §3, idéalement avec restriction `from`
echo 'from="<ip-origin>",no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAAC3Nza…XXX cdn-origin@cdn-origin.bernouy.com' \
    | sudo tee -a /home/cdn-sync/.ssh/authorized_keys
sudo chown cdn-sync:cdn-sync /home/cdn-sync/.ssh/authorized_keys
sudo chmod 0600 /home/cdn-sync/.ssh/authorized_keys
```

La clause `from="<ip-origin>"` restreint l'usage de cette pubkey à
l'IP de l'origin. La rule ufw au §1 est belt-and-suspenders ; la vraie
sécurité est ici.

### Test depuis l'origin

```bash
sudo docker exec cdn-origin \
    su -s /bin/bash cdn -c "ssh -i /var/lib/cdn/ssh/id_ed25519 \
        -o StrictHostKeyChecking=accept-new \
        -o BatchMode=yes \
        cdn-sync@<edge-host> 'echo OK; ls -la /var/lib/cdn'"
```

Attendu : `OK` suivi du listing du dossier (vide au début).

Si `Permission denied (publickey)` → la pubkey ou ses perms sont
mauvaises. Si `Connection refused` / `timeout` → ufw ou firewall
provider à ouvrir.

---

## 5. Build + transfert de l'image

```bash
# Sur la dev box (depuis la racine du repo)
docker buildx build --network=host \
    -f docker/cdn-edge/Dockerfile \
    -t bernouy/cdn-edge:0.2.0 .
docker save bernouy/cdn-edge:0.2.0 | gzip > cdn-edge-0.2.0.tar.gz
scp cdn-edge-0.2.0.tar.gz root@<edge>:/tmp/

# Sur le VPS edge
sudo docker load < /tmp/cdn-edge-0.2.0.tar.gz
sudo docker images bernouy/cdn-edge
```

---

## 6. Enregistrer l'edge côté origin

UI origin : `https://<MAIN_DOMAIN>/admin/origin/edges` → **+ Add edge**.

| Champ      | Valeur exemple              | Description                                                                  |
|------------|-----------------------------|------------------------------------------------------------------------------|
| `id`       | `edge-fr-1`                 | Identifiant unique, URL-safe, **stable** (sert de clé en base, immutable).   |
| `label`    | `Frankfurt edge node`       | Cosmétique, affiché dans le dashboard.                                       |
| `hostname` | `<edge-host>` ou `<ip>`     | DNS public ou IP littérale du VPS — utilisé par lsyncd.                      |
| `sshUser`  | `cdn-sync`                  | Le user créé sur le host edge par `init-server.sh --role edge` (cf. §1).     |
| `sshPort`  | `22`                        | sshd du host edge.                                                           |
| `dataPath` | `/var/lib/cdn`              | Path **côté host edge** (PAS `/var/lib/cdn/buckets`) — l'origin lsync tout le volume avec excludes. |

### Récupérer le `plaintextToken` — action critique, une seule fois

À la soumission du formulaire, l'origin :
1. persiste la ligne edge en base (`tokenHash` sha256 only) ;
2. ouvre une **modale "Edge added"** avec le token bearer plaintext
   (forme `bsedge_<43 base64url chars>`).

**Cliquer "Copy" maintenant** — le token n'est jamais re-affiché. Il
sera la valeur de la clé `EDGE_TOKEN` dans le bundle OKMS de l'edge
(§7). Si tu fermes la modale sans copier : bouton **Remove** sur la
ligne, recréer.

---

## 7. Provisionner le bundle OKMS de l'edge

Chaque edge a **son propre prefix OKMS** (un cert + un bundle dédiés)
pour que la compromission d'un VPS edge n'expose pas les secrets des
autres edges.

### 7a. Créer le bundle KV2 dans Manager OVH

Manager OVHcloud → Secret Manager → ton OKMS domain → **Secrets** →
"Ajouter un secret" :

- Path : `prod/cdn-edge/<edge-id>/config` (remplace `<edge-id>` par
  l'`id` saisi au §6 — p.ex. `edge-fr-1`).
- Type : Clé/valeur (KV2).
- Clés à renseigner :

| Clé | Valeur |
|---|---|
| `PUBLIC_DOMAIN` | `cdn.bernouy.com` |
| `ORIGIN_HOST` | `cdn-origin.bernouy.com` |
| `EDGE_ID` | `edge-fr-1` (doit matcher exactement l'`id` du §6) |
| `EDGE_TOKEN` | **le `bsedge_…` copié au §6** |

> Si tu as fermé la modale sans copier le token, retourne au §6 →
> Remove + recréer. Pas de "regénérer le token" sans recréer la ligne.

### 7b. Compte de service + access cert + policy IAM

Procédure complète détaillée dans le **runbook global** §0.2 → §0.4
([`docker/DEPLOY.md`](../DEPLOY.md#0-ovhcloud-secret-manager-okms--source-unique-des-secrets)).
Résumé pour le service `cdn-edge-<edge-id>` :

1. **Compte de service** : IAM/Sécurité → Comptes de service →
   "Ajouter" → nom `cdn-edge-<edge-id>`.
2. **Access cert** : Secret Manager → ton domain → Certificats d'accès
   → "Générer" en sélectionnant le compte → télécharger cert + key
   (**download unique**).
3. **Policy IAM** : IAM → Politiques → "Ajouter" :
   - Identités : compte `cdn-edge-<edge-id>`
   - Type de produit : OKMS
   - Ressources : (vide — toutes ressources OKMS du domain)
   - Actions : `okms:apikms:secretConfig/get` (ou `okms:apikms:*`)
   - Save → attendre 30-60s de propagation.

### 7c. Sur le VPS edge : déposer cert + key + bootstrap.env

```bash
sudo install -d -m 0700 -o root -g root /etc/cdn-edge/okms
sudo install -m 0600 -o root -g root /dev/null /etc/cdn-edge/okms/client.crt
sudo install -m 0400 -o root -g root /dev/null /etc/cdn-edge/okms/client.key
# Coller le cert PEM (§7b.2) puis la key PEM
sudo nano /etc/cdn-edge/okms/client.crt
sudo nano /etc/cdn-edge/okms/client.key

sudo install -d -m 0700 -o root -g root /etc/cdn-edge
sudo install -m 0600 -o root -g root /dev/null /etc/cdn-edge/bootstrap.env
sudo nano /etc/cdn-edge/bootstrap.env
```

Contenu de `bootstrap.env` (5 vars) :

```bash
OKMS_REGION=eu-west-rbx
OKMS_DOMAIN_ID=<uuid-du-domain>
OKMS_CERT_PATH=/etc/okms/client.crt                    # path DANS le container
OKMS_KEY_PATH=/etc/okms/client.key
OKMS_SECRET_PREFIX=prod/cdn-edge/edge-fr-1/config      # path COMPLET du secret (§7a)
```

> `OKMS_REGION` doit matcher la région où le domain a été créé.
> `OKMS_SECRET_PREFIX` est le path complet, pas un préfixe.

---

## 8. Lancement du container edge

```bash
sudo docker run -d --name cdn-edge \
    --restart unless-stopped \
    -p 80:80 -p 443:443 \
    -v /var/lib/cdn:/var/lib/cdn \
    -v /etc/cdn-edge/okms/client.crt:/etc/okms/client.crt:ro \
    -v /etc/cdn-edge/okms/client.key:/etc/okms/client.key:ro \
    --env-file /etc/cdn-edge/bootstrap.env \
    bernouy/cdn-edge:0.2.0

sudo docker logs -f cdn-edge
```

Le `/var/lib/cdn` est **bind-mounté** depuis le host (pas un named
volume) : c'est le même path qu'écrit lsyncd-from-origin via le sshd
du host. Les UID/GID 1099 (cdn-sync) alignés des deux côtés font que
nginx lit les blobs cleanly.

Au boot tu devrais voir :
1. `[okms-fetch] fetched bundle … (prefix=prod/cdn-edge/<edge-id>/config)`
2. `[okms-fetch] exported keys: PUBLIC_DOMAIN ORIGIN_HOST EDGE_ID EDGE_TOKEN`
3. `[edge] Rendering nginx config (PUBLIC_DOMAIN=…, ORIGIN_HOST=…, EDGE_ID=…)…`
4. `[edge] Cert <PUBLIC_DOMAIN>.crt missing — starting nginx in bootstrap mode (port 80 only)…`

L'edge est en bootstrap mode : nginx sert juste les ACME challenges
proxied vers l'origin. C'est suffisant pour que l'origin émette le
cert `<PUBLIC_DOMAIN>`.

---

## 9. Côté origin : finir la connexion

La ligne edge a été créée à l'étape 6 avant même que le edge soit
booté. Maintenant que le edge est up sur :80 :

1. **L'origin retry le cert PUBLIC_DOMAIN** au prochain renew loop (24h
   max). Pour forcer immédiatement :
   ```bash
   sudo docker restart cdn-origin
   ```
   Le cert se mint dans les 20s qui suivent (HTTP-01 challenge passe par
   l'edge → origin → réponse).
2. **lsyncd** push les blobs + le cert + les fragments nginx vers l'edge :
   ```bash
   sudo docker exec cdn-origin tail -F /var/lib/cdn/lsyncd/lsyncd.log
   ```
3. Le edge sort de bootstrap mode dès que le cert atterrit, fait
   `nginx -t`, recharge avec la full config :443 :
   ```bash
   sudo docker logs -f cdn-edge
   # → "[edge] <PUBLIC_DOMAIN>.crt landed — swapping to full nginx config."
   ```
4. La poll loop `fetch-secrets.sh` démarre, conditional-GET vers
   `/edge-api/secrets` toutes les 10s.

---

## 10. Probe + smoke test

UI origin → bouton **Probe** sur la ligne du edge.
- `usedBytes` matche (à quelques bytes près) la taille de
  `/var/lib/cdn/buckets` côté origin.
- `fileCount` idem.

Smoke test depuis n'importe où :
```bash
# 1. Cert valide pour PUBLIC_DOMAIN
echo | openssl s_client -connect cdn.bernouy.com:443 \
    -servername cdn.bernouy.com 2>/dev/null \
    | openssl x509 -noout -issuer -dates

# 2. Fichier existant servi (après upload via admin CMS)
curl -I https://cdn.bernouy.com/<bucket-id>/<some-key>

# 3. Brotli actif
curl -H 'Accept-Encoding: br' -I \
    https://cdn.bernouy.com/<bucket-id>/<text-file> \
    | grep -i content-encoding

# 4. Round-robin DNS visible
dig +short cdn.bernouy.com

# 5. Manifest secrets effectivement poll
sudo docker logs cdn-edge 2>&1 | grep fetch-secrets
# → "[fetch-secrets] manifest updated (etag=xxx, N entries)" sur chaque changement
```

---

## 11. Tester un proxy data-provider

Suppose qu'un tenant CMS a saisi un Data Provider avec un bearer
header. Après save :
1. cms-control-mt POST `/api/proxies` au broker du bucket → upsert dans Mongo (chiffré).
2. lsyncd push `aliasesServers.conf` (avec `${SECRET_xxx}` placeholders) à tous les edges.
3. Au prochain poll, `fetch-secrets.sh` reçoit le nouveau manifest, render le fragment runtime, reload nginx.
4. Browser fetch `https://<bucket-domain>/.cms/data/<providerId>/<path>` → edge proxy_pass vers `<provider.server>` avec les headers d'auth résolus.

```bash
# Vérifier qu'un proxy est actif côté edge
sudo docker exec cdn-edge cat /run/nginx-runtime/aliasesServers.conf
# → contient les blocs `location /.cms/data/...` avec `proxy_set_header Authorization "Bearer xxx"`
```

---

## 12. Update de l'image

```bash
# Sur dev box : rebuild + save + scp
# Sur le VPS edge :
sudo docker stop cdn-edge && sudo docker rm cdn-edge
sudo docker run -d --name cdn-edge --restart unless-stopped \
    -p 80:80 -p 443:443 \
    -v /var/lib/cdn:/var/lib/cdn \
    -v /etc/cdn-edge/okms/client.crt:/etc/okms/client.crt:ro \
    -v /etc/cdn-edge/okms/client.key:/etc/okms/client.key:ro \
    --env-file /etc/cdn-edge/bootstrap.env \
    bernouy/cdn-edge:<new>
```

Le bind-mount `/var/lib/cdn` persiste entièrement, lsyncd reprend en
incremental. Le bundle OKMS n'a pas besoin d'être re-saisi (il vit
dans le domain OKMS, pas sur le VPS).

---

## 13. Logs + observability

```bash
sudo docker logs -f cdn-edge
sudo docker exec cdn-edge tail -F /var/log/nginx/access.log
sudo docker exec cdn-edge cat /etc/nginx/conf.d/cdn/nginx.conf
sudo docker exec cdn-edge ls -la /var/lib/cdn/nginx-generated/
sudo docker exec cdn-edge ls -la /var/lib/cdn/lego/certificates/
sudo docker exec cdn-edge cat /run/cdn-edge/.secrets-etag
```

---

## 14. Retrait propre

1. Sur le DNS : retirer le record A `cdn.bernouy.com` du edge → attendre TTL.
2. UI origin → **Remove** sur la ligne du edge → lsyncd respawn sans le
   target. Le `tokenHash` est purgé : `EDGE_TOKEN` devient inutilisable
   immédiatement.
3. Sur le VPS : `sudo docker stop cdn-edge && sudo docker rm cdn-edge`.
4. Optionnel : `sudo rm -rf /var/lib/cdn/*` pour wiper les blobs.

---

## 15. Rotation du `EDGE_TOKEN`

Cas : un token edge a fuité. Procédure delete + recreate :

1. UI origin → **Remove** sur la ligne. Le `tokenHash` disparaît.
2. UI origin → **+ Add edge** avec **le même `id`** (`EDGE_ID` est figé
   en env via le bundle OKMS).
3. Modale "Edge added" → copier le nouveau `plaintextToken`.
4. Manager OVH → Secret Manager → `prod/cdn-edge/<edge-id>/config` →
   "Modifier" → mettre à jour `EDGE_TOKEN` avec la nouvelle valeur.
5. Sur le VPS edge : `docker restart cdn-edge` (re-pull du bundle OKMS
   au boot).

Le bind-mount persiste donc pas de re-sync init complet. Pendant la
fenêtre delete→recreate, l'edge perd l'auth `/edge-api/secrets` (mais
les blobs déjà servis continuent de l'être ; lsyncd reprend dès que la
ligne est recréée côté origin).
