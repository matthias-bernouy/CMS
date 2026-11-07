import type { ReleaseLimits } from "../protocol/limits";
import { DEFAULT_RELEASE_LIMITS } from "../protocol/limits";
import { admitContractRelease } from "./admitContractRelease";
import { isSha256Digest } from "@bernouy/binary-media";

export type ReleaseDigest = `sha256:${string}`;

export async function computeReleaseDigest(
    release: unknown,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): Promise<ReleaseDigest> {
    return (await admitContractRelease(release, limits)).digest;
}

export function isReleaseDigest(value: string): value is ReleaseDigest {
    return isSha256Digest(value);
}
