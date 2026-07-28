import { isDeepStrictEqual } from "node:util";
import { identifyObservedSchemaContract, projectObservedSchemaContract } from "@bernouy/cms-integrations";
import { OFFICIAL_SCHEMA_BASELINE_POSTGRES_VERSION } from "@bernouy/cms-official-integrations/publication";
import { DisposableSchemaCalibrationCluster } from "../../database";
import { schemaCalibrationEnvironmentIdentity } from "../../environment/manifest";
import { loadOfficialSchemaCalibrationRelease } from "../../subjects";
import { calibrateSchemaSubject } from "../subjectCalibration";

const CONSENT_SCHEMA_TARGET = Object.freeze({
    kind: "consent",
    version: "1.0.0",
    connectorKey: "primary" as const,
    lineageId: "consent-supabase-v1",
    namespaces: ["consent"],
});

export type ConsentReleaseVerificationReport = Readonly<{
    schema: "cms.integration.consent-release-verification.v1";
    packageDigest: string;
    observedSchemaDigest: string;
    environmentDigest: string;
    runnerImage: string;
    postgresVersion: string;
    freshDeterministic: true;
    rerunDeterministic: true;
    declaredSchemaMatchesObserved: true;
}>;

export async function verifyConsentRelease(options: {
    env: Record<string, string | undefined>;
    officialRoot: string;
}): Promise<ConsentReleaseVerificationReport> {
    const subject = await loadOfficialSchemaCalibrationRelease(options.officialRoot, CONSENT_SCHEMA_TARGET);
    const environment = await schemaCalibrationEnvironmentIdentity();
    const cluster = new DisposableSchemaCalibrationCluster(options.env);
    try {
        const result = await calibrateSchemaSubject(cluster, environment, subject, new Map([[subject.kind, subject]]));
        if (result.postgresVersion !== OFFICIAL_SCHEMA_BASELINE_POSTGRES_VERSION) {
            throw new Error(
                `Consent release verification requires PostgreSQL ${OFFICIAL_SCHEMA_BASELINE_POSTGRES_VERSION}, received ${result.postgresVersion}`,
            );
        }
        const declaredSchema = subject.connector.compatibility?.schema;
        const observedSchema = projectObservedSchemaContract(result.observedSchema);
        if (!declaredSchema || !isDeepStrictEqual(declaredSchema, observedSchema)) {
            throw new Error("Consent declared schema differs from the observed release schema");
        }
        return {
            schema: "cms.integration.consent-release-verification.v1",
            packageDigest: subject.digest,
            observedSchemaDigest: (await identifyObservedSchemaContract(result.observedSchema)).digest,
            environmentDigest: environment.digest,
            runnerImage: environment.image,
            postgresVersion: result.postgresVersion,
            freshDeterministic: true,
            rerunDeterministic: true,
            declaredSchemaMatchesObserved: true,
        };
    } finally {
        await cluster.close();
    }
}
