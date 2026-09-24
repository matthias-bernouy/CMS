import type { ReleaseDigest } from "../core/admission/digest";
import type { ContractFixtureAssetDefinition } from "./ContractRelease";
import type { ConformanceCallControls } from "./ConformanceControls";

/** A reference to a value captured by an earlier call in the same scenario. */
export interface ConformanceCaptureReference {
    readonly $capture: string;
}

/** Treat the wrapped JSON subtree as business data, without interpreting template markers. */
export interface ConformanceLiteral {
    readonly $literal: unknown;
}

/** A field assertion; presence means the final object owns that property, even if its value is null. */
export type ConformanceCheck = {
    /** Empty string selects the entire output; otherwise use a JSON Pointer through objects, maps or arrays. */
    readonly path: string;
} & ({ readonly equals: unknown; readonly present?: never } | { readonly present: true; readonly equals?: never });

export interface ConformanceCapture {
    readonly name: string;
    readonly path: string;
}

export type ConformanceExpectation =
    | { readonly kind: "success"; readonly checks?: readonly ConformanceCheck[] }
    | { readonly kind: "error"; readonly code: string; readonly checks?: readonly ConformanceCheck[] };

/** The runner supplies identities; labels are stable only within one scenario. */
export type ConformanceActor =
    | { readonly kind: "admin" }
    | { readonly kind: "authenticated"; readonly label: string }
    | { readonly kind: "public" };

export interface ConformanceCall extends ConformanceCallControls {
    readonly id: string;
    readonly capabilityId: string;
    /** Omit for the tested contract; otherwise resolve this contract through the active dependency profile. */
    readonly dependencyContractId?: string;
    readonly actor: ConformanceActor;
    readonly input: Readonly<Record<string, unknown>>;
    readonly expect: ConformanceExpectation;
    readonly captures?: readonly ConformanceCapture[];
}

export interface ConformanceScenario {
    readonly id: string;
    readonly description?: string;
    /** Omit to run in every dependency profile; otherwise select declared profile IDs. */
    readonly profiles?: readonly string[];
    readonly calls: readonly ConformanceCall[];
}

export interface ConformanceCoverageExemption {
    readonly capabilityId: string;
    readonly errorCode?: string;
    readonly reason: string;
}

/** Exact immutable dependency release; provider endpoints and credentials belong to the runner. */
export interface ConformanceDependencyRelease {
    readonly contractId: string;
    readonly version: string;
    readonly digest: ReleaseDigest;
}

/**
 * One release per dependency contract, including exercised transitive requirements.
 * Profiles must collectively exercise each declared support range of every called root requirement.
 * They describe concrete test combinations, not compatibility with every version in a range.
 */
export interface ConformanceDependencyProfile {
    readonly id: string;
    readonly releases: readonly ConformanceDependencyRelease[];
}

/** Independently versioned test suite pinned to one exact admitted release. */
export interface ContractConformanceSuite {
    readonly kind: "contract-conformance-suite";
    readonly protocol: "ulvia-conformance/v1";
    readonly contractId: string;
    readonly contractVersion: string;
    readonly contractDigest: ReleaseDigest;
    readonly publisherId: string;
    readonly version: string;
    /** A runner must provision and dispose a fresh tenant for each scenario, including on failure. */
    readonly isolation: "disposable-tenant";
    /** Each applicable scenario/profile pair uses fresh identities, state, and captures. */
    readonly dependencyProfiles?: readonly ConformanceDependencyProfile[];
    readonly scenarios: readonly ConformanceScenario[];
    readonly fixtureAssets?: readonly ContractFixtureAssetDefinition[];
    readonly coverageExemptions?: readonly ConformanceCoverageExemption[];
}
