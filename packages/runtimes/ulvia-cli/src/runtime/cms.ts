import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { DevRuntimeConfig } from "./config";
import type { LocalInstanceConnection } from "./config";
import type { LocalMongo } from "./mongo";
import type { UlviaPaths } from "./paths";
import { spawnCommand } from "./process";

export type DevPorts = Readonly<{
    kernel: number;
    mongo: number;
    repository: number;
    provider: number;
}>;

export type CmsServerProcess = ReturnType<typeof Bun.spawn>;

type ProviderServerOptions = Readonly<{
    inheritOutput?: boolean;
    operatorToken: string;
}>;

export async function startLocalProvider(
    paths: UlviaPaths,
    config: DevRuntimeConfig,
    mongo: LocalMongo,
    ports: DevPorts,
    options: ProviderServerOptions,
): Promise<CmsServerProcess> {
    const entrypoint = fileURLToPath(import.meta.resolve("@bernouy/ulvia-provider-server"));
    const providerUrl = `http://127.0.0.1:${ports.provider}`;
    const inheritOutput = options.inheritOutput ?? true;
    const provider = spawnCommand([process.execPath, entrypoint], {
        inherit: inheritOutput,
        ignore: !inheritOutput,
        env: {
            ...process.env,
            MODE: "DEV",
            MONGO_URL: mongoDatabaseUrl(mongo.url, "ulvia_provider_control"),
            CMS_FILES_DIR: paths.cmsFiles,
            CMS_SESSION_SECRET: config.sessionSecret,
            CMS_KEK_HEX: config.kekHex,
            CMS_REPOSITORY_URL: `http://127.0.0.1:${ports.repository}`,
            ULVIA_PROVIDER_PORT: String(ports.provider),
            ULVIA_PROVIDER_HOST: "127.0.0.1",
            ULVIA_PROVIDER_PUBLIC_URL: providerUrl,
            ULVIA_PROVIDER_OPERATOR_TOKEN: options.operatorToken,
        },
    });
    try {
        await Promise.race([
            waitForProvider(providerUrl, options.operatorToken),
            provider.exited.then((exitCode) => {
                throw new Error(`Local Ulvia Provider exited before becoming ready (exit ${exitCode})`);
            }),
        ]);
        return provider;
    } catch (error) {
        provider.kill("SIGTERM");
        throw error;
    }
}

export async function startLocalKernel(
    paths: UlviaPaths,
    config: DevRuntimeConfig,
    mongo: LocalMongo,
    ports: DevPorts,
    instance: LocalInstanceConnection,
    options: Readonly<{ inheritOutput?: boolean }> = {},
): Promise<CmsServerProcess> {
    const entrypoint = fileURLToPath(import.meta.resolve("@bernouy/cms-kernel-server"));
    const kernelUrl = `http://127.0.0.1:${ports.kernel}`;
    const inheritOutput = options.inheritOutput ?? true;
    const kernel = spawnCommand([process.execPath, entrypoint], {
        inherit: inheritOutput,
        ignore: !inheritOutput,
        env: {
            ...process.env,
            MODE: "DEV",
            KERNEL_PORT: String(ports.kernel),
            KERNEL_HOST: "127.0.0.1",
            KERNEL_PUBLIC_URL: kernelUrl,
            ULVIA_PROVIDER_URL: `http://127.0.0.1:${ports.provider}`,
            ULVIA_INSTANCE_TOKEN: instance.token,
            CMS_SESSION_SECRET: config.sessionSecret,
            CMS_KEK_HEX: config.kekHex,
            CMS_FILES_DIR: join(paths.cmsFiles, instance.storageKey),
            MONGO_URL: mongoDatabaseUrl(mongo.url, `ulvia_${instance.storageKey.replaceAll("-", "_")}`),
            CMS_AUTH_SITE_NAME: "Ulvia local CMS",
            CMS_AUTH_EMAIL_COOLDOWN_SECONDS: "0",
            CMS_HTTP_CLIENT_ADDRESS_MODE: "disabled",
        },
    });
    try {
        await Promise.race([
            waitForHttp(kernelUrl),
            kernel.exited.then((exitCode) => {
                throw new Error(`Local CMS Kernel exited before becoming ready (exit ${exitCode})`);
            }),
        ]);
        return kernel;
    } catch (error) {
        kernel.kill("SIGTERM");
        throw error;
    }
}

export async function stopLocalServer(server: CmsServerProcess): Promise<void> {
    if (server.exitCode !== null) {
        return;
    }
    server.kill("SIGTERM");
    await Promise.race([
        server.exited,
        Bun.sleep(10_000).then(() => {
            if (server.exitCode === null) {
                server.kill("SIGKILL");
            }
        }),
    ]);
}

async function waitForProvider(url: string, token: string): Promise<void> {
    await waitForHttp(
        `${url}/ulvia/operator/instances`,
        { headers: { authorization: `Bearer ${token}` } },
        (response) => response.ok,
    );
}

function mongoDatabaseUrl(base: string, databaseName: string): string {
    if (!/^[a-z0-9_]{1,100}$/u.test(databaseName)) {
        throw new TypeError("Mongo database name is invalid");
    }
    const url = new URL(base);
    url.pathname = `/${databaseName}`;
    return url.toString();
}

async function waitForHttp(
    url: string,
    init?: RequestInit,
    accept: (response: Response) => boolean = (response) => response.status < 500,
): Promise<void> {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        const ready = await fetch(url, { ...init, redirect: "manual" }).then(accept, () => false);
        if (ready) {
            return;
        }
        await Bun.sleep(250);
    }
    throw new Error(`Local server did not become ready at ${url}`);
}
