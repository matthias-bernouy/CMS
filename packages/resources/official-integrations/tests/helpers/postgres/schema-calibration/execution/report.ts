export type SchemaCalibrationSubjectReport = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    dependencyDigests: readonly string[];
    contractDigest: string;
    namespaceCount: number;
    relationCount: number;
    columnCount: number;
    constraintCount: number;
    freshDeterministic: true;
    rerunDeterministic: true;
    identicalCompatibilityFindings: 0;
}>;

export type SchemaCalibrationReport = Readonly<{
    schema: "cms.integration.schema-calibration-report.v1";
    generatedAt: string;
    environment: Readonly<{
        digest: string;
        image: string;
        postgresVersion: string;
    }>;
    subjects: readonly SchemaCalibrationSubjectReport[];
}>;
