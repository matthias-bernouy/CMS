import { compareSemVer } from "../../../exports/contracts/compatibility";
import { admitCollectionRelease } from "../../core/admission/admitCollectionRelease";
import { parseCollectionTextOverrides } from "../../core/texts/parseCollectionTexts";
import type { CollectionStorage, InstalledCollection } from "../interfaces/store";

export class CollectionStore {
    constructor(private readonly storage: CollectionStorage) {}

    async importRelease(input: unknown) {
        const artifact = await admitCollectionRelease(input);
        const release = artifact.release;
        if (release.assets.length || release.blocs.some((bloc) => bloc.requires.length)) {
            throw Object.assign(
                new Error(
                    "Installation supports composition and shadow components without assets or capability requirements",
                ),
                { status: 422 },
            );
        }
        await this.storage.putRelease({ digest: artifact.digest, release });
        return { digest: artifact.digest, release };
    }

    async snapshot(siteId: string): Promise<{ revision: number; collections: InstalledCollection[] }> {
        const state = await this.storage.readSite(siteId);
        const collections = await Promise.all(
            state.installations.map(async (installation) => {
                const artifact = await this.storage.getRelease(installation.digest);
                if (!artifact || artifact.release.collectionId !== installation.collectionId) {
                    throw new Error("Installed collection artifact is missing or inconsistent");
                }
                return { ...installation, release: artifact.release };
            }),
        );
        return structuredClone({ revision: state.revision, collections });
    }

    async install(siteId: string, digest: string, expectedRevision: number, repositoryId?: string) {
        const artifact = await this.storage.getRelease(digest);
        if (!artifact) {
            throw Object.assign(new Error("Unknown collection release"), { status: 404 });
        }
        const state = await this.storage.readSite(siteId);
        if (state.installations.some((item) => item.collectionId === artifact.release.collectionId)) {
            throw Object.assign(new Error("Collection is already installed; upgrades require a separate workflow"), {
                status: 409,
            });
        }
        const next = {
            revision: expectedRevision + 1,
            installations: [
                ...state.installations,
                {
                    collectionId: artifact.release.collectionId,
                    digest,
                    ...(repositoryId ? { repositoryId } : {}),
                    configuration: structuredClone(artifact.release.configuration?.defaults ?? {}),
                    textOverrides: {},
                },
            ],
        };
        await this.write(siteId, state.revision, expectedRevision, next);
        return this.snapshot(siteId);
    }

    async upgrade(siteId: string, digest: string, expectedRevision: number, repositoryId: string) {
        const artifact = await this.storage.getRelease(digest);
        if (!artifact) {
            throw Object.assign(new Error("Unknown collection release"), { status: 404 });
        }
        const state = await this.storage.readSite(siteId);
        const previous = state.installations.find((item) => item.collectionId === artifact.release.collectionId);
        if (!previous) {
            throw Object.assign(new Error("Collection is not installed"), { status: 404 });
        }
        const old = await this.storage.getRelease(previous.digest);
        if (
            !old ||
            old.release.publisherId !== artifact.release.publisherId ||
            compareSemVer(artifact.release.version, old.release.version) <= 0
        ) {
            throw Object.assign(new Error("Upgrade requires a newer release from the same publisher"), { status: 409 });
        }
        if (
            old.release.blocs.some(
                (bloc) => !artifact.release.blocs.some((next) => next.id === bloc.id && next.kind === bloc.kind),
            ) ||
            (old.release.texts ?? []).some(
                (text) => !(artifact.release.texts ?? []).some((next) => next.id === text.id),
            ) ||
            JSON.stringify(old.release.configuration) !== JSON.stringify(artifact.release.configuration)
        ) {
            throw Object.assign(new Error("Upgrade removes existing resources or changes configuration"), {
                status: 409,
            });
        }
        const next = {
            revision: expectedRevision + 1,
            installations: state.installations.map((item) =>
                item === previous ? { ...item, digest, repositoryId } : item,
            ),
        };
        await this.write(siteId, state.revision, expectedRevision, next);
        return this.snapshot(siteId);
    }

    async saveTexts(siteId: string, collectionId: string, expectedRevision: number, overrides: unknown) {
        const state = await this.storage.readSite(siteId);
        const installation = state.installations.find((item) => item.collectionId === collectionId);
        if (!installation) {
            throw Object.assign(new Error("Collection is not installed"), { status: 404 });
        }
        const artifact = await this.storage.getRelease(installation.digest);
        if (!artifact) {
            throw new Error("Missing release");
        }
        if (JSON.stringify(overrides)?.length > 1024 * 1024) {
            throw new TypeError("Text overrides exceed their aggregate bound");
        }
        const textOverrides = parseCollectionTextOverrides(overrides, artifact.release.texts ?? []);
        const next = {
            revision: expectedRevision + 1,
            installations: state.installations.map((item) =>
                item.collectionId === collectionId ? { ...item, textOverrides } : item,
            ),
        };
        await this.write(siteId, state.revision, expectedRevision, next);
        return this.snapshot(siteId);
    }

    private async write(
        siteId: string,
        actual: number,
        expected: number,
        next: Parameters<CollectionStorage["compareAndSet"]>[2],
    ) {
        if (
            !Number.isSafeInteger(expected) ||
            expected < 0 ||
            actual !== expected ||
            !(await this.storage.compareAndSet(siteId, expected, next))
        ) {
            throw Object.assign(new Error("Collection state changed; reload before saving"), { status: 409 });
        }
    }
}
