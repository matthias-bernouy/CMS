import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeRepositoryUrl } from "../../repository/connection";
import { privateDirectory } from "../../repository/config";

export type RepositoryDeploymentConfig = {
    schema: "ulvia.repository-deployment.v1";
    port: number;
    publicUrl: string;
    tls: { mode: "local" | "external" } | { mode: "acme"; email: string };
};

export function defaultRepositoryConfig(port = 5010): RepositoryDeploymentConfig {
    return {
        schema: "ulvia.repository-deployment.v1",
        port,
        publicUrl: `http://127.0.0.1:${port}`,
        tls: { mode: "local" },
    };
}

export function parseRepositoryConfig(value: RepositoryDeploymentConfig): RepositoryDeploymentConfig {
    if (
        !value ||
        value.schema !== "ulvia.repository-deployment.v1" ||
        !Number.isSafeInteger(value.port) ||
        value.port < 1 ||
        value.port > 65535 ||
        !value.tls ||
        !["local", "external", "acme"].includes(value.tls.mode)
    ) {
        throw new Error("Invalid Repository deployment configuration");
    }
    const url = normalizeRepositoryUrl(value.publicUrl);
    if (
        url !== value.publicUrl ||
        (value.tls.mode === "local" && url !== `http://127.0.0.1:${value.port}`) ||
        (value.tls.mode !== "local" && !url.startsWith("https://"))
    ) {
        throw new Error("Repository TLS mode and public origin do not match");
    }
    if (
        value.tls.mode === "acme" &&
        ([80, 443].includes(value.port) ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.tls.email) ||
            !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/u.test(new URL(url).hostname) ||
            new URL(url).port)
    ) {
        throw new Error("ACME requires an email and a public HTTPS domain on port 443");
    }
    return value;
}

export async function readRepositoryConfig(
    root: string,
    fallback = defaultRepositoryConfig(),
): Promise<RepositoryDeploymentConfig> {
    const source = await readFile(join(root, "config.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (source && source.length > 32768) {
        throw new Error("Repository deployment configuration exceeds its limit");
    }
    return source === null ? fallback : parseRepositoryConfig(JSON.parse(source));
}

export async function saveRepositoryConfig(root: string, config: RepositoryDeploymentConfig): Promise<void> {
    parseRepositoryConfig(config);
    await privateDirectory(root);
    const temporary = join(root, `${randomUUID()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, join(root, "config.json"));
}
