import type { ProviderInstallationStore } from "repository/providers/installations/interfaces/ProviderInstallationStore";
import { CatalogueSelectionDependencies } from "repository/providers/selections/default-implementation/CatalogueSelectionDependencies";
import { graphFixture, siteId } from "../fixtures";

export async function captureFixture() {
    const fixture = await graphFixture();
    const calls = new Map<string, number>();
    const revisions = { release: 0, manifest: 0, installation: 0 };
    let installation = fixture.installation;
    function measured<T extends object>(target: T, kind: "release" | "manifest"): T {
        return new Proxy(target, {
            get(source, property) {
                if (property === "revision") {
                    return async () => {
                        count(`${kind}.revision`);
                        return `${kind}:${revisions[kind]}`;
                    };
                }
                const value = Reflect.get(source, property);
                if (typeof value !== "function" || typeof property !== "string") {
                    return value;
                }
                return async (...args: unknown[]) => {
                    count(`${kind}.${property}`);
                    const result = await value.apply(source, args);
                    if (["publish", "setYank", "setDeprecation"].includes(property)) {
                        revisions[kind] += 1;
                    }
                    return result;
                };
            },
        });
    }
    function count(key: string) {
        calls.set(key, (calls.get(key) ?? 0) + 1);
    }
    const releases = measured(fixture.releases, "release");
    const manifests = measured(fixture.manifests, "manifest");
    const installationStore = {
        list: async (site: string) => {
            count("installation.list");
            return site === siteId ? [{ installation, revision: revisions.installation + 1 }] : [];
        },
        selectionRevision: async (site: string) => {
            count("installation.revision");
            return `${site}:${revisions.installation}`;
        },
    } as unknown as ProviderInstallationStore;
    const dependencies = new CatalogueSelectionDependencies(releases, manifests, installationStore);
    return {
        ...fixture,
        unversionedReleases: fixture.releases,
        releases,
        manifests,
        installationStore,
        dependencies,
        calls,
        installationStatus(status: "enabled" | "disabled" | "revoked") {
            installation = { ...installation, status };
            revisions.installation += 1;
        },
    };
}
