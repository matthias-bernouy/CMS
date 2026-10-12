import { fileURLToPath } from "node:url";
import type { DevRuntimeConfig } from "./config";
import type { LocalMongo } from "./mongo";
import type { UlviaPaths } from "./paths";
import { spawnCommand } from "./process";

export type DevPorts = Readonly<{
    kernel: number;
    mongo: number;
    repository: number;
    provider: number;
}>;

export type CmsProcess = ReturnType<typeof Bun.spawn>;

export async function startLocalCms(
    paths: UlviaPaths,
    config: DevRuntimeConfig,
    mongo: LocalMongo,
    ports: DevPorts,
    options: Readonly<{
        inheritOutput?: boolean;
        ulviaProviderToken?: string;
    }> = {},
): Promise<CmsProcess> {
    const entrypoint = fileURLToPath(import.meta.resolve("@bernouy/cms-server"));
    const kernelUrl = `http://127.0.0.1:${ports.kernel}`;
    const inheritOutput = options.inheritOutput ?? true;
    const cms = spawnCommand([process.execPath, entrypoint], {
        inherit: inheritOutput,
        ignore: !inheritOutput,
        env: {
            ...process.env,
            MODE: "DEV",
            KERNEL_PORT: String(ports.kernel),
            KERNEL_PUBLIC_URL: kernelUrl,
            CMS_SESSION_SECRET: config.sessionSecret,
            CMS_KEK_HEX: config.kekHex,
            CMS_ADMIN_EMAIL: config.adminEmail,
            CMS_ADMIN_PASSWORD: config.adminPassword,
            CMS_FILES_DIR: paths.cmsFiles,
            MONGO_URL: mongo.url,
            CMS_REPOSITORY_URL: `http://127.0.0.1:${ports.repository}`,
            CMS_GATEWAY_SITE_ID: "default",
            ...(options.ulviaProviderToken
                ? {
                      ULVIA_PROVIDER_PORT: String(ports.provider),
                      ULVIA_PROVIDER_PUBLIC_URL: `http://127.0.0.1:${ports.provider}`,
                      ULVIA_PROVIDER_TOKEN: options.ulviaProviderToken,
                  }
                : {}),
            CMS_AUTH_SITE_NAME: "Ulvia local CMS",
            CMS_AUTH_EMAIL_COOLDOWN_SECONDS: "0",
            CMS_HTTP_CLIENT_ADDRESS_MODE: "disabled",
        },
    });
    try {
        await Promise.race([
            waitForHttp(kernelUrl),
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
