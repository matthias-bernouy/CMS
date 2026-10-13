import { createLocalUser } from "@bernouy/cms-auth/management";
import type { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import type {
    OfficialInstanceProfile,
    ProviderInstanceAdministrator,
    ProviderInstanceTransitionExecution,
} from "@bernouy/ulvia-provider";
import type { InstanceComposition } from "./ProviderInstanceHost";

const SITE_ID = "default";

export async function installOfficialCollection(
    composition: InstanceComposition,
    source: HttpCollectionRepository,
    profile: OfficialInstanceProfile,
    execution: ProviderInstanceTransitionExecution,
): Promise<void> {
    execution.throwIfLeaseLost();
    const entry = (await source.list()).find(
        (candidate) =>
            candidate.publisherId === profile.collection.publisherId &&
            candidate.collectionId === profile.collection.collectionId &&
            candidate.version === profile.collection.version &&
            candidate.digest === profile.collection.digest,
    );
    execution.throwIfLeaseLost();
    if (!entry) {
        throw new Error("Exact official administration collection is unavailable");
    }
    const bundle = await source.get(entry);
    execution.throwIfLeaseLost();
    const imported = await composition.stores.collections.importRelease(bundle.release, bundle.assets);
    execution.throwIfLeaseLost();
    if (imported.digest !== profile.collection.digest) {
        throw new Error("Official administration collection digest mismatch");
    }
    const snapshot = await composition.stores.collections.snapshot(SITE_ID);
    execution.throwIfLeaseLost();
    const installed = snapshot.collections.find(({ collectionId }) => collectionId === entry.collectionId);
    if (installed?.digest === imported.digest) {
        return;
    }
    const method = installed ? "upgrade" : "install";
    await composition.stores.collections[method](SITE_ID, imported.digest, snapshot.revision, source.id);
    execution.throwIfLeaseLost();
}

export async function initializeOfficialAdministrator(
    composition: InstanceComposition,
    administrator: ProviderInstanceAdministrator,
    execution: ProviderInstanceTransitionExecution,
): Promise<void> {
    execution.throwIfLeaseLost();
    const stores = composition.stores;
    if (!(await stores.identityProviders.get("local"))) {
        execution.throwIfLeaseLost();
        await stores.identityProviders.create({
            id: "local",
            kind: "local",
            enabled: true,
            displayName: "Email & password",
        });
    }
    execution.throwIfLeaseLost();
    const existing = await stores.credentials.getByEmail(administrator.email);
    execution.throwIfLeaseLost();
    const subjectId = existing
        ? `local:${existing.sub}`
        : (
              await createLocalUser(
                  { credentials: stores.credentials, users: stores.users },
                  { ...administrator, emailVerified: true },
              )
          ).sub;
    execution.throwIfLeaseLost();
    await composition.administrators.set(subjectId, true);
    execution.throwIfLeaseLost();
}
