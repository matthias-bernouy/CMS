# CMS production deployment

The production layout has two levels:

- `infra/compose.yml` runs once per server and owns nginx, certificates,
  MongoDB, the official repository, shared file storage, and one multi-instance
  Ulvia Provider.
- `compose.yml` runs once per CMS instance and contains only that instance's
  Kernel.

The Provider operator API creates an isolated instance database and returns one
opaque Kernel access token. A Kernel never receives the Provider operator,
MongoDB, session, encryption or invocation credentials.

## Security boundaries

- MongoDB is reachable only through the internal `cms_mongo` network.
- The Provider uses a non-root `readWriteAnyDatabase` account because it must
  create and open dynamically named instance databases.
- The Provider and Kernels communicate on the internal `cms_provider` network.
- Each instance receives its own access token, invocation secret, session secret
  and KEK. The Kernel receives only the access token; the remaining credentials
  are stored encrypted by the Provider.
- The root MongoDB account remains infrastructure-only.

The shared Provider, MongoDB process and file volume are availability
boundaries for all instances on that server. This Compose layout is not highly
available.

## Build and transfer

Build one immutable image from the repository root:

```bash
VERSION=2026.10.12-1
IMAGE="bernouy/cms:${VERSION}"
docker build --pull --tag "${IMAGE}" --file infra/images/cms/Dockerfile .
docker save "${IMAGE}" | gzip > "/tmp/cms-${VERSION}.tar.gz"
sha256sum "/tmp/cms-${VERSION}.tar.gz" > "/tmp/cms-${VERSION}.tar.gz.sha256"
```

Transfer `compose.yml`, `.env.example`, `infra/`, and the image archive. Never
copy local `.env` files or instance data as part of the release payload.

## Start the shared infrastructure

This fresh-install procedure expects an empty MongoDB volume. Docker's MongoDB
initializer does not run scripts against a non-empty volume.

```bash
cd /opt/cms-deploy/infra
umask 077
cp .env.example .env
```

Fill every required value. Generate all secrets before writing them; Compose
environment files do not execute shell expressions.

```dotenv
LETSENCRYPT_EMAIL=ops@example.com
CMS_IMAGE=bernouy/cms:2026.10.12-1
MONGO_ROOT_USERNAME=cms_root
MONGO_ROOT_PASSWORD=<openssl-rand-hex-32>
MONGO_PROVIDER_USERNAME=ulvia_provider
MONGO_PROVIDER_PASSWORD=<openssl-rand-hex-32>
ULVIA_PROVIDER_OPERATOR_TOKEN=<openssl-rand-base64url-32>
ULVIA_PROVIDER_SESSION_SECRET=<openssl-rand-hex-32>
ULVIA_PROVIDER_KEK_HEX=<openssl-rand-hex-32>
ULVIA_REPOSITORY_TOKEN=<openssl-rand-base64url-32>
```

Then start the shared services:

```bash
chmod 600 .env
docker compose config --quiet
docker compose up -d --wait
docker compose ps
```

On a fresh volume, `02-create-provider-user.js` creates the Provider account
with only `readWriteAnyDatabase@admin`. The stateless Kernel receives no
MongoDB credential; the Provider account is not a MongoDB root account.

## Create an instance

Keep the administrator password outside deployment files. Call the operator
API from the Provider container so the API does not need a public route:

```bash
cd /opt/cms-deploy/infra
umask 077
ADMIN_PASSWORD="$(openssl rand -hex 24)"

docker compose exec -T \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
  provider bun -e '
    const response = await fetch("http://127.0.0.1:5103/ulvia/operator/instances", {
      method: "POST",
      headers: {
        authorization: "Bearer " + process.env.ULVIA_PROVIDER_OPERATOR_TOKEN,
        "content-type": "application/json",
        "idempotency-key": "client-example-com-v1"
      },
      body: JSON.stringify({
        label: "Client example",
        kernelUrl: "https://client.example.com",
        administrator: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
      })
    });
    if (!response.ok) throw new Error(`Provisioning failed: ${response.status}`);
    console.log(JSON.stringify(await response.json()));
  ' > /tmp/client-instance.json

chmod 600 /tmp/client-instance.json
unset ADMIN_PASSWORD
```

The response contains:

- `instance.id` and `instance.storageKey`;
- `credentials.instanceAccessToken` for Kernel-to-Provider authentication.

The Provider retains the instance's database, session, encryption and outgoing
invocation credentials. Never copy those secrets into the Kernel deployment.

## Start the Kernel

Create one directory per instance and fill `.env` from the protected operator
response:

```bash
install -d -m 0750 /opt/cms-sites/client
cd /opt/cms-sites/client
cp /opt/cms-deploy/compose.yml .
cp /opt/cms-deploy/.env.example .
cp .env.example .env
chmod 600 .env
```

```dotenv
DOMAIN=client.example.com
CMS_IMAGE=bernouy/cms:2026.10.12-1
CMS_INSTALLATIONS_PROVIDER_TOKEN=<credentials.instanceAccessToken>
```

```bash
docker compose config --quiet
docker compose up -d --wait
docker compose ps
```

Verify public Pages, `/login`, `/admin/pages`, and an authenticated file upload.

The Kernel is stateless. It needs network access to the Provider and the public
proxy only; it does not join the MongoDB network or mount the files volume.

## Backups and updates

Back up together:

- all MongoDB databases, including `ulvia_provider_control`;
- the `cms_files` and `repository_data` volumes;
- the shared infrastructure `.env`;
- every instance `.env`, which contains its Provider access token.

For a consistent snapshot, stop the Provider and all Kernels during the dump,
or use storage-level snapshots with matching consistency guarantees. Test
restoration regularly.

Deploy a new immutable image tag by changing `CMS_IMAGE` in the shared
infrastructure and instance environments, validating with `docker compose
config --quiet`, then recreating the services. Update the shared Provider before
Kernels only when the release notes declare that ordering compatible.

Never rotate the Provider KEK by replacing its environment value alone.
Existing data keys must first be re-wrapped. Rotating an instance session
secret logs out its existing sessions. Keep old encrypted backups until
rotations and restores have been verified.
