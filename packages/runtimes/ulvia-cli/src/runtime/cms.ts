import { fileURLToPath } from "node:url";
import type { LocalMongo } from "./mongo";
import type { DevRuntimeConfig } from "./config";
import type { UlviaPaths } from "./paths";

export type DevPorts = Readonly<{
    control: number;
    delivery: number;
    repository: number;
    mongo: number;
}>;

export type CmsProcess = ReturnType<typeof Bun.spawn>;

export async function startLocalCms(
    paths: UlviaPaths,
    config: DevRuntimeConfig,
    mongo: LocalMongo,
    repositoryUrl: string,
    ports: DevPorts,
): Promise<CmsProcess> {
    const entrypoint = fileURLToPath(import.meta.resolve("@bernouy/cms-server"));
    const controlUrl = `http://127.0.0.1:${ports.control}`;
    const deliveryUrl = `http://127.0.0.1:${ports.delivery}`;
    const cms = Bun.spawn([process.execPath, entrypoint], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        env: {
            ...process.env,
            MODE: "DEV",
            CONTROL_PORT: String(ports.control),
            DELIVERY_PORT: String(ports.delivery),
            CONTROL_PUBLIC_URL: controlUrl,
            DELIVERY_PUBLIC_URL: deliveryUrl,
            CMS_SESSION_SECRET: config.sessionSecret,
            CMS_KEK_HEX: config.kekHex,
            CMS_ADMIN_EMAIL: config.adminEmail,
            CMS_ADMIN_PASSWORD: config.adminPassword,
            CMS_FILES_DIR: paths.cmsFiles,
            CMS_INTEGRATION_PACKAGE_CACHE_DIR: paths.packages,
            MONGO_URL: mongo.url,
            CMS_AUTH_SITE_NAME: "Ulvia local CMS",
            CMS_AUTH_EMAIL_COOLDOWN_SECONDS: "0",
            ANALYTICS_SALT_SECRET: config.analyticsSecret,
            ENDPOINT_PERFORMANCE_ENABLED: "false",
            CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED: "false",
            CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED: "false",
            CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED: "false",
            CMS_HTTP_CLIENT_ADDRESS_MODE: "disabled",
            CMS_REPOSITORY_HUB_FACADE_ENABLED: "false",
            P9R_INTEGRATION_REPOSITORY_URL: repositoryUrl,
        },
    });
    try {
        await Promise.race([
            waitForHttp(controlUrl),
            cms.exited.then((exitCode) => {
                throw new Error(`Local CMS exited before becoming ready (exit ${exitCode})`);
            }),
        ]);
        return cms;
    } catch (error) {
        cms.kill("SIGTERM");
        throw error;
    }
}

export async function stopLocalCms(cms: CmsProcess): Promise<void> {
    if (cms.exitCode !== null) {
        return;
    }
    cms.kill("SIGTERM");
    await Promise.race([
        cms.exited,
        Bun.sleep(10_000).then(() => {
            if (cms.exitCode === null) {
                cms.kill("SIGKILL");
            }
        }),
    ]);
}

async function waitForHttp(url: string): Promise<void> {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        const ready = await fetch(url, { redirect: "manual" }).then(
            () => true,
            () => false,
        );
        if (ready) {
            return;
        }
        await Bun.sleep(250);
    }
    throw new Error(`Local CMS did not become ready at ${url}`);
}
