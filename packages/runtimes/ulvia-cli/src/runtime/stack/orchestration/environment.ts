import { createHash } from "node:crypto";
import type { LocalServicesConfig } from "../../config";
import type { UlviaPaths } from "../../paths";
import type { InstallationConfig } from "../installation";
import { pinnedOfficialImageReference } from "./images";
import type { LocalServicesState } from "./state";

type ServiceCredentials = Readonly<{
    config: LocalServicesConfig;
    operatorToken: string;
}>;

export function localServicesEnvironment(
    paths: UlviaPaths,
    installation: InstallationConfig,
    state: Pick<LocalServicesState, "privateNetwork" | "instanceNetwork" | "images">,
    credentials?: ServiceCredentials,
): Record<string, string> {
    return {
        PROVIDER_IMAGE: pinnedOfficialImageReference(state.images.provider),
        EDGE_IMAGE: pinnedOfficialImageReference(state.images.edge),
        ULVIA_CONTROL_ORIGIN: installation.hosting.controlOrigin,
        ULVIA_HOSTING_MANAGED_SUFFIXES: JSON.stringify(installation.hosting.managedSuffixes),
        ULVIA_TLS_ENTRYPOINTS: JSON.stringify(
            installation.tls.mode === "disabled" ? [] : [{ host: "proxy", port: 443 }],
        ),
        ULVIA_TLS_PUBLIC_ADDRESSES: JSON.stringify(installation.hosting.publicAddresses),
        ULVIA_CONTROL_CREDENTIALS_DIR: `${paths.services}/credentials`,
        ULVIA_CADDY_CONFIG: `${paths.services}/proxy/caddy.json`,
        ULVIA_CADDY_CONFIG_DIGEST: createHash("sha256")
            .update(JSON.stringify({ edges: installation.hosting.edgeCount, tls: installation.tls }))
            .digest("hex"),
        ULVIA_EDGE_ROUTING_SECRET: credentials?.config.edgeRoutingSecret ?? "a".repeat(43),
        ULVIA_BIND_ADDRESS: installation.bindAddress,
        ULVIA_HTTP_PORT: String(installation.ports.http),
        ULVIA_HTTPS_PORT: installation.tls.mode === "acme" ? String(installation.tls.httpsPort) : "443",
        ULVIA_PROVIDER_PORT: String(installation.ports.provider),
        ULVIA_UID: String(process.getuid?.() ?? 1000),
        ULVIA_GID: String(process.getgid?.() ?? 1000),
        ULVIA_PRIVATE_NETWORK: state.privateNetwork,
        ULVIA_INSTANCE_NETWORK: state.instanceNetwork,
        ULVIA_MONGO_DIR: paths.mongo,
        ULVIA_FILES_DIR: paths.cmsFiles,
        ULVIA_PROXY_CERTIFICATES_DIR: paths.proxy.certificates,
        ULVIA_MONGO_USERNAME: credentials?.config.mongoUsername ?? "ulvia",
        ULVIA_MONGO_PASSWORD: credentials?.config.mongoPassword ?? "a".repeat(43),
        ULVIA_MONGO_PROVIDER_USERNAME: credentials?.config.mongoProviderUsername ?? "ulvia_provider",
        ULVIA_MONGO_PROVIDER_PASSWORD: credentials?.config.mongoProviderPassword ?? "b".repeat(43),
        ULVIA_PROVIDER_SESSION_SECRET: credentials?.config.sessionSecret ?? "a".repeat(43),
        ULVIA_PROVIDER_KEK_ACTIVE_ID: "control",
        ULVIA_PROVIDER_KEK_RING_JSON: JSON.stringify({ control: credentials?.config.kekHex ?? "0".repeat(64) }),
        ULVIA_PROVIDER_OPERATOR_TOKEN: credentials?.operatorToken ?? "a".repeat(43),
    };
}
