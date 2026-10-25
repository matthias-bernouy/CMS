import { join } from "node:path";
import { withRepositoryWriteLock } from "@bernouy/cms-repository/repository/filesystem";
import { normalizeRepositoryUrl } from "../../runtime/repository/connection";
import { readRepositoryConfig, saveRepositoryConfig } from "../../runtime/stack/repository/config";
import type { UlviaPaths } from "../../runtime/paths";

export function repositoryOptions(args: readonly string[], allowed: readonly string[]): Map<string, string> {
    const values = new Map<string, string>();
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index]!;
        const value = args[index + 1];
        if (!allowed.includes(key) || values.has(key) || !value || value.startsWith("--")) {
            throw new Error(`Invalid Repository option: ${key}`);
        }
        values.set(key, value);
    }
    return values;
}

export async function repositoryDeploymentCommand(
    args: readonly string[],
    paths: UlviaPaths,
    log: (message: string) => void,
): Promise<void> {
    const root = join(paths.data, "repository-service");
    const values = repositoryOptions(args, ["--port", "--public-url", "--tls", "--acme-email"]);
    await withRepositoryWriteLock(root, async () => {
        const config = await readRepositoryConfig(root);
        const rawPort = values.get("--port");
        if (rawPort !== undefined && !/^\d+$/u.test(rawPort)) {
            throw new Error("Repository port must be an integer between 1 and 65535");
        }
        config.port = rawPort === undefined ? config.port : Number(rawPort);
        const mode = values.get("--tls") ?? config.tls.mode;
        if (!["local", "external", "acme"].includes(mode)) {
            throw new Error("Repository TLS mode must be local, external or acme");
        }
        const email = values.get("--acme-email") ?? (config.tls.mode === "acme" ? config.tls.email : "");
        if (mode !== "acme" && values.has("--acme-email")) {
            throw new Error("--acme-email requires --tls acme");
        }
        config.tls = mode === "acme" ? { mode, email } : { mode: mode as "local" | "external" };
        config.publicUrl = values.has("--public-url")
            ? normalizeRepositoryUrl(values.get("--public-url")!)
            : mode === "local"
              ? `http://127.0.0.1:${config.port}`
              : config.publicUrl;
        await saveRepositoryConfig(root, config);
    });
    log(`Repository configuration saved: ${join(root, "config.json")}. Run repository start to apply it.`);
}
