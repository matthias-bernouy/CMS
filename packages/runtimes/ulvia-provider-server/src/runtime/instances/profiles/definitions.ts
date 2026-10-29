export type ProfileDefinition = Readonly<{
    id: string;
    version: string;
    upgradeFromVersions: readonly string[];
    manifest: Readonly<{ providerId: string; version: string }>;
    collection: Readonly<{ publisherId: string; collectionId: string; version: string }>;
}>;

const PREVIOUS_PROFILE: ProfileDefinition = Object.freeze({
    id: "ulvia.official",
    version: "1.0.0",
    upgradeFromVersions: Object.freeze([]),
    manifest: Object.freeze({ providerId: "ulvia.official", version: "0.1.0" }),
    collection: Object.freeze({ publisherId: "ulvia.official", collectionId: "ulvia-official", version: "1.0.0" }),
});

const OBSERVABILITY_PROFILE: ProfileDefinition = Object.freeze({
    id: "ulvia.official",
    version: "1.1.0",
    upgradeFromVersions: Object.freeze(["1.0.0"]),
    manifest: Object.freeze({ providerId: "ulvia.official", version: "0.2.0" }),
    collection: Object.freeze({ publisherId: "ulvia.official", collectionId: "ulvia-official", version: "1.0.0" }),
});

const PREPARED_PROFILE: ProfileDefinition = Object.freeze({
    id: "ulvia.official",
    version: "1.2.0",
    upgradeFromVersions: Object.freeze(["1.0.0", "1.1.0"]),
    manifest: Object.freeze({ providerId: "ulvia.official", version: "0.3.0" }),
    collection: Object.freeze({ publisherId: "ulvia.official", collectionId: "ulvia-official", version: "1.0.0" }),
});

export const CURRENT_PROFILE: ProfileDefinition = Object.freeze({
    id: "ulvia.official",
    version: "1.3.0",
    upgradeFromVersions: Object.freeze(["1.0.0", "1.1.0", "1.2.0"]),
    manifest: Object.freeze({ providerId: "ulvia.official", version: "0.4.0" }),
    collection: Object.freeze({ publisherId: "ulvia.official", collectionId: "ulvia-official", version: "1.1.0" }),
});

// Retain exact published profiles while existing instances and transitions still reference them.
export const SUPPORTED_PROFILES = Object.freeze([
    PREVIOUS_PROFILE,
    OBSERVABILITY_PROFILE,
    PREPARED_PROFILE,
    CURRENT_PROFILE,
]);
