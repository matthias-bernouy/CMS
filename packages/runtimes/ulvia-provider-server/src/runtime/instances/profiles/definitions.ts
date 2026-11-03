export type ProfileDefinition = Readonly<{
    id: string;
    version: string;
    upgradeFromVersions: readonly string[];
    manifest: Readonly<{ providerId: string; version: string }>;
    collection: Readonly<{ publisherId: string; collectionId: string; version: string }>;
}>;

export const CURRENT_PROFILE: ProfileDefinition = Object.freeze({
    id: "ulvia.official",
    version: "1.1.0",
    upgradeFromVersions: Object.freeze([]),
    manifest: Object.freeze({ providerId: "ulvia.official", version: "1.0.1" }),
    collection: Object.freeze({ publisherId: "ulvia.official", collectionId: "ulvia-official", version: "1.0.0" }),
});

// Existing instances retain their exact profile when its immutable artifacts remain available.
const previousProfile: ProfileDefinition = Object.freeze({
    id: "ulvia.official",
    version: "1.0.0",
    upgradeFromVersions: Object.freeze([]),
    manifest: Object.freeze({ providerId: "ulvia.official", version: "1.0.0" }),
    collection: Object.freeze({ publisherId: "ulvia.official", collectionId: "ulvia-official", version: "1.0.0" }),
});

export const SUPPORTED_PROFILES = Object.freeze([previousProfile, CURRENT_PROFILE]);
