import type { ContractConformanceSuite } from "../../interfaces/Conformance";
import { parseConformanceSuite, parseConformanceSuiteJson } from "../conformance/parseSuite";
import { canonicalizeIJson } from "../protocol/canonical";
import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../protocol/limits";
import { verifyAdmission } from "./verifyAdmission";
import type { AdmittedContractRelease, VerifiedFixtureAsset } from "./admitContractRelease";
import type { ContractBundleAsset } from "./admitContractBundle";
import type { ReleaseDigest } from "./digest";
import { verifyFixtureAssets } from "./verifyFixtureAssets";
import { indexDependencyContext } from "../conformance/dependencies/references";

export interface AdmittedConformanceSuite {
    readonly kind: "admitted-conformance-suite";
    readonly suite: ContractConformanceSuite;
    readonly canonicalJson: string;
    readonly digest: ReleaseDigest;
    readonly fixtureAssets?: readonly VerifiedFixtureAsset[];
}

/** Reverify root/dependency artifacts and suite-owned asset bytes before admitting the independently hashed suite. */
export async function admitConformanceSuite(
    value: unknown,
    release: AdmittedContractRelease,
    assets: readonly ContractBundleAsset[] = [],
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
    dependencies: readonly AdmittedContractRelease[] = [],
): Promise<AdmittedConformanceSuite> {
    const verified = await verifyAdmission(release, limits);
    const verifiedDependencies = await verifyDependencies(dependencies, limits);
    return admitParsedSuite(parseConformanceSuite(value, verified, limits, verifiedDependencies), assets, limits);
}

export async function admitConformanceSuiteJson(
    input: string | Uint8Array,
    release: AdmittedContractRelease,
    assets: readonly ContractBundleAsset[] = [],
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
    dependencies: readonly AdmittedContractRelease[] = [],
): Promise<AdmittedConformanceSuite> {
    const verified = await verifyAdmission(release, limits);
    const verifiedDependencies = await verifyDependencies(dependencies, limits);
    return admitParsedSuite(parseConformanceSuiteJson(input, verified, limits, verifiedDependencies), assets, limits);
}

/** Artifact integrity is verified locally; suite admission never resolves a catalogue or contacts a provider. */
async function verifyDependencies(
    dependencies: readonly AdmittedContractRelease[],
    limits: Readonly<ReleaseLimits>,
): Promise<readonly AdmittedContractRelease[]> {
    indexDependencyContext(dependencies, limits);
    const verified: AdmittedContractRelease[] = [];
    for (const dependency of dependencies) {
        verified.push(await verifyAdmission(dependency, limits));
    }
    return verified;
}

async function admitParsedSuite(
    suite: ContractConformanceSuite,
    assets: readonly ContractBundleAsset[],
    limits: Readonly<ReleaseLimits>,
): Promise<AdmittedConformanceSuite> {
    const fixtureAssets = await verifyFixtureAssets(suite.fixtureAssets ?? [], assets);
    const canonicalJson = canonicalizeIJson(suite, limits.maxJsonDepth);
    const hash = new Uint8Array(
        await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson)),
    );
    const digest = `sha256:${Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")}` as ReleaseDigest;
    return Object.freeze({
        kind: "admitted-conformance-suite",
        suite,
        canonicalJson,
        digest,
        ...(suite.fixtureAssets?.length ? { fixtureAssets } : {}),
    });
}
