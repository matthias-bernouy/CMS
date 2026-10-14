import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";

const PROFILE_1_0_0 = Object.freeze({
    id: "ulvia.official",
    version: "1.0.0",
    manifest: {
        providerId: "ulvia.official",
        version: "0.3.0",
        digest: "sha256:d90ea747715dfd91ab59f08fd0f52dd56346db6a0c4a15f5cdfe7afac3e97f4a",
    },
    contracts: [
        ["ulvia.cms.access", "1.0.0", "sha256:c12027a8e15cc47633ff72b32eff0ac19b6b3da870c33d2270f51c9ec4c302e1"],
        ["ulvia.cms.collections", "1.0.0", "sha256:907892d7931e8f23f848258ac66c8e6331d49ab41a5fe68e7416b421413e4b16"],
        ["ulvia.cms.files", "1.0.0", "sha256:fa9e6aac42c7c466a44ff10f39e77ae6941508bf105d87dc54dbd6c7a6d57fcc"],
        ["ulvia.cms.jobs", "1.0.0", "sha256:27a89ae82a8417ce80df81fffe5e98355bbcc6c1d0cb3321ac3881c3b95d519a"],
        ["ulvia.cms.localization", "1.0.0", "sha256:adc3e47e76bbeecbd1399b2fd5fced9e24ef6cc9342a64fe2eb614b92a3e8ab9"],
        ["ulvia.cms.pages", "1.0.0", "sha256:5861aa84cd305cc2a634b28f0649b3b20793e5ce7d4777efe4fdaa91ca1c1248"],
        ["ulvia.cms.providers", "1.0.0", "sha256:e8f3a7c7a88515aa4f26093895f66fbc9559564aed1293df8b652759f234449b"],
        ["ulvia.cms.theme", "1.0.0", "sha256:7fd692a7b9293db9da35c08c1906cec021bcd120b4165500b76fbf49276713d4"],
    ].map(([contractId, version, digest]) => ({ contractId: contractId!, version: version!, digest: digest! })),
    collection: {
        publisherId: "ulvia.official",
        collectionId: "ulvia-official",
        version: "1.0.0",
        digest: "sha256:9d433fbca1e3ab94de657ede66b5955ea3c51bf9feeb28194ef131125633fee2",
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
