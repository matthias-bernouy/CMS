import type { ContractConformanceSuite } from "../../interfaces/Conformance";
import { parseConformanceSuite, parseConformanceSuiteJson } from "../conformance/parseSuite";
import { canonicalizeIJson } from "../protocol/canonical";
import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../protocol/limits";
import { verifyAdmission } from "./verifyAdmission";
import type { AdmittedContractRelease, VerifiedFixtureAsset } from "./admitContractRelease";
import type { ContractBundleAsset } from "./admitContractBundle";
import type { ReleaseDigest } from "./digest";
import { snapshotFixtureAssets, verifyFixtureAssets } from "./verifyFixtureAssets";
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
    const snapshot = snapshotAdmissionInput(value, release, assets, limits, dependencies);
    const verified = await verifyAdmission(snapshot.release, snapshot.limits);
    const verifiedDependencies = await verifyDependencies(snapshot.dependencies, snapshot.limits);
    return admitParsedSuite(
        parseConformanceSuite(snapshot.value, verified, snapshot.limits, verifiedDependencies),
        snapshot.assets,
        snapshot.limits,
    );
}

export async function admitConformanceSuiteJson(
    input: string | Uint8Array,
    release: AdmittedContractRelease,
    assets: readonly ContractBundleAsset[] = [],
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
    dependencies: readonly AdmittedContractRelease[] = [],
): Promise<AdmittedConformanceSuite> {
    const value = typeof input === "string" ? input : input.slice();
    const snapshot = snapshotAdmissionInput(value, release, assets, limits, dependencies);
    const verified = await verifyAdmission(snapshot.release, snapshot.limits);
    const verifiedDependencies = await verifyDependencies(snapshot.dependencies, snapshot.limits);
    return admitParsedSuite(
        parseConformanceSuiteJson(
            snapshot.value as string | Uint8Array,
            verified,
            snapshot.limits,
            verifiedDependencies,
        ),
        snapshot.assets,
        snapshot.limits,
    );
}

function snapshotAdmissionInput(
    value: unknown,
    release: AdmittedContractRelease,
    assets: readonly ContractBundleAsset[],
    limits: Readonly<ReleaseLimits>,
    dependencies: readonly AdmittedContractRelease[],
) {
    return {
        value: typeof value === "string" ? value : structuredClone(value),
        release: structuredClone(release) as AdmittedContractRelease,
        assets: snapshotFixtureAssets(assets),
        limits: Object.freeze({ ...limits }),
        dependencies: Object.freeze(
            dependencies.map((dependency) => structuredClone(dependency) as AdmittedContractRelease),
        ),
    };
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
