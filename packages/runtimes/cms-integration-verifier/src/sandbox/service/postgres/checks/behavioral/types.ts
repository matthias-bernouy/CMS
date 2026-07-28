import type {
    BehavioralRlsFixtureV1,
    BehavioralRlsProbeV1,
    BehavioralRlsScalarV1,
    PlatformVerificationCheckEvidenceV1,
} from "@bernouy/cms-integration-verification";

export type BehavioralRlsScalar = BehavioralRlsScalarV1;
export type BehavioralRlsFixture = BehavioralRlsFixtureV1;
export type BehavioralRlsProbe = BehavioralRlsProbeV1;

export type BehavioralRlsProof = Readonly<{
    environment: PlatformVerificationCheckEvidenceV1;
    reads: PlatformVerificationCheckEvidenceV1;
    writes: PlatformVerificationCheckEvidenceV1;
}>;

export type BehavioralRlsActor = "anon" | "first" | "second";

export type BehavioralRlsAuthenticatedActor = Readonly<{
    subject: string;
    sessionId: string;
    email: string;
}>;

export type BehavioralRlsActors = Readonly<{
    first: BehavioralRlsAuthenticatedActor;
    second: BehavioralRlsAuthenticatedActor;
}>;

export type BehavioralRlsExposedRelation = Readonly<{
    namespace: string;
    relation: string;
}>;

export type BehavioralRlsObservation = Readonly<{
    probeId: string;
    actor: BehavioralRlsActor;
    operation: string;
    outcome: "denied" | "empty" | "rows" | "error";
    rowCount: number;
}>;
