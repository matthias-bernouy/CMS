import type { ObservedSchemaContractV1 } from "@bernouy/cms-integrations";
import { DisposableSchemaCalibrationCluster } from "../database";
import { schemaCalibrationEnvironmentIdentity } from "../environment/manifest";
import { loadOfficialSchemaCalibrationSubjects, type OfficialSchemaCalibrationSubject } from "../subjects";
import { calibratePostgresDialect } from "./dialect";
import type { SchemaCalibrationReport, SchemaCalibrationSubjectReport } from "./report";
import { calibrateSchemaSubject } from "./subjectCalibration";

export async function calibrateOfficialIntegrationSchemas(options: {
    env: Record<string, string | undefined>;
    officialRoot: string;
    filter?: string;
    now?: () => string;
}): Promise<SchemaCalibrationReport> {
    return (await collectOfficialIntegrationSchemaCalibration(options)).report;
}

export type OfficialIntegrationSchemaCalibrationEvidence = Readonly<{
    report: SchemaCalibrationReport;
    observations: readonly Readonly<{
        subject: OfficialSchemaCalibrationSubject;
        observedSchema: ObservedSchemaContractV1;
    }>[];
}>;

export async function collectOfficialIntegrationSchemaCalibration(options: {
    env: Record<string, string | undefined>;
    officialRoot: string;
    filter?: string;
    now?: () => string;
}): Promise<OfficialIntegrationSchemaCalibrationEvidence> {
    const environment = await schemaCalibrationEnvironmentIdentity();
    const allSubjects = await loadOfficialSchemaCalibrationSubjects(options.officialRoot);
    const subjects = options.filter ? allSubjects.filter((subject) => subject.kind === options.filter) : allSubjects;
    if (subjects.length === 0) {
        throw new Error(`Unknown official schema calibration filter "${options.filter}"`);
    }
    const subjectByKind = new Map(allSubjects.map((subject) => [subject.kind, subject]));
    const cluster = new DisposableSchemaCalibrationCluster(options.env);
    try {
        const dialect = await calibratePostgresDialect(cluster, environment);
        const reports: SchemaCalibrationSubjectReport[] = [];
        const observations: OfficialIntegrationSchemaCalibrationEvidence["observations"][number][] = [];
        let postgresVersion = "";
        for (const subject of subjects) {
            const result = await calibrateSchemaSubject(cluster, environment, subject, subjectByKind);
            reports.push(result.report);
            observations.push({ subject, observedSchema: result.observedSchema });
            postgresVersion ||= result.postgresVersion;
            if (postgresVersion !== result.postgresVersion) {
                throw new Error("Schema calibration databases reported different PostgreSQL versions");
            }
        }
        return {
            report: {
                schema: "cms.integration.schema-calibration-report.v1",
                generatedAt: (options.now ?? (() => new Date().toISOString()))(),
                environment: { digest: environment.digest, image: environment.image, postgresVersion },
                dialect,
                subjects: reports,
            },
            observations,
        };
    } finally {
        await cluster.close();
    }
}
