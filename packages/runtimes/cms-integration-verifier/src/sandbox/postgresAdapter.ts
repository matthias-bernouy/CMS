import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import type { PostgresInstallAndReapplyAdapter } from "./postgres";

export type PostgresInstallAndReapplyAdapterFactory = () =>
    | PostgresInstallAndReapplyAdapter
    | Promise<PostgresInstallAndReapplyAdapter>;

export async function loadPostgresInstallAndReapplyAdapter(
    modulePath: string,
): Promise<PostgresInstallAndReapplyAdapter> {
    if (!isAbsolute(modulePath)) {
        throw new TypeError("PostgreSQL verification adapter path must be absolute");
    }
    let module: unknown;
    try {
        module = await import(pathToFileURL(modulePath).href);
    } catch {
        throw new Error("PostgreSQL verification adapter module could not be loaded");
    }
    const factory = (module as { createPostgresInstallAndReapplyAdapter?: unknown })
        .createPostgresInstallAndReapplyAdapter;
    if (typeof factory !== "function") {
        throw new Error("PostgreSQL verification adapter module has no factory");
    }
    const adapter = await (factory as PostgresInstallAndReapplyAdapterFactory)();
    if (
        !adapter ||
        typeof adapter.applyPackageSql !== "function" ||
        typeof adapter.environmentVersions !== "function"
    ) {
        throw new Error("PostgreSQL verification adapter is invalid");
    }
    return adapter;
}
