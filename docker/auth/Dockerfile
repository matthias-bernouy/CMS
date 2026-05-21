# Keycloak self-hosted for auth.bernouy.com.
# nginx (TLS terminate, ACME) + Keycloak (HTTP on 127.0.0.1:8080) + lego in
# the same container, mirroring the cms-control-mt pattern. Postgres lives
# in a sibling container `auth-postgres` on a user-defined docker network.

FROM debian:bookworm-slim

ARG KEYCLOAK_VERSION=26.6.1
ARG LEGO_VERSION=4.27.0
ARG TARGETARCH=amd64

# Keycloak 26.x requires Java 21 (LTS). bookworm main only ships 17 and
# Debian never backported 21 to bookworm (it landed in trixie). Pull
# Temurin 21 JRE from the Adoptium apt repo, which has a bookworm channel.
RUN install -d -m 0755 /etc/apt/keyrings \
 && apt-get update && apt-get install -y --no-install-recommends \
        nginx curl ca-certificates jq lsb-release sudo procps gettext-base gnupg \
 && curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public \
        | gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb bookworm main" \
        > /etc/apt/sources.list.d/adoptium.list \
 && apt-get update && apt-get install -y --no-install-recommends temurin-21-jre \
 && curl -fsSL "https://github.com/keycloak/keycloak/releases/download/${KEYCLOAK_VERSION}/keycloak-${KEYCLOAK_VERSION}.tar.gz" \
        | tar -xz -C /opt \
 && mv "/opt/keycloak-${KEYCLOAK_VERSION}" /opt/keycloak \
 && curl -fsSL "https://github.com/go-acme/lego/releases/download/v${LEGO_VERSION}/lego_v${LEGO_VERSION}_linux_${TARGETARCH}.tar.gz" \
        | tar -xz -C /usr/local/bin lego \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd -r keycloak \
 && useradd -r -g keycloak -d /opt/keycloak -s /usr/sbin/nologin keycloak \
 && chown -R keycloak:keycloak /opt/keycloak

# Build the Keycloak server-side index once at image build time so first²²
# boot doesn't pay the ~30s `kc.sh build` penalty. Re-built at runtime if
# any KC_DB / KC_FEATURES change vs the baked-in defaults.
USER keycloak
RUN /opt/keycloak/bin/kc.sh build --db=postgres
USER root

COPY docker/auth/nginx.conf.template /etc/nginx/conf.d/auth/nginx.conf.template
RUN mkdir -p /etc/nginx/conf.d/auth \
 && echo "include /etc/nginx/conf.d/auth/nginx.conf;" > /etc/nginx/conf.d/auth-include.conf \
 && rm -f /etc/nginx/sites-enabled/default

RUN echo "keycloak ALL=(root) NOPASSWD: /usr/sbin/nginx -s reload" > /etc/sudoers.d/keycloak \
 && chmod 0440 /etc/sudoers.d/keycloak

# Shared OKMS bootstrap wrapper (mTLS pull from OVHcloud Secret Manager).
COPY docker/_shared/okms-fetch.sh /usr/local/bin/okms-fetch
RUN chmod +x /usr/local/bin/okms-fetch

COPY docker/auth/entrypoint.sh /usr/local/bin/auth-entrypoint.sh
RUN chmod +x /usr/local/bin/auth-entrypoint.sh

VOLUME ["/var/lib/auth"]
EXPOSE 80 443

# Keycloak's openid-configuration endpoint is the cheapest unauthenticated
# probe — returns 200 once the server is up. start-period gives time for
# the JVM warmup + DB schema migration on cold boot.
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
    CMD curl -fsS -o /dev/null http://127.0.0.1:8080/realms/master/.well-known/openid-configuration || exit 1

ENTRYPOINT ["/usr/local/bin/okms-fetch", "/usr/local/bin/auth-entrypoint.sh"]
