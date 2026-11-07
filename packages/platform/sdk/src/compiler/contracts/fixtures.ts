import { sha256Digest, snapshotBinary } from "@bernouy/binary-media";
import type { ContractBundleAsset, ContractFixtureAssetDefinition } from "@bernouy/ulvia-contracts";
import { DEFAULT_RELEASE_LIMITS } from "@bernouy/ulvia-contracts";
import type { ContractFixtureSource } from "ulvia-sdk/interfaces/contracts";
import { SDK_BUILD_LIMITS } from "ulvia-sdk/compiler/limits";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

export function snapshotFixtures(fixtures: readonly ContractFixtureSource[] = []) {
    if (fixtures.length > DEFAULT_RELEASE_LIMITS.maxFixtureAssets) {
        throw new SdkDefinitionError("Too many mock fixtures", "$.fixtures");
    }
    let total = 0;
    return fixtures.map(({ id, mediaType, bytes }) => {
        const snapshot = snapshotBinary(bytes);
        total += snapshot.size;
        if (snapshot.size > SDK_BUILD_LIMITS.fixtureBytes || total > SDK_BUILD_LIMITS.totalFixtureBytes) {
            throw new SdkDefinitionError("Mock fixture exceeds the build byte budget", "$.fixtures");
        }
        return { id, mediaType, bytes: snapshot };
    });
}

export async function compileFixtures(fixtures: ReturnType<typeof snapshotFixtures>): Promise<{
    readonly metadata: readonly ContractFixtureAssetDefinition[];
    readonly assets: readonly ContractBundleAsset[];
}> {
    const metadata: ContractFixtureAssetDefinition[] = [];
    const assets: ContractBundleAsset[] = [];
    for (const fixture of fixtures) {
        metadata.push({
            id: fixture.id,
            mediaType: fixture.mediaType,
            byteLength: fixture.bytes.size,
            digest: await sha256Digest(new Uint8Array(await fixture.bytes.arrayBuffer())),
        });
        assets.push({ id: fixture.id, bytes: fixture.bytes });
    }
    return { metadata, assets };
}
