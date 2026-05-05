# Déploiement prod — `bernouy/cms-control-mt`

Runbook pour déployer le CMS Control multi-tenant. **Une seule** instance
sert N tenants — chaque tenant apporte sa propre Keycloak + son propre
bucket CDN. MongoDB externe, partagé par tous les tenants (préfixe de
collections par tenant).

---

## 1. Pré-requis côté serveur prod

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

Bonnes pratiques : un user dédié à ce CMS avec lecture/écriture sur cette
DB seulement.

---

## 5. Transférer l'image

```bash
docker save bernouy/cms-control-mt:0.1.0 | gzip > cms-control-mt-0.1.0.tar.gz
scp cms-control-mt-0.1.0.tar.gz <user>@<server>:/tmp/

# Sur le serveur
sudo docker load < /tmp/cms-control-mt-0.1.0.tar.gz
sudo docker images bernouy/cms-control-mt
```

---

## 6. Préparer le `.env`

```bash
sudo install -d -m 0700 -o root -g root /etc/cms-mt
sudo install -m 0600 -o root -g root /dev/null /etc/cms-mt/cms.env
sudo nano /etc/cms-mt/cms.env
```

Contenu :

```bash
MAIN_DOMAIN=cms.example.com
LEGO_EMAIL=ops@example.com

# MongoDB partagé (tous tenants)
MONGO_URL=mongodb://user:pass@mongo.example.com:27017/?authSource=admin
MONGO_DB_NAME=mt-cms

# Keycloak SUPERADMIN (plateforme — distincte de toute Keycloak de tenant)
SUPERADMIN_KEYCLOAK_ISSUER=https://auth.example.com/realms/platform
SUPERADMIN_KEYCLOAK_CLIENT_ID=cms-superadmin
SUPERADMIN_KEYCLOAK_CLIENT_SECRET=...
SUPERADMIN_KEYCLOAK_ADMIN_ROLE=cms-superadmin
SUPERADMIN_KEYCLOAK_SESSION_SECRET=<openssl rand -hex 32 — fait UNE fois>
```

Génère le session secret :
```bash
openssl rand -hex 32
```

---

## 7. Lancement

```bash
sudo docker run -d --name cms-mt \
    --restart unless-stopped \
    --dns 1.1.1.1 --dns 8.8.8.8 \
    -p 80:80 -p 443:443 \
    -v cms-mt-data:/var/lib/cms \
    --env-file /etc/cms-mt/cms.env \
    bernouy/cms-control-mt:0.1.0

sudo docker logs -f cms-mt
```

Premier boot ~1 min (lego HTTP-01 standalone, port 80 doit être
joignable depuis Internet).

---

## 8. Smoke test

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

## 9. Onboarder un premier tenant

**Côté tenant** (à faire par le client ou toi pour son compte) :

1. **Créer un realm Keycloak** dédié au tenant (ou client OIDC dans un
   realm existant) avec :
   - Client `cms` confidential
   - Valid Redirect URIs : `https://cms.example.com/cms/<tenant-id>/auth/callback`
   - Realm Role `admin` (ou autre — référence le `keycloak.adminRole` du
     formulaire)
   - Optionnel : client public `cms-cli` avec Device Authorization Grant
     pour `p9r login`

2. **Créer un bucket CDN** dédié, émettre une credential bearer.

**Côté superadmin** :

1. `https://cms.example.com/superadmin/` → login → "+ New tenant"
2. Remplir : id (slug), name, infos Keycloak du tenant, infos CDN du tenant
3. Submit → le tenant est immédiatement mounté à `/cms/<tenant-id>/*`

Le tenant accède désormais à son admin via
`https://cms.example.com/cms/<tenant-id>/admin/pages`.

---

## 10. Update de l'image

Identique à `cms-control` : build + scp + docker load + swap. Le volume
`cms-mt-data` ne porte que les certs lego. La data tenant vit en Mongo.

---

## 11. Limites connues v0.1

- **Pas d'édition** d'un tenant existant via UI — seulement create/delete.
  Pour rotater une credential CDN, delete + recreate (perd la data Mongo
  sauf si tu réimportes la même collection prefix).
- **Suppression d'un tenant = drop des collections** `tenant_<id>__*`.
  Backup côté Mongo avant de cliquer Delete.
- **Cookies par tenant** scoped via `cookieName` (`cms-<id>-session`)
  mais pas via `cookiePath` — ce qui est inoffensif (différents noms ne
  collisionnent pas) mais le cookie est envoyé sur toutes les URLs.
- **Pas de Delivery** — Control uniquement. Le rendu public sera ajouté
  dans une phase ultérieure (champ `publicCdn` sur Tenant à venir).
