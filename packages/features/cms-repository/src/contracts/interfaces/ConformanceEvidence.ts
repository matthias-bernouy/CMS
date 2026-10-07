import type { ReleaseDigest } from "../core/admission/digest";

export interface ConformanceCallEvidence {
    readonly id: string;
    readonly status: "passed" | "failed";
    readonly attempts: number;
    readonly durationMs: number;
    readonly failureCode?: string;
}

export interface ConformanceScenarioEvidence {
    readonly id: string;
    readonly profileId?: string;
    readonly status: "passed" | "failed";
    readonly durationMs: number;
    readonly calls: readonly ConformanceCallEvidence[];
}

/** Immutable, output-free record of one isolated live conformance run. */
export interface ConformanceEvidence {
    readonly kind: "conformance-evidence";
    readonly protocol: "ulvia-conformance-evidence/v1";
    readonly id: string;
    readonly publisherId: string;
    readonly providerId: string;
    readonly providerManifest: { readonly version: string; readonly digest: ReleaseDigest };
    readonly providerBuildVersion: string;
    readonly contract: {
        readonly publisherId: string;
        readonly id: string;
        readonly version: string;
        readonly digest: ReleaseDigest;
    };
    readonly suite: {
        readonly version: string;
        readonly digest: ReleaseDigest;
        /** Canonical suite bytes make the evidence independently inspectable. Fixture bytes remain digest-pinned. */
        readonly canonicalJson: string;
    };
    readonly runner: { readonly name: string; readonly version: string };
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly status: "passed" | "failed";
    readonly scenarios: readonly ConformanceScenarioEvidence[];
}
