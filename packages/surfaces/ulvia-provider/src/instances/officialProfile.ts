import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";

const PROFILE_1_0_0 = Object.freeze({
    id: "ulvia.official",
    version: "1.0.0",
    manifest: {
        providerId: "ulvia.official",
        version: "0.3.0",
        digest: "sha256:a3a17f47e46a4cdc0a30aac5647d244ca3324429cc5626a31dd7a2963ad3b423",
    },
    contracts: [
        ["ulvia.cms.access", "1.0.0", "sha256:c42172edc03e7ef9cc8af7012cde2448b6655481100d5891f37641ae75371491"],
        ["ulvia.cms.collections", "1.0.0", "sha256:dfe1b858443a8155e495cf0e8993051b379f1f11f90a6d2c201bf5f59e934e8f"],
        ["ulvia.cms.files", "1.0.0", "sha256:52bd2d78f3d399e373357abcef47eeb04d4093024444369817f9d915f2453f08"],
        ["ulvia.cms.jobs", "1.0.0", "sha256:716b2e09685380389ec5fe6ac2a8485d72b8a9ca5a72396320095a08e022d51a"],
        ["ulvia.cms.localization", "1.0.0", "sha256:7010c5c41387b23cfd0e2874aa80f900548cea32c7502d0437467a3a69a5bcb7"],
        ["ulvia.cms.pages", "1.0.0", "sha256:fa13c10a11bdada047e9dbaf9f662c1897ada4881fe8419b6c0f694bc1bfb000"],
        ["ulvia.cms.providers", "1.0.0", "sha256:ac413f25b024b6168073bd5af760ed81cbd7f906a9b927740e32b20c312aacd0"],
        ["ulvia.cms.theme", "1.0.0", "sha256:bb08513329b603bb08f7a5a06a18bdbb4a9b0a2cdb6d722a46b160d9acd7179d"],
    ].map(([contractId, version, digest]) => ({ contractId: contractId!, version: version!, digest: digest! })),
    collection: {
        publisherId: "ulvia.official",
        collectionId: "ulvia-official",
        version: "1.0.0",
        digest: "sha256:1add7376fba6cd762574fb00f44145feb1452dbc0c3739e07327df72aeed58ae",
    },
});

export type OfficialInstanceProfile = Readonly<{
    id: string;
    version: string;
    upgradeFromVersions: readonly string[];
    manifest: Readonly<{ providerId: string; version: string; digest: string }>;
    contracts: readonly Readonly<{ contractId: string; version: string; digest: string }>[];
    collection: Readonly<{
        publisherId: string;
        collectionId: string;
        version: string;
        digest: string;
    }>;
}>;

const PROFILE_1_0_0_WITH_TRANSITIONS: OfficialInstanceProfile = Object.freeze({
    ...PROFILE_1_0_0,
    upgradeFromVersions: [],
});

export const SUPPORTED_INSTANCE_PROFILES = Object.freeze([PROFILE_1_0_0_WITH_TRANSITIONS]);

export const OFFICIAL_INSTANCE_PROFILE = PROFILE_1_0_0_WITH_TRANSITIONS;

export function resolveOfficialInstanceProfile(id: string, version: string): OfficialInstanceProfile | null {
    return SUPPORTED_INSTANCE_PROFILES.find((profile) => profile.id === id && profile.version === version) ?? null;
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

export const SYSTEM_CONTRACT_IDS = Object.freeze(PROFILE_1_0_0.contracts.map(({ contractId }) => contractId));
