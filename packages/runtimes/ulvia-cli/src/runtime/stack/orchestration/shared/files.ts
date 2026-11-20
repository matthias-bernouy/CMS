import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCaddyHostingConfiguration } from "@bernouy/hosting/caddy";
import { TLS_PERMISSION_PATH } from "@bernouy/hosting/tls";
import type { InstallationConfig } from "../../installation";
import type { UlviaPaths } from "../../../paths";
import { captureProviderMount } from "../../captures/mount";

export function sharedEdgeNames(count: number): string[] {
    if (!Number.isSafeInteger(count) || count < 1 || count > 16) {
        throw new Error("Shared Edge count must be between 1 and 16");
    }
    return Array.from({ length: count }, (_, index) => `edge-${index + 1}`);
}
export async function writeSharedComposeFiles(paths: UlviaPaths, installation: InstallationConfig) {
    const names = sharedEdgeNames(installation.hosting.edgeCount);
    const root = join(paths.services, "proxy");
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(
        join(root, "caddy.json"),
        JSON.stringify(
            createCaddyHostingConfiguration({
                permissionUrl: `http://ulvia-provider:5103${TLS_PERMISSION_PATH}`,
                upstreams: names.map((name) => `${name}:3000`),
                storageRoot: "/data/caddy",
                privatePort: 8080,
                tls:
                    installation.tls.mode === "disabled"
                        ? false
                        : {
                              issuer: "acme",
                              directory: "https://acme-v02.api.letsencrypt.org/directory",
                              email: installation.tls.email,
                              publicPort: installation.tls.httpsPort,
                          },
            }),
            null,
            2,
        ),
        { mode: 0o600 },
    );
    const services = Object.fromEntries(
        names.map((name) => [
            name,
            {
                image: "${EDGE_IMAGE}",
                restart: "unless-stopped",
                init: true,
                user: "${ULVIA_UID}:${ULVIA_GID}",
                environment: {
                    MODE: "PROD",
                    NODE_ENV: "production",
                    CMS_HOST: "0.0.0.0",
                    CMS_PORT: "3000",
                    CMS_HOSTING_PROVIDER_URL: "http://ulvia-provider:5103",
                    CMS_HOSTING_EDGE_SECRET: "${ULVIA_EDGE_ROUTING_SECRET}",
                },
                networks: ["instances"],
                depends_on: { provider: { condition: "service_healthy" } },
                read_only: true,
                tmpfs: ["/tmp:rw,nosuid,nodev,noexec,size=256m"],
                cap_drop: ["ALL"],
                security_opt: ["no-new-privileges:true"],
                healthcheck: {
                    test: [
                        "CMD",
                        "bun",
                        "-e",
                        "const r=await fetch('http://127.0.0.1:3000/readyz'); if(!r.ok) process.exit(1); await r.body?.cancel()",
                    ],
                    interval: "10s",
                    timeout: "5s",
                    retries: 6,
                    start_period: "10s",
                },
                stop_grace_period: "30s",
            },
        ]),
    );
    await writeFile(
        join(paths.services, "shared-edges.json"),
        JSON.stringify(
            {
                services: {
                    ...services,
                    ...(await captureProviderMount(installation.capture)),
                    proxy: {
                        depends_on: Object.fromEntries(names.map((name) => [name, { condition: "service_healthy" }])),
                    },
                },
            },
            null,
            2,
        ),
        { mode: 0o600 },
    );
}
