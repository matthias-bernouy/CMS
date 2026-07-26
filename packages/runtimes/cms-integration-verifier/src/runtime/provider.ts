import { pathToFileURL } from "node:url";
import type { DisposableVerificationDatabaseProvider } from "../supervisor";

export type DisposableVerificationDatabaseProviderFactory = () =>
    | DisposableVerificationDatabaseProvider
    | Promise<DisposableVerificationDatabaseProvider>;

export async function loadDisposableVerificationDatabaseProvider(
    absoluteModulePath: string,
): Promise<DisposableVerificationDatabaseProvider> {
    let module: unknown;
    try {
        module = await import(pathToFileURL(absoluteModulePath).href);
    } catch {
        throw new Error("Disposable verification database provider module could not be loaded");
    }
    const factory = (module as { createDisposableVerificationDatabaseProvider?: unknown })
        .createDisposableVerificationDatabaseProvider;
    if (typeof factory !== "function") {
        throw new Error("Disposable verification database provider module has no factory");
    }
    const provider = await (factory as DisposableVerificationDatabaseProviderFactory)();
    if (!provider || typeof provider.acquire !== "function") {
        throw new Error("Disposable verification database provider is invalid");
    }
    return provider;
}
