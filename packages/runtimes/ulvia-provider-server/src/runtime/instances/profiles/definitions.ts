export type ProfileDefinition = Readonly<{
    id: string;
    version: string;
    upgradeFromVersions: readonly string[];
    manifest: Readonly<{ providerId: string; version: string }>;
    collections: readonly Readonly<{ publisherId: string; collectionId: string; version: string }>[];
}>;

export const CURRENT_PROFILE: ProfileDefinition = Object.freeze({
    id: "ulvia",
    version: "1.0.0",
    upgradeFromVersions: Object.freeze([]),
    manifest: Object.freeze({ providerId: "ulvia/primary-provider", version: "1.0.0" }),
    collections: Object.freeze([
        Object.freeze({ publisherId: "ulvia", collectionId: "ulvia/mossa", version: "1.0.0" }),
    ]),
});

export const REPOSITORY_PROFILE: ProfileDefinition = Object.freeze({
    ...CURRENT_PROFILE,
    id: "repository",
    version: "1.0.0",
    collections: Object.freeze([
        ...CURRENT_PROFILE.collections,
        Object.freeze({ publisherId: "ulvia", collectionId: "ulvia/repository", version: "1.0.0" }),
    ]),
});

export const SUPPORTED_PROFILES = Object.freeze([CURRENT_PROFILE, REPOSITORY_PROFILE]);
