import type { LocalServicesConfig } from "../../config";
import type { LocalInstanceConfig } from "../../instanceConfig";
import type { LocalInstanceConnection } from "../../instanceConnection";
import type { LocalInstancePaths, UlviaPaths } from "../../paths";
import type { InstallationConfig } from "../installation";
import { instancePublicUrl } from "../ports";
import { pinnedOfficialImageReference, type OfficialImage } from "./images";
import type { LocalServicesState } from "./state";

type ServiceCredentials = Readonly<{
    config: LocalServicesConfig;
    repositoryToken: string;
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
        OFFICIAL_REPOSITORY_IMAGE: pinnedOfficialImageReference(state.images.repository),
        ULVIA_BIND_ADDRESS: installation.bindAddress,
        ULVIA_HTTP_PORT: String(installation.ports.http),
        ULVIA_HTTPS_PORT: installation.tls.mode === "acme" ? String(installation.tls.httpsPort) : "443",
        ULVIA_ACME_EMAIL: installation.tls.mode === "acme" ? installation.tls.email : "disabled@example.invalid",
        ULVIA_PROVIDER_PORT: String(installation.ports.provider),
        ULVIA_REPOSITORY_PORT: String(installation.ports.repository),
        ULVIA_UID: String(process.getuid?.() ?? 1000),
        ULVIA_GID: String(process.getgid?.() ?? 1000),
        ULVIA_PRIVATE_NETWORK: state.privateNetwork,
        ULVIA_INSTANCE_NETWORK: state.instanceNetwork,
        ULVIA_MONGO_DIR: paths.mongo,
        ULVIA_FILES_DIR: paths.cmsFiles,
        ULVIA_REPOSITORY_DIR: paths.repository,
        ULVIA_LOGS_DIR: paths.serviceLogs,
        ULVIA_PROXY_CERTIFICATES_DIR: paths.proxy.certificates,
        ULVIA_PROXY_VHOST_DIR: paths.proxy.virtualHosts,
        ULVIA_PROXY_CHALLENGE_DIR: paths.proxy.challenge,
        ULVIA_PROXY_ACME_DIR: paths.proxy.acme,
        ULVIA_MONGO_USERNAME: credentials?.config.mongoUsername ?? "ulvia",
        ULVIA_MONGO_PASSWORD: credentials?.config.mongoPassword ?? "a".repeat(43),
        ULVIA_MONGO_PROVIDER_USERNAME: credentials?.config.mongoProviderUsername ?? "ulvia_provider",
        ULVIA_MONGO_PROVIDER_PASSWORD: credentials?.config.mongoProviderPassword ?? "b".repeat(43),
        ULVIA_PROVIDER_SESSION_SECRET: credentials?.config.sessionSecret ?? "a".repeat(43),
        ULVIA_PROVIDER_KEK_HEX: credentials?.config.kekHex ?? "0".repeat(64),
        ULVIA_REPOSITORY_TOKEN: credentials?.repositoryToken ?? "a".repeat(43),
        ULVIA_PROVIDER_OPERATOR_TOKEN: credentials?.operatorToken ?? "a".repeat(43),
    };
}

export function localKernelEnvironment(
    instance: LocalInstancePaths,
    config: LocalInstanceConfig,
    connection: LocalInstanceConnection,
    services: LocalServicesState,
    image: OfficialImage,
): Record<string, string> {
    return {
        KERNEL_IMAGE: pinnedOfficialImageReference(image),
        ULVIA_UID: String(process.getuid?.() ?? 1000),
        ULVIA_GID: String(process.getgid?.() ?? 1000),
        ULVIA_INSTANCE_NETWORK: services.instanceNetwork,
        ULVIA_INSTANCE_HOSTNAME: config.hostname,
        ULVIA_INSTANCE_URL: instancePublicUrl(config.hostname, services.installation),
        ULVIA_INSTANCE_TLS: services.installation.tls.mode,
        ULVIA_LOGS_DIR: instance.logs,
        CMS_INSTALLATIONS_PROVIDER_TOKEN: connection.token,
    };
}
