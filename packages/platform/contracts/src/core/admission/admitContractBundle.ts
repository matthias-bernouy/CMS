import { contractAssetDefinitions } from "../../documentation/manifest";
import { verifyDocumentation } from "../../documentation/verify";
import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../protocol/limits";
import {
    prepareContractRelease,
    prepareContractReleaseJson,
} from "ulvia-contracts/core/admission/prepareContractRelease";
import {
    admitPreparedRelease,
    type AdmittedContractRelease,
} from "ulvia-contracts/core/admission/admitContractRelease";
import type { PreparedContractRelease } from "./prepareContractRelease";
import { verifyFixtureAssets } from "./verifyFixtureAssets";

export interface ContractBundleAsset {
    readonly id: string;
    readonly bytes: Blob | Uint8Array;
}

export async function admitContractBundle(
    release: unknown,
    assets: readonly ContractBundleAsset[],
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): Promise<AdmittedContractRelease> {
    return admitPreparedReleaseWithAssets(prepareContractRelease(release, limits), assets);
}

export async function admitContractBundleJson(
    input: string | Uint8Array,
    assets: readonly ContractBundleAsset[],
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): Promise<AdmittedContractRelease> {
    return admitPreparedReleaseWithAssets(prepareContractReleaseJson(input, limits), assets);
}

async function admitPreparedReleaseWithAssets(
    prepared: PreparedContractRelease,
    assets: readonly ContractBundleAsset[],
): Promise<AdmittedContractRelease> {
    const verified = await verifyFixtureAssets(contractAssetDefinitions(prepared.release), assets);
    const documents = verified.filter((asset) => asset.id.startsWith("docs/"));
    await verifyDocumentation(prepared.release, documents);
    return admitPreparedRelease(
        prepared,
        verified.filter((asset) => !asset.id.startsWith("docs/")),
        documents,
    );
}
