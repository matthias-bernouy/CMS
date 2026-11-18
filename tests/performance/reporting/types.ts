import type { CapabilityInventory, Finding, ScenarioDefinition, ScenarioResult } from "../capabilities/types";
import type { CoverageRow } from "../capabilities/coverage";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";

export type EnvironmentProfile = Readonly<{
    id: string;
    fingerprint: string;
    architecture: string;
    platform: string;
    cpuModel: string;
    cpuCount: number;
    memoryBytes: number;
    bunVersion: string;
    mongoVersion: string;
    instrumentationDigest: string;
    limits: Readonly<Record<string, Readonly<{ cpus: number; memoryBytes: number }>>>;
    services?: Readonly<Record<string, Readonly<{ programDigest: string; cpus: number; memoryBytes: number }>>>;
    bootstrap?: Readonly<{ pin: ContractParentReference; providerDigest: string }>;
}>;

export type ImageIdentity = Readonly<{
    component: "edge" | "provider";
    reference: string;
    id: string;
    revision: string;
}>;

export type RunMetadata = Readonly<{
    id: string;
    startedAt: string;
    finishedAt: string;
    revision: string;
    sourceDigest: string;
    dirty: boolean;
    sourceArchive?: Readonly<{ archiveSha256: string; manifestSha256: string }>;
    selection?: Readonly<{ kind: "selected-scenarios"; scenarioIds: readonly string[]; plannedScenarios: number }>;
    profile: EnvironmentProfile;
    images: readonly ImageIdentity[];
}>;

export type RunReport = Readonly<{
    format: 1;
    metadata: RunMetadata;
    inventory: CapabilityInventory;
    scenarios: readonly ScenarioDefinition[];
    results: readonly ScenarioResult[];
    coverage: readonly CoverageRow[];
    findings: readonly Finding[];
    status: "passed" | "failed";
}>;

export type Comparison = Readonly<{
    reference: string | null;
    candidate: string;
    comparable: boolean;
    findings: readonly Finding[];
    changes: readonly Readonly<{
        scenario: string;
        referenceP95Ms: number;
        candidateP95Ms: number;
        deltaMs: number;
        regressed: boolean;
    }>[];
}>;
