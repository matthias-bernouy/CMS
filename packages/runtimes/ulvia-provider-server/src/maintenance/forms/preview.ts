import { migrationGrants } from "./grants";
import { closeMigrationDependencies } from "./dependencies";
import { formsMigrationRetirement } from "@bernouy/forms/migration/mongo";
import { verifyEvolution } from "@bernouy/ulvia-contracts/validation";
import { DEFAULT_RELEASE_LIMITS } from "@bernouy/ulvia-contracts";
import { admitProviderManifest } from "@bernouy/ulvia-providers";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { InMemoryProviderManifestCatalogue } from "@bernouy/repository/providers/catalogue";
import { planContractSelections } from "@bernouy/ulvia-providers/selections";
import type { ProviderInstallation } from "@bernouy/ulvia-providers/installations";
import type { SystemInstallationPlan } from "@bernouy/ulvia-provider";
import type { migrationStores } from "./stores";
import type { LoadedSystemArtifacts } from "../../runtime/instances/system/artifacts";
import type { StoredContractSelections } from "@bernouy/ulvia-providers/selections";

export async function previewSelection(
    stores: ReturnType<typeof migrationStores>,
    source: SystemInstallationPlan,
    target: SystemInstallationPlan,
    artifacts: LoadedSystemArtifacts,
    selected: StoredContractSelections,
    installation: ProviderInstallation,
) {
    const releases = new InMemoryReleaseCatalogue();
    const needed = new Map<string, { contractId: string; version: string }>();
    for (const pin of [...source.contracts, ...selected.plan.selections]) {
        needed.set(`${pin.contractId}@${pin.version}`, pin);
    }
    for (const pin of needed.values()) {
        let stored = await stores.releases.get(pin.contractId, pin.version);
        for (let depth = 0; stored; depth++) {
            if (depth > 16) {
                throw new Error("Migration contract lineage exceeds its bound");
            }
            const parent = stored.admission.release.extends;
            if (parent) {
                stored = await stores.releases.get(parent.contractId, parent.version);
                if (!stored) {
                    throw new Error("Migration source ancestor is missing");
                }
                needed.set(`${parent.contractId}@${parent.version}`, parent);
            } else {
                break;
            }
        }
    }
    const admissions = await Promise.all(
        [...needed.values()].map(async (pin) => {
            const row = await stores.releases.get(pin.contractId, pin.version);
            if (!row) {
                throw new Error("Migration source release disappeared");
            }
            return row.admission;
        }),
    );
    admissions.push(
        ...(await Promise.all(artifacts.contracts.map((contract) => admitContractRelease(contract.release)))),
    );
    const unique = new Map<string, (typeof admissions)[number]>();
    for (const admission of admissions) {
        const key = `${admission.release.contractId}@${admission.release.version}`;
        if (unique.has(key) && unique.get(key)!.digest !== admission.digest) {
            throw new Error("Migration catalogue coordinate changed");
        }
        unique.set(key, admission);
    }
    const restore = async (admission: (typeof admissions)[number], depth = 0): Promise<void> => {
        if (depth > 16) {
            throw new Error("Migration contract lineage exceeds its bound");
        }
        const parent = admission.release.extends;
        if (parent) {
            const ancestor = unique.get(`${parent.contractId}@${parent.version}`);
            if (!ancestor) {
                throw new Error("Migration source ancestor is missing");
            }
            await restore(ancestor, depth + 1);
        }
        // Preview reopens already verified immutable metadata; it does not republish missing asset bytes.
        await releases.restore(admission.canonicalJson, admission.digest, new Date(0).toISOString());
    };
    for (const admission of unique.values()) {
        await restore(admission);
    }
    const targetForms = artifacts.contracts.find((row) => row.release.contractId === "ulvia/cms.forms")!;
    const retirement = await formsMigrationRetirement(targetForms.release);
    // Validate the source-to-target lifecycle without weakening ordinary catalogue publication.
    const sourceHistory = (await releases.list("ulvia/cms.forms")).filter(
        (row) => row.admission.release.version !== targetForms.release.version,
    );
    const staged = [...sourceHistory];
    for (const admission of [retirement.legacy, retirement.bridge]) {
        if (!staged.some((row) => row.admission.digest === admission.digest)) {
            verifyEvolution(admission.release, staged, DEFAULT_RELEASE_LIMITS);
            staged.push({ admission, publishedAt: new Date(0).toISOString() });
        }
    }
    verifyEvolution(targetForms.release, staged, DEFAULT_RELEASE_LIMITS);
    const manifests = new InMemoryProviderManifestCatalogue(releases);
    const before = await stores.manifests.get(source.manifest.providerId, source.manifest.version);
    if (!before) {
        throw new Error("Migration source manifest disappeared");
    }
    await manifests.publish(before.admission);
    const targetManifest = await manifests.publish(await admitProviderManifest(artifacts.manifest, releases));
    const changed = {
        ...installation,
        approval: {
            ...installation.approval,
            manifestVersion: target.manifest.version,
            manifestDigest: targetManifest.admission.digest,
        },
    };
    const all = (await stores.installations.list("default")).map((row) =>
        row.installation.id === installation.id ? changed : row.installation,
    );
    const pins = selected.plan.selections.map((pin) => {
        if (pin.installationId !== installation.id) {
            return pin;
        }
        const replacement = target.contracts.find((next) => next.contractId === pin.contractId);
        if (!replacement) {
            throw new Error("Migration omits a selected native contract");
        }
        return { ...replacement, siteId: "default", installationId: installation.id };
    });
    // Newly introduced system dependencies become selected; existing foreign selections remain explicit.
    const oldFamilies = new Set(source.contracts.map((pin) => pin.contractId));
    for (const pin of target.contracts) {
        if (
            !oldFamilies.has(pin.contractId) &&
            !pins.some((value) => value.contractId === pin.contractId) &&
            pin.contractId !== "ulvia/cms.forms"
        ) {
            pins.push({ ...pin, siteId: "default", installationId: installation.id });
        }
    }
    await closeMigrationDependencies(pins, installation.id, artifacts, releases);
    const retainedManifests = {
        get: async (id: string, version: string) =>
            (await manifests.get(id, version)) ?? stores.manifests.get(id, version),
        findByDigest: async (digest: Parameters<typeof manifests.findByDigest>[0]) =>
            (await manifests.findByDigest(digest)) ?? stores.manifests.findByDigest(digest),
        list: async (id?: string) => {
            const merged = new Map(
                (await stores.manifests.list(id)).map((row) => [
                    `${row.admission.manifest.providerId}@${row.admission.manifest.version}`,
                    row,
                ]),
            );
            for (const row of await manifests.list(id)) {
                merged.set(`${row.admission.manifest.providerId}@${row.admission.manifest.version}`, row);
            }
            return [...merged.values()];
        },
    };
    const plan = await planContractSelections("default", pins, {
        releases,
        manifests: retainedManifests,
        installations: all,
    });
    const grants = migrationGrants(
        selected,
        targetForms.release,
        pins.some((pin) => pin.contractId === targetForms.release.contractId && pin.installationId === installation.id),
    );
    return { plan, releases, grants };
}
