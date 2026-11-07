import { createLocalUser } from "@bernouy/cms-auth/management";
import { seedOfficialPages } from "./profiles/seedPages";
import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";
import type {
    OfficialInstanceProfile,
    ProviderInstanceAdministrator,
    ProviderInstanceTransitionExecution,
} from "@bernouy/ulvia-provider";
import type { InstanceComposition } from "./composition/ProviderInstanceHost";

const SITE_ID = "default";

export async function installOfficialCollections(
    composition: InstanceComposition,
    source: CollectionRepositorySource,
    profile: OfficialInstanceProfile,
    execution: ProviderInstanceTransitionExecution,
): Promise<void> {
    execution.throwIfLeaseLost();
    if (!profile.collections.length && !profile.initialPages.length) {
        return;
    }
    const entries = profile.collections.length ? await source.list() : [];
    const targets = [];
    for (const pin of profile.collections) {
        const entry = entries.find(
            (candidate) =>
                candidate.publisherId === pin.publisherId &&
                candidate.collectionId === pin.collectionId &&
                candidate.version === pin.version &&
                candidate.digest === pin.digest,
        );
        if (!entry) {
            throw new Error(`Exact official collection is unavailable: ${pin.collectionId}@${pin.version}`);
        }
        const bundle = await source.get(entry);
        execution.throwIfLeaseLost();
        const imported = await composition.stores.collections.importRelease(bundle.release, bundle.assets);
        execution.throwIfLeaseLost();
        if (imported.digest !== pin.digest) {
            throw new Error(`Official collection digest mismatch: ${pin.collectionId}@${pin.version}`);
        }
        targets.push({ collectionId: pin.collectionId, digest: imported.digest, repositoryId: source.id });
    }
    let snapshot = await composition.stores.collections.snapshot(SITE_ID);
    execution.throwIfLeaseLost();
    const upgrades = targets.filter((target) =>
        snapshot.collections.some(
            (installed) => installed.collectionId === target.collectionId && installed.digest !== target.digest,
        ),
    );
    if (upgrades.length) {
        const plan = await composition.stores.collectionUpgrades.plan(SITE_ID, upgrades);
        await composition.stores.collectionUpgrades.apply(SITE_ID, upgrades, plan.planDigest);
        execution.throwIfLeaseLost();
        snapshot = await composition.stores.collections.snapshot(SITE_ID);
    }
    const additions = targets.filter(
        (target) => !snapshot.collections.some((installed) => installed.collectionId === target.collectionId),
    );
    if (additions.length) {
        await composition.stores.collections.installMany(SITE_ID, additions, snapshot.revision);
        execution.throwIfLeaseLost();
    }
    await seedOfficialPages(composition, profile, execution);
}

export async function initializeOfficialAdministrator(
    composition: InstanceComposition,
    administrator: ProviderInstanceAdministrator,
    execution: ProviderInstanceTransitionExecution,
): Promise<void> {
    execution.throwIfLeaseLost();
    const stores = composition.stores;
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
