import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";

const PROFILE_1_0_0 = Object.freeze({
    id: "ulvia.official",
    version: "1.0.0",
    manifest: {
        providerId: "ulvia.official",
        version: "0.3.0",
        digest: "sha256:86f40a4b690ff94d77d0c8dca9aca0cf885925cdca38af92d86ef32f2b58afbb",
    },
    contracts: [
        ["ulvia.cms.access", "1.0.0", "sha256:c12027a8e15cc47633ff72b32eff0ac19b6b3da870c33d2270f51c9ec4c302e1"],
        ["ulvia.cms.collections", "1.0.0", "sha256:2ba95ce154f6823b00243efce7e15916541fe4c489f7c6f79b055cf03bdb7ce1"],
        ["ulvia.cms.files", "1.0.0", "sha256:fa9e6aac42c7c466a44ff10f39e77ae6941508bf105d87dc54dbd6c7a6d57fcc"],
        ["ulvia.cms.jobs", "1.0.0", "sha256:27a89ae82a8417ce80df81fffe5e98355bbcc6c1d0cb3321ac3881c3b95d519a"],
        ["ulvia.cms.localization", "1.0.0", "sha256:e588415389e6a61418de058d230e7aea0ef1153329686049cff4cc3c68897347"],
        ["ulvia.cms.pages", "1.0.0", "sha256:5861aa84cd305cc2a634b28f0649b3b20793e5ce7d4777efe4fdaa91ca1c1248"],
        ["ulvia.cms.providers", "1.0.0", "sha256:e8f3a7c7a88515aa4f26093895f66fbc9559564aed1293df8b652759f234449b"],
        ["ulvia.cms.theme", "1.0.0", "sha256:84ab33385113a421c545d4d74416e0e22751a42183d51caa759d62a935ba6d0b"],
    ].map(([contractId, version, digest]) => ({ contractId: contractId!, version: version!, digest: digest! })),
    collection: {
        publisherId: "ulvia.official",
        collectionId: "ulvia-official",
        version: "1.0.0",
        digest: "sha256:3dbf13b932556520bddbaa9d4a83d54d0130ca9ae229dff6d52e842dcce96a6d",
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
