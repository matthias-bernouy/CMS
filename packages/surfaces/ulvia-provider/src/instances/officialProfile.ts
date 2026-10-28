import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";

export type OfficialInstanceProfile = Readonly<{
    id: string;
    version: string;
    upgradeFromVersions: readonly string[];
    manifest: Readonly<{ providerId: string; version: string; digest: string }>;
    contracts: readonly Readonly<{ contractId: string; version: string; digest: string }>[];
    initialPages: readonly Readonly<{
        id: string;
        path: string;
        title: string;
        description: string;
        exampleId: string;
    }>[];
    collection: Readonly<{
        publisherId: string;
        collectionId: string;
        version: string;
        digest: string;
    }>;
}>;

export class OfficialInstanceProfiles {
    readonly defaultProfile: OfficialInstanceProfile;
    readonly profiles: readonly OfficialInstanceProfile[];
    readonly #byCoordinate = new Map<string, OfficialInstanceProfile>();

    constructor(profiles: readonly OfficialInstanceProfile[], defaultProfile: OfficialInstanceProfile = profiles[0]!) {
        if (profiles.length === 0 || !profiles.includes(defaultProfile)) {
            throw new TypeError("Official instance profiles require one declared default");
        }
        for (const profile of profiles) {
            const key = coordinate(profile.id, profile.version);
            if (this.#byCoordinate.has(key)) {
                throw new TypeError(`Duplicate official instance profile: ${profile.id}@${profile.version}`);
            }
            this.#byCoordinate.set(key, profile);
        }
        this.profiles = Object.freeze([...profiles]);
        this.defaultProfile = defaultProfile;
    }

    resolve(id: string, version: string): OfficialInstanceProfile | null {
        return this.#byCoordinate.get(coordinate(id, version)) ?? null;
    }

    canUpgrade(source: OfficialInstanceProfile, target: OfficialInstanceProfile): boolean {
        return canUpgradeOfficialInstanceProfile(source, target);
    }
}

export function canUpgradeOfficialInstanceProfile(
    source: OfficialInstanceProfile,
    target: OfficialInstanceProfile,
): boolean {
    return (
        source.id === target.id &&
        compareSemVer(target.version, source.version) > 0 &&
        target.upgradeFromVersions.includes(source.version)
    );
}

function coordinate(id: string, version: string): string {
    return `${id}\0${version}`;
}
