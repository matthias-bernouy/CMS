import type { ReleaseDigest } from "../core/admission/digest";
import type { ContractFixtureAssetDefinition } from "./ContractRelease";

/** A reference to a value captured by an earlier call in the same scenario. */
export interface ConformanceCaptureReference {
    readonly $capture: string;
}

/** A field assertion; presence means the final object owns that property, even if its value is null. */
export type ConformanceCheck = {
    /** Empty string selects the entire output; otherwise use /object/property. */
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

export interface ConformanceCall {
    readonly id: string;
    readonly capabilityId: string;
    readonly actor: ConformanceActor;
    readonly input: Readonly<Record<string, unknown>>;
    readonly expect: ConformanceExpectation;
    readonly captures?: readonly ConformanceCapture[];
}

export interface ConformanceScenario {
    readonly id: string;
    readonly description?: string;
    readonly calls: readonly ConformanceCall[];
}

export interface ConformanceCoverageExemption {
    readonly capabilityId: string;
    readonly errorCode?: string;
    readonly reason: string;
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
    readonly scenarios: readonly ConformanceScenario[];
    readonly fixtureAssets?: readonly ContractFixtureAssetDefinition[];
    readonly coverageExemptions?: readonly ConformanceCoverageExemption[];
}
