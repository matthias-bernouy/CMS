import { afterEach, describe, expect, test } from "bun:test";
import { candidateJobResult } from "../values";
import { migrationInput, migrationResult } from "./reportMigrationFixture";
import {
    compatibility,
    reportFixture,
    reportPath,
    reportRequest,
    reportServer,
    stopReportServers,
} from "./reportRouteFixture";

afterEach(stopReportServers);

describe("private candidate report", () => {
    test("authenticates report reads and represents a partial queued plan", async () => {
        const fixture = await reportFixture("queued");
        const server = reportServer(fixture.record, fixture.objects);

        expect((await server.request("GET", reportPath())).status).toBe(401);
        const response = await reportRequest(server);
        expect(response.status).toBe(200);
        expect((await response.json()).report).toMatchObject({
            schema: "cms.repository.management.candidate-report.v1",
            candidate: { candidateId: "candidate-1", status: "queued" },
            verification: {
                state: "planned",
                suites: [{ suiteId: "platform-install", source: "platform" }],
            },
            migrations: [],
        });

        const missing = reportServer(null, fixture.objects);
        expect((await reportRequest(missing)).status).toBe(404);
    });

    test("projects a static rejection without leaking private candidate objects", async () => {
        const fixture = await reportFixture("rejected");
        fixture.objects.compatibilityReport = compatibility(fixture.record);
        const response = await reportRequest(reportServer(fixture.record, fixture.objects));
        const body = await response.json();

        expect(body.report.compatibility).toMatchObject({
            outcome: "unknown",
            contractAdmissible: false,
            releaseLevel: "minor",
            findings: [{ code: "schema-review-required", path: "connectors.primary.schema" }],
        });
        const serialized = JSON.stringify(body);
        for (const secret of [
            "PRIVATE-SQL",
            "PRIVATE-FIXTURE",
            "PRIVATE-FAILURE-MESSAGE",
            "repository-private-actor",
            "credential",
        ]) {
            expect(serialized).not.toContain(secret);
        }

        fixture.objects.compatibilityReport = {
            ...fixture.objects.compatibilityReport,
            packageDigest: "9".repeat(64),
        };
        const substituted = await reportRequest(reportServer(fixture.record, fixture.objects));
        expect(substituted.status).toBe(500);
        expect(await substituted.text()).not.toContain("9".repeat(64));
    });

    test("binds failed suite results to the admission plan and redacts author diagnostics", async () => {
        const fixture = await reportFixture("rejected");
        const result = await candidateJobResult("candidate-1", fixture.candidate, {
            jobId: "job-1",
            attemptId: "attempt-1",
            fencingToken: 1,
        });
        result.verification.results[0] = {
            ...result.verification.results[0]!,
            outcome: "failed",
            evidenceDigests: ["e".repeat(64)],
            diagnostics: [{ code: "domain-contract-failed", message: "PRIVATE-AUTHOR-OUTPUT", redacted: true }],
        };
        fixture.objects.admissionJobResult = result;
        fixture.objects.verificationJobResult = result.verification;
        const response = await reportRequest(reportServer(fixture.record, fixture.objects));
        const verification = (await response.json()).report.verification;

        expect(verification).toMatchObject({
            state: "completed",
            outcome: "failed",
            suites: [
                {
                    suiteId: "platform-install",
                    outcome: "failed",
                    durationMs: 10,
                    attempts: 1,
                    cacheHit: false,
                    diagnostics: [{ code: "domain-contract-failed", redacted: true }],
                },
            ],
        });
        expect(JSON.stringify(verification)).not.toContain("PRIVATE-AUTHOR-OUTPUT");
    });

    test("pairs exact migration inputs with bounded raw execution observations", async () => {
        const fixture = await reportFixture("rejected");
        const inputDigest = "7".repeat(64);
        const input = migrationInput(fixture.record);
        const result = await candidateJobResult("candidate-1", fixture.candidate, {
            jobId: "job-1",
            attemptId: "attempt-1",
            fencingToken: 1,
        });
        result.migrations = [migrationResult(input, inputDigest)];
        fixture.record.migrationInputDigests = [inputDigest];
        fixture.objects.migrationInputs = [input];
        fixture.objects.admissionJobResult = result;
        fixture.objects.verificationJobResult = result.verification;

        const response = await reportRequest(reportServer(fixture.record, fixture.objects));
        const migration = (await response.json()).report.migrations[0];
        expect(migration).toMatchObject({
            migrationInputDigest: inputDigest,
            source: { kind: "example", version: "1.1.0" },
            target: { kind: "example", version: "1.2.0", packageDigest: fixture.record.packageDigest },
            connectorKey: "primary",
            lineageId: "example-supabase-v1",
            sourceMigrationRevision: 1,
            targetMigrationRevision: 2,
            supportedSourceRange: "^1.1.0",
            result: {
                freshTarget: { status: "passed", stateDigest: "1".repeat(64) },
                migratedTarget: { status: "passed", stateDigest: "1".repeat(64) },
                equivalence: { status: "passed", equivalent: true },
                ledger: { status: "passed", sourceRevision: 1, targetRevision: 2 },
                replay: { status: "passed", unchanged: true },
                cutover: {
                    cmsMediated: { status: "passed", strategy: "binding-switch" },
                    providerDirect: { status: "passed", strategy: "expand-in-code" },
                    activation: { status: "passed", activePackageDigest: fixture.record.packageDigest },
                },
            },
        });
    });
});
