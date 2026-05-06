# Connexion d'un nouvel edge à l'origin

Cette procédure ajoute un edge au cluster d'une origin existante. L'edge
est un serveur Linux séparé, sur un **réseau différent** de l'origin
(provider ou datacenter distinct), capable de servir publiquement le
trafic des buckets sur `*.<MAIN_DOMAIN>`.

> **Note** : à la date de ce document, l'image `bernouy/cdn-edge`
> n'existe pas encore. Cette procédure couvre le contrat côté origin
> (ce qu'il faut sur l'edge pour que l'origin accepte de pousser
> dessus). Une fois l'image edge publiée, ses sections de doc viendront
> compléter celles-ci.

---

## 0. Vue d'ensemble

```
              [public DNS RR]
                    │
                    ▼
          *.cdn.example.com  ───►  edge (cette procédure)
                                        ▲
                                        │ rsync over SSH (lsyncd)
                                        │
                                  [origin]
```

L'edge :
- héberge `/var/lib/cdn/buckets` (rsynced depuis l'origin) ;
- sert `*.<MAIN_DOMAIN>` sur HTTP+HTTPS ;
- possède son propre wildcard cert (rsynced depuis l'origin) ;
- proxy `/.well-known/acme-challenge/*` vers l'origin pour les certs
  per-alias en HTTP-01.

L'origin :
- pousse vers l'edge via lsyncd over SSH ;
- ne peut **pas** être atteint par Let's Encrypt en HTTP-01 sur
  `<MAIN_DOMAIN>` (il n'est pas dans le DNS public) ; il utilise DNS-01.

---

## 1. Pré-requis côté edge

### 1.1 Serveur

- Linux récent (Debian/Ubuntu testé).
- IP publique stable.
- Disque d'une taille `>= taille totale des buckets`. L'edge garde une
  copie complète, pas un sous-ensemble — c'est de la **réplication**,
  pas du **sharding** (ce dernier viendra plus tard avec une notion
  logique de shard, partition de ~10 Go déplaçable entre origins).

### 1.2 Ports ouverts

| Direction | Port | Source                     | Pourquoi                                   |
|-----------|------|----------------------------|--------------------------------------------|
| inbound   | 22   | IP publique de l'origin    | rsync via SSH                              |
| inbound   | 80   | `0.0.0.0/0`                | ACME HTTP-01 (proxied à l'origin) + redirect HTTPS |
| inbound   | 443  | `0.0.0.0/0`                | bucket serving HTTPS                       |
| outbound  | 80   | IP publique de l'origin    | proxy_pass des challenges ACME             |

### 1.3 User SSH dédié

Sur l'edge :

```bash
sudo useradd -m -s /bin/bash -d /home/cdn-sync cdn-sync
sudo mkdir -p /var/lib/cdn/buckets
sudo chown cdn-sync:cdn-sync /var/lib/cdn/buckets
sudo chmod 0750 /var/lib/cdn/buckets
sudo install -d -m 0700 -o cdn-sync -g cdn-sync /home/cdn-sync/.ssh
sudo install -m 0600  -o cdn-sync -g cdn-sync /dev/null /home/cdn-sync/.ssh/authorized_keys
```

L'user a uniquement besoin d'écrire dans `/var/lib/cdn/buckets`. Pas de
sudo nécessaire pour la sync.

---

## 2. Récupérer la pubkey de l'origin

Côté origin (admin UI):

1. Se connecter à `https://<MAIN_DOMAIN>/admin/origin/`.
2. Section **SSH public key** — copier la ligne entière (elle commence
   par `ssh-ed25519 AAA…`).

Ou par CLI:

```bash
sudo docker exec cdn-origin cat /var/lib/cdn/ssh/id_ed25519.pub
```

---

## 3. Autoriser la pubkey sur l'edge

Sur l'edge :

```bash
echo 'ssh-ed25519 AAA…  cdn-origin@cdn-origin.example.com' \
    | sudo tee -a /home/cdn-sync/.ssh/authorized_keys
sudo chown cdn-sync:cdn-sync /home/cdn-sync/.ssh/authorized_keys
sudo chmod 0600 /home/cdn-sync/.ssh/authorized_keys
```

(Optionnel mais recommandé : `from="<ip-origin>",no-agent-forwarding,
no-port-forwarding,no-X11-forwarding,no-pty` devant la clé pour limiter
strictement ce qu'elle peut faire.)

---

## 4. Test de connectivité depuis l'origin

Sur la box admin (ou via `docker exec`):

```bash
sudo docker exec cdn-origin \
    su -s /bin/bash cdn -c "ssh -i /var/lib/cdn/ssh/id_ed25519 \
        -o StrictHostKeyChecking=accept-new \
        -o BatchMode=yes \
        cdn-sync@<edge-host> 'echo OK; ls -la /var/lib/cdn/buckets/'"
```

Attendu : `OK` suivi du listing du dossier (vide au début).

Si erreur :
- `Permission denied (publickey)` → la pubkey n'est pas dans `authorized_keys` ou les perms du dossier `.ssh` sont mauvaises (doit être `0700`).
- `Connection refused` → port 22 fermé.
- `Connection timed out` → règle firewall (provider) à ouvrir côté edge.

---

## 5. Enregistrement de l'edge côté origin

UI : `https://<MAIN_DOMAIN>/admin/origin/edges` → **+ Add edge**.

Champs :

| Champ      | Valeur exemple                  | Notes                                          |
|------------|---------------------------------|------------------------------------------------|
| `id`       | `edge-eu-1`                     | Unique, URL-safe, stable. Ne pas changer ensuite. |
| `label`    | `Frankfurt edge node`           | Cosmétique.                                    |
| `hostname` | `edge-eu-1.bernouy.com`         | DNS de l'edge (ou IP littérale).               |
| `sshUser`  | `cdn-sync`                      | Doit matcher §1.3.                             |
| `sshPort`  | `22`                            |                                                |
| `dataPath` | `/var/lib/cdn/buckets`          | Doit matcher §1.3 + perms écriture.            |
| `notes`    | (libre)                         | Affiché dans le dashboard.                     |

À la création :
1. L'origin enregistre la ligne en base.
2. Régénère `/etc/lsyncd/lsyncd.conf.lua` avec un nouveau `sync {}` ciblant l'edge.
3. Tue le lsyncd courant ; le supervisor le respawn avec la nouvelle config.
4. Au démarrage, lsyncd fait un **full rsync init** vers tous les targets — y compris le nouveau. Selon la taille des buckets, ça peut durer plusieurs minutes.

Suivre la progression :

```bash
sudo docker exec cdn-origin tail -F /var/lib/cdn/lsyncd/lsyncd.log
```

---

## 6. Probe post-add

UI : `/admin/origin/edges` → bouton **Probe** sur la ligne.

Le probe SSH fait `du -sb /var/lib/cdn/buckets && find … -type f | wc -l` ;
les valeurs `usedBytes` et `fileCount` doivent être proches de celles
de l'origin (compté dans le dashboard côté `lsyncd`).

Si `lastProbeOk = false`, l'erreur est dans `lastProbeError` :
- `missing_data_path` → le dossier n'existe pas / mauvaise valeur de `dataPath`.
- `Permission denied` → pubkey ou perms `authorized_keys` cassés.
- `Connection timed out` → firewall.

---

## 7. Mettre à jour le DNS public

Une fois l'edge catché up et probé OK :

```
A  *.cdn.bernouy.com  → <ip-edge1>
A  *.cdn.bernouy.com  → <ip-edge2>   (si déjà existant)
…
```

DNS round-robin : tous les A records reçoivent du trafic, le client
résout l'un d'eux. La propagation prend selon le TTL ; mettre `300`
sur les records pour pouvoir bouger vite si un edge meurt.

---

## 8. Désactiver / retirer un edge

UI : `/admin/origin/edges` → bouton **Remove**.

Ce que ça fait :
1. Retire la ligne en base.
2. Régénère lsyncd sans le target (lsyncd respawn).
3. **Ne touche pas** au DNS — l'opérateur retire le record A à la main.
4. **Ne wipe pas** les données sur l'edge — l'opérateur peut faire
   `rm -rf /var/lib/cdn/buckets` côté edge si recyclage.

Procédure recommandée pour un retrait propre :
1. Retirer le record DNS d'abord (laisser TTL expirer).
2. Vérifier que l'edge ne reçoit plus de trafic (`tail nginx access_log`).
3. Cliquer **Remove** dans l'UI origin.

---

## 9. Rotation de la SSH key de l'origin

Cas : la box origin a été compromise → on régénère la keypair.

1. Sur l'origin :
   ```bash
   sudo docker exec cdn-origin \
       su -s /bin/bash cdn -c "ssh-keygen -t ed25519 -N '' \
         -C 'cdn-origin@<MAIN_DOMAIN>' \
         -f /var/lib/cdn/ssh/id_ed25519"
   ```
2. Récupérer la nouvelle pubkey via UI ou `cat …/id_ed25519.pub`.
3. Sur **chaque** edge : remplacer la ligne dans `~cdn-sync/.ssh/authorized_keys`.
4. Sur l'origin : `sudo docker exec cdn-origin /usr/local/bin/lsyncd-reload.sh`
   (force un restart pour reprendre la nouvelle clé — le `rsh = ssh -i …`
   pointe au même path).

---

## 10. Limites connues côté edge (post-add)

- **Cert reload** : quand lego mint un cert sur l'origin pour un alias
  client, le `.crt` / `.key` est lsynced vers l'edge, mais nginx côté
  edge ne se reload pas tout seul. Workaround court terme : cron
  `nginx -s reload` quotidien sur l'edge. Long terme : un hook
  explicite côté origin (à wirer dans `@bernouy/cdn-buckets`).
- **Edge DOWN ≠ origin KO** : l'origin continue d'accepter les uploads
  et écrit en local. Quand l'edge revient, lsyncd rattrape au prochain
  `init` (ou diff incremental sur les fichiers modifiés depuis le
  dernier sync — rsync est efficient).
- **Origin DOWN = uploads off, mais lecture publique reste up** : c'est
  l'intérêt de la séparation control-plane / data-plane. Les edges
  servent les fichiers déjà répliqués sans dépendance à l'origin.
