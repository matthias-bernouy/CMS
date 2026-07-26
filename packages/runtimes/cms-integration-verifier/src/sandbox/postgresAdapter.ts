import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import type { PostgresPlatformVerificationAdapter } from "./postgres";

export type PostgresPlatformVerificationAdapterFactory = () =>
    | PostgresPlatformVerificationAdapter
    | Promise<PostgresPlatformVerificationAdapter>;

export async function loadPostgresPlatformVerificationAdapter(
    modulePath: string,
): Promise<PostgresPlatformVerificationAdapter> {
    if (!isAbsolute(modulePath)) {
        throw new TypeError("PostgreSQL verification adapter path must be absolute");
    }
    let module: unknown;
    try {
        module = await import(pathToFileURL(modulePath).href);
    } catch {
        throw new Error("PostgreSQL verification adapter module could not be loaded");
    }
    const factory = (module as { createPostgresPlatformVerificationAdapter?: unknown })
        .createPostgresPlatformVerificationAdapter;
    if (typeof factory !== "function") {
        throw new Error("PostgreSQL verification adapter module has no factory");
    }
    const adapter = await (factory as PostgresPlatformVerificationAdapterFactory)();
    if (!adapter || typeof adapter.verifyPackage !== "function" || typeof adapter.environmentVersions !== "function") {
        throw new Error("PostgreSQL verification adapter is invalid");
    }
    return adapter;
}
