import type { SQL } from "bun";
import { resolve } from "node:path";
import { IntegrationCompatibilityEvaluator } from "@bernouy/cms-integration-registry";
import {
    identifyObservedSchemaContract,
    parseIntegrationDefinition,
    projectObservedSchemaContract,
    sameObservedSchemaContract,
    type DeclarativeConnectorSchemaContract,
    type ObservedSchemaContractV1,
} from "@bernouy/cms-integrations";
import {
    loadSupabaseSqlSchemas,
    readSupabaseObservedSchemaContract,
    type SupabaseSchemaCatalogQueryClient,
} from "@bernouy/cms-integrations/supabase";
import { DisposableSchemaCalibrationCluster, type SchemaCalibrationDatabase } from "../database";
import { schemaCalibrationEnvironmentIdentity } from "../environment/manifest";
import { loadOfficialSchemaCalibrationSubjects, type OfficialSchemaCalibrationSubject } from "../subjects";
import type { SchemaCalibrationReport, SchemaCalibrationSubjectReport } from "./report";

export async function calibrateOfficialIntegrationSchemas(options: {
    env: Record<string, string | undefined>;
    officialRoot: string;
    filter?: string;
    now?: () => string;
}): Promise<SchemaCalibrationReport> {
    const environment = await schemaCalibrationEnvironmentIdentity();
    const allSubjects = await loadOfficialSchemaCalibrationSubjects(options.officialRoot);
    const subjects = options.filter ? allSubjects.filter((subject) => subject.kind === options.filter) : allSubjects;
    if (subjects.length === 0) {
        throw new Error(`Unknown official schema calibration filter "${options.filter}"`);
    }
    const subjectByKind = new Map(allSubjects.map((subject) => [subject.kind, subject]));
    const cluster = new DisposableSchemaCalibrationCluster(options.env);
    try {
        const reports: SchemaCalibrationSubjectReport[] = [];
        let postgresVersion = "";
        for (const subject of subjects) {
            const result = await calibrateSubject(cluster, environment, subject, subjectByKind);
            reports.push(result.report);
            postgresVersion ||= result.postgresVersion;
            if (postgresVersion !== result.postgresVersion) {
                throw new Error("Schema calibration databases reported different PostgreSQL versions");
            }
        }
        return {
            schema: "cms.integration.schema-calibration-report.v1",
            generatedAt: (options.now ?? (() => new Date().toISOString()))(),
            environment: { digest: environment.digest, image: environment.image, postgresVersion },
            subjects: reports,
        };
    } finally {
        await cluster.close();
    }
}

async function calibrateSubject(
    cluster: DisposableSchemaCalibrationCluster,
    environment: Awaited<ReturnType<typeof schemaCalibrationEnvironmentIdentity>>,
    subject: OfficialSchemaCalibrationSubject,
    subjectByKind: ReadonlyMap<string, OfficialSchemaCalibrationSubject>,
): Promise<{ postgresVersion: string; report: SchemaCalibrationSubjectReport }> {
    const baseName = `cmscore_contracts_${subject.kind.replaceAll("-", "_")}`;
        const databaseA = await cluster.create(`${baseName}_a`, environment);
        const databaseB = await cluster.create(`${baseName}_b`, environment);
    try {
        await installSubject(databaseA.sql, subject, subjectByKind);
        await installSubject(databaseB.sql, subject, subjectByKind);
        const firstA = await observe(databaseA, subject);
        const firstB = await observe(databaseB, subject);
        if (!sameObservedSchemaContract(firstA, firstB)) {
            throw new Error(`${subject.kind}@${subject.version} is not deterministic across fresh databases`);
        }
        await installTarget(databaseA.sql, subject);
        const rerunA = await observe(databaseA, subject);
        if (!sameObservedSchemaContract(firstA, rerunA)) {
            throw new Error(`${subject.kind}@${subject.version} changes its observed schema when reapplied`);
        }
        const projection = projectObservedSchemaContract(firstA);
        const findings = identicalCompatibilityFindings(subject, projection);
        if (findings !== 0) {
            throw new Error(`${subject.kind}@${subject.version} produced ${findings} findings against itself`);
        }
        const identity = await identifyObservedSchemaContract(firstA);
        return {
            postgresVersion: await serverVersion(databaseA.sql),
            report: {
                kind: subject.kind,
                version: subject.version,
                packageDigest: subject.digest,
                dependencyDigests: subject.dependencies.map((dependency) => dependency.digest),
                contractDigest: identity.digest,
                ...schemaCounts(firstA),
                freshDeterministic: true,
                rerunDeterministic: true,
                identicalCompatibilityFindings: 0,
            },
        };
    } finally {
        await cluster.drop(databaseB);
        await cluster.drop(databaseA);
    }
}

async function installSubject(
    database: SQL,
    subject: OfficialSchemaCalibrationSubject,
    subjectByKind: ReadonlyMap<string, OfficialSchemaCalibrationSubject>,
): Promise<void> {
    for (const dependency of subject.sqlInstallationOrder) {
        const dependencySubject = subjectByKind.get(dependency.kind);
        if (
            !dependencySubject ||
            dependencySubject.version !== dependency.version ||
            dependencySubject.digest !== dependency.digest
        ) {
            throw new Error(
                `SQL dependency identity changed during calibration: ${dependency.kind}@${dependency.version}`,
            );
        }
        await installTarget(database, dependencySubject);
    }
    await installTarget(database, subject);
}

async function installTarget(database: SQL, subject: OfficialSchemaCalibrationSubject): Promise<void> {
    const connectorRoot = resolve(subject.root, subject.connector.root ?? ".");
    const schemas = await loadSupabaseSqlSchemas(connectorRoot, subject.connector.schemas ?? []);
    for (const schema of schemas) {
        await database.unsafe(schema.sql);
    }
}

async function observe(
    database: SchemaCalibrationDatabase,
    subject: OfficialSchemaCalibrationSubject,
): Promise<ObservedSchemaContractV1> {
    const client: SupabaseSchemaCatalogQueryClient = {
        query: async (statement, parameters) => {
            const values = parameters.map((parameter) =>
                Array.isArray(parameter) ? database.sql.array(parameter, "TEXT") : parameter,
            );
            return (await database.sql.unsafe(statement, values)) as readonly Record<string, unknown>[];
        },
    };
    return readSupabaseObservedSchemaContract({
        client,
        owner: { connectorKey: subject.connectorKey, lineageId: subject.lineageId },
        ownedNamespaces: subject.namespaces,
    });
}

function identicalCompatibilityFindings(
    subject: OfficialSchemaCalibrationSubject,
    schema: DeclarativeConnectorSchemaContract,
): number {
    let reportSequence = 0;
    const evaluator = new IntegrationCompatibilityEvaluator({
        identity: { name: "schema-calibration", version: "1.0.0" },
        now: () => "2000-01-01T00:00:00.000Z",
        createReportId: () => `schema-calibration-${++reportSequence}`,
    });
    const definition = (version: string) =>
        parseIntegrationDefinition({
            kind: subject.kind,
            label: subject.kind,
            version,
            inputs: [],
            connectors: [
                {
                    provider: "supabase",
                    root: subject.connector.root,
                    schemas: subject.connector.schemas,
                    compatibility: { schema },
                },
            ],
        });
    const decision = evaluator.evaluateAdmission({
        baseline: { definition: definition("1.0.0"), packageDigest: "a".repeat(64) },
        candidate: { definition: definition("1.0.1"), packageDigest: "b".repeat(64) },
    });
    return decision.report.evidence.length;
}

async function serverVersion(database: SQL): Promise<string> {
    const rows = await database<{ version: string }[]>`select current_setting('server_version_num') as version`;
    const version = rows[0]?.version;
    if (!version) {
        throw new Error("Schema calibration could not read PostgreSQL server_version_num");
    }
    return version;
}

function schemaCounts(contract: ObservedSchemaContractV1) {
    const relations = contract.namespaces.flatMap((namespace) => namespace.relations);
    return {
        namespaceCount: contract.namespaces.length,
        relationCount: relations.length,
        columnCount: relations.reduce((total, relation) => total + relation.columns.length, 0),
        constraintCount: relations.reduce((total, relation) => total + relation.constraints.length, 0),
    };
}
