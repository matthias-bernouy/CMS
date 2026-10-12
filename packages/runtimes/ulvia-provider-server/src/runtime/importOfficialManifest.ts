import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import type { ProviderManagement } from "@bernouy/cms-repository/providers/management";
import type { ProviderRepositorySource } from "@bernouy/cms-repository/providers/sources";

const PROVIDER_ID = "ulvia.official";

export async function importOfficialManifest(
    management: Pick<ProviderManagement, "importManifest">,
    source: ProviderRepositorySource,
): Promise<string> {
    const entry = (await source.list("provider-manifest"))
        .filter(({ publisherId, id }) => publisherId === PROVIDER_ID && id === PROVIDER_ID)
        .sort((left, right) => compareSemVer(left.version, right.version))
        .at(-1);
    if (!entry) {
        throw new Error("The official provider manifest is unavailable from the bootstrap repository");
    }
    await management.importManifest(await source.get(entry));
    return entry.version;
}
