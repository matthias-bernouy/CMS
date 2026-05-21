# Déploiement — `bernouy/nginx-proxy`

Shared reverse proxy : termine TLS (lego HTTP-01 multi-domaines) et route
chaque host vers son backend interne (hub:3000, cms:3000, auth:8080, …)
sur un docker network privé. Seul container exposant `:80` / `:443` à
l'extérieur.

---

## 1. Pré-requis côté serveur

- Docker + un docker network user-defined partagé entre les backends et
  le proxy.

```bash
docker network create bernouy-net
```

- DNS : tous les hostnames pointent vers l'IP du serveur.
- Ports 80 + 443 libres + ouverts au monde (ACME HTTP-01).

---

## 2. Provisionner le bundle OKMS `prod/nginx-proxy/config`

Clés à renseigner :

| Clé | Valeur |
|---|---|
| `LEGO_EMAIL` | `ops@bernouy.com` |
| `UPSTREAMS` | `hub.bernouy.com=hub:3000,cms.bernouy.com=cms-mt:3000,auth.bernouy.com=auth:8080` |
| `LEGO_SERVER` (opt) | override pour staging (ex. `https://acme-staging-v02.api.letsencrypt.org/directory`) |

**Format `UPSTREAMS`** : CSV de paires `<domain>=<host>:<port>`. Les
`<host>` sont des noms de containers Docker (résolus par le DNS interne
du network). Les `<port>` sont ceux internes au backend
(3000 pour bun, 8080 pour Keycloak, etc.).

L'access certificate OKMS de ce service n'a besoin que de l'action
`secretConfig/get` (pas d'API crypto — pas de CMK).

---

## 3. Bootstrap host

### 3a. mTLS cert + key

```bash
sudo install -d -m 0700 -o root -g root /etc/nginx-proxy/okms
sudo install -m 0600 -o root -g root /dev/null /etc/nginx-proxy/okms/client.crt
sudo install -m 0400 -o root -g root /dev/null /etc/nginx-proxy/okms/client.key
sudo nano /etc/nginx-proxy/okms/client.crt
sudo nano /etc/nginx-proxy/okms/client.key
```

### 3b. `bootstrap.env`

```bash
sudo install -d -m 0700 -o root -g root /etc/nginx-proxy
sudo install -m 0600 -o root -g root /dev/null /etc/nginx-proxy/bootstrap.env
sudo nano /etc/nginx-proxy/bootstrap.env
```

Contenu :

```bash
OKMS_REGION=eu-west-rbx
OKMS_DOMAIN_ID=<uuid>
OKMS_CERT_PATH=/etc/okms/client.crt
OKMS_KEY_PATH=/etc/okms/client.key
OKMS_SECRET_PREFIX=prod/nginx-proxy/config
```

---

## 4. Build + transfert

```bash
docker buildx build --network=host \
    -f docker/nginx-proxy/Dockerfile \
    -t bernouy/nginx-proxy:0.1.0 .
docker save bernouy/nginx-proxy:0.1.0 | gzip > nginx-proxy-0.1.0.tar.gz
scp nginx-proxy-0.1.0.tar.gz <user>@<server>:/tmp/
sudo docker load < /tmp/nginx-proxy-0.1.0.tar.gz
```

---

## 5. Lancement

Les backends doivent déjà tourner sur le même network (cf. leur DEPLOY).
Puis :

```bash
sudo docker run -d --name nginx-proxy \
    --restart unless-stopped \
    --network bernouy-net \
    --dns 1.1.1.1 --dns 8.8.8.8 \
    -p 80:80 -p 443:443 \
    -v nginx-proxy-data:/var/lib/nginx-proxy \
    -v /etc/nginx-proxy/okms/client.crt:/etc/okms/client.crt:ro \
    -v /etc/nginx-proxy/okms/client.key:/etc/okms/client.key:ro \
    --env-file /etc/nginx-proxy/bootstrap.env \
    bernouy/nginx-proxy:0.1.0

sudo docker logs -f nginx-proxy
```

Au boot tu verras :
- `[okms-fetch] fetched bundle (prefix=prod/nginx-proxy/config)`
- `[nginx-proxy] domains: hub.bernouy.com,cms.bernouy.com,...`
- `[nginx-proxy] Provisioning hub.bernouy.com via lego…` (premier boot)
- `[nginx-proxy] Starting nginx…`

---

## 6. Smoke test

```bash
# 1. Container healthy
sudo docker ps --filter name=nginx-proxy --format 'table {{.Status}}'

# 2. Chaque domaine renvoie ce que son upstream renvoie
curl -fsI https://hub.bernouy.com/health
curl -fsI https://cms.bernouy.com/superadmin/

# 3. ACME challenge accessible en HTTP (pour les renew)
curl -I http://hub.bernouy.com/.well-known/acme-challenge/test
# → 404 (normal, pas de challenge en cours) — mais 404 NGINX, pas un connection refused
```

---

## 7. Update de la liste des upstreams

Pour ajouter un nouveau backend :

1. Mettre à jour le bundle OKMS `UPSTREAMS` (ajouter `nouveau-domaine=container:port`)
2. `sudo docker restart nginx-proxy`
3. Le nouveau cert lego est provisionné automatiquement au boot

Pas de rebuild image nécessaire — toute la config vient du bundle.

---

## 8. Update de l'image

Build + scp + `docker load` + `docker stop nginx-proxy && docker rm nginx-proxy` puis relancer §5. Le volume `nginx-proxy-data` conserve les certs lego (Let's Encrypt re-issuera de toute façon mais évite de pinger le rate limit à chaque update).

---

## 9. Limites connues v0.1

- **Routes domaine-level uniquement**, pas de routes path-level dans la
  config (ex. `host A → /api → backend X, /admin → backend Y`). Si un
  backend a besoin de multiplexer en interne, c'est à lui de le faire
  (typiquement Bun via `mountHubApi` + `mountHubUi` sur des préfixes
  différents — déjà le cas pour le hub).
- **Pas de wildcards.** Si tu as N tenants au même DNS pattern
  `*.cms.bernouy.com`, il faudra un wildcard cert via DNS-01 (pas livré).
- **Renew quotidien hard-coded** à 24h. Adapter le sleep si l'opérateur
  veut une cadence différente.
- **Pas de mTLS / mutual TLS** côté upstream. Si un backend veut exiger
  un certificat client du proxy, ce n'est pas câblé.
