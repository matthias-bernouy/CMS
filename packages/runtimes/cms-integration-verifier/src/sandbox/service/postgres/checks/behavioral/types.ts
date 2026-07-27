import type { PlatformVerificationCheckEvidenceV1 } from "@bernouy/cms-integration-verification";

export type BehavioralRlsScalar = string | number | boolean | null;

export type BehavioralRlsFixture = Readonly<{
    key: BehavioralRlsScalar;
    values: Readonly<Record<string, BehavioralRlsScalar>>;
}>;

export type BehavioralRlsProbe = Readonly<{
    probeId: string;
    namespace: string;
    relation: string;
    keyColumn: string;
    subjectColumn: string;
    first: BehavioralRlsFixture;
    second: BehavioralRlsFixture;
    firstCrossInsert: BehavioralRlsFixture;
    secondCrossInsert: BehavioralRlsFixture;
}>;

export type BehavioralRlsProof = Readonly<{
    environment: PlatformVerificationCheckEvidenceV1;
    reads: PlatformVerificationCheckEvidenceV1;
    writes: PlatformVerificationCheckEvidenceV1;
}>;

export type BehavioralRlsActor = "anon" | "first" | "second";

export type BehavioralRlsObservation = Readonly<{
    probeId: string;
    actor: BehavioralRlsActor;
    operation: string;
    outcome: "denied" | "empty" | "rows" | "error";
    rowCount: number;
}>;
