import type { OfficialInstanceProfile } from "@bernouy/ulvia-provider";
import { initialPages } from "./initialPages";
import { repositoryPages } from "./repositoryPages";

export type ProfileDefinition = Readonly<{
    id: string;
    version: string;
    upgradeFromVersions: readonly string[];
    manifest: Readonly<{ providerId: string; version: string }>;
    repository: boolean;
    collections: readonly Readonly<{ publisherId: string; collectionId: string; version: string }>[];
    initialPages: OfficialInstanceProfile["initialPages"];
}>;

// Exact v1 starters remain available for unfinished transitions and explicit selections.
const EXAMPLE_PROFILE: ProfileDefinition = Object.freeze({
    id: "ulvia",
    version: "1.0.0",
    upgradeFromVersions: Object.freeze([]),
    manifest: Object.freeze({ providerId: "ulvia/primary-provider", version: "1.0.0" }),
    repository: false,
    collections: Object.freeze([
        Object.freeze({ publisherId: "ulvia", collectionId: "ulvia/mossa", version: "1.0.0" }),
    ]),
    initialPages,
});

const REPOSITORY_EXAMPLE_PROFILE: ProfileDefinition = Object.freeze({
    ...EXAMPLE_PROFILE,
    id: "repository",
    repository: true,
    collections: Object.freeze([
        ...EXAMPLE_PROFILE.collections,
        Object.freeze({ publisherId: "ulvia", collectionId: "ulvia/repository", version: "1.0.0" }),
    ]),
    initialPages: Object.freeze([...initialPages.filter(({ id }) => id !== "login"), ...repositoryPages]),
});

/** Core-only initialization; no collection, Page or public catalogue publication. */
const EMPTY_PROFILE: ProfileDefinition = Object.freeze({
    ...EXAMPLE_PROFILE,
    version: "1.1.0",
    collections: Object.freeze([]),
    initialPages: Object.freeze([]),
});

const EMPTY_REPOSITORY_PROFILE: ProfileDefinition = Object.freeze({
    ...EMPTY_PROFILE,
    id: "repository",
    repository: true,
});

/** System initialization capabilities are selected explicitly by the new core profile. */
const SETUP_PROFILE: ProfileDefinition = Object.freeze({
    ...EMPTY_PROFILE,
    version: "1.2.0",
    manifest: Object.freeze({ providerId: "ulvia/primary-provider", version: "1.1.0" }),
});
const SETUP_REPOSITORY_PROFILE: ProfileDefinition = Object.freeze({
    ...SETUP_PROFILE,
    id: "repository",
    repository: true,
});
export const CURRENT_PROFILE: ProfileDefinition = Object.freeze({
    ...SETUP_PROFILE,
    version: "1.3.0",
    manifest: Object.freeze({ providerId: "ulvia/primary-provider", version: "1.2.0" }),
});
const REPOSITORY_PROFILE: ProfileDefinition = Object.freeze({ ...CURRENT_PROFILE, id: "repository", repository: true });
export const CURRENT_PROFILES = Object.freeze([CURRENT_PROFILE, REPOSITORY_PROFILE]);
export const SUPPORTED_PROFILES = Object.freeze([
    EXAMPLE_PROFILE,
    REPOSITORY_EXAMPLE_PROFILE,
    EMPTY_PROFILE,
    EMPTY_REPOSITORY_PROFILE,
    SETUP_PROFILE,
    SETUP_REPOSITORY_PROFILE,
    ...CURRENT_PROFILES,
]);
