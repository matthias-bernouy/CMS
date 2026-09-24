import { describe, expect, test } from "bun:test";
import { ProviderInstallationValidationError } from "../../../src/installations/core/errors";
import { validateProviderRuntimeReport } from "../../../src/installations/core/reports/validateProviderRuntimeReport";
import { admittedReport, digest, endpoint } from "./fixtures";

describe("provider runtime report validation", () => {
    test("matches an admitted manifest and allows every declared availability state", async () => {
        const { admission, report } = await admittedReport();
        for (const status of ["ready", "setup-required", "unavailable"]) {
            report.implementations[0]!.status = status;
            const parsed = validateProviderRuntimeReport(report, admission, { endpoint, accountId: report.account.id });
            expect(parsed.implementations[0]?.status).toBe(status);
            expect(Object.isFrozen(parsed)).toBe(true);
        }
    });

    test("accepts missing implementations without inferring permission or changing pins", async () => {
        const { admission, report } = await admittedReport();
        for (const implementations of [[], report.implementations.slice(0, 1)]) {
            const parsed = validateProviderRuntimeReport({ ...report, implementations }, admission, { endpoint });
            expect(parsed.implementations).toEqual(implementations);
            expect(Object.keys(parsed)).toEqual(Object.keys(report));
            expect(admission.manifest.implementations).toHaveLength(2);
        }
    });

    test("checks provider and optional expected account identity independently", async () => {
        const { admission, report } = await admittedReport();
        expect(() =>
            validateProviderRuntimeReport({ ...report, providerId: "other" }, admission, { endpoint }),
        ).toThrow("must match the approved provider");
        expect(() =>
            validateProviderRuntimeReport(report, admission, { endpoint, accountId: "another-account" }),
        ).toThrow("must match the connected account");
        expect(
            validateProviderRuntimeReport(
                { ...report, account: { ...report.account, id: "another-account" } },
                admission,
                { endpoint },
            ).account.id,
        ).toBe("another-account");
    });

    test("requires both the exact approved manifest version and digest", async () => {
        const { admission, report } = await admittedReport();
        for (const manifest of [
            { ...report.manifest, version: "1.0.1" },
            { ...report.manifest, digest },
        ]) {
            expect(() => validateProviderRuntimeReport({ ...report, manifest }, admission, { endpoint })).toThrow(
                "must match the approved manifest",
            );
        }
    });

    test("requires an allowed canonical endpoint and a build covered by the manifest", async () => {
        const { admission, report } = await admittedReport();
        expect(() =>
            validateProviderRuntimeReport(report, admission, { endpoint: "https://different.example.com" }),
        ).toThrow("origin is not allowed");
        expect(() => validateProviderRuntimeReport(report, admission, { endpoint: `${endpoint}/api` })).toThrow(
            ProviderInstallationValidationError,
        );
        for (const buildVersion of ["0.9.0", "2.0.0", "2.0.0-alpha.1"]) {
            expect(() => validateProviderRuntimeReport({ ...report, buildVersion }, admission, { endpoint })).toThrow(
                "build is not covered",
            );
        }
    });

    test("rejects unknown implementation tuples and digest mismatches even when unavailable", async () => {
        const { admission, report } = await admittedReport();
        const entry = report.implementations[0]!;
        for (const implementation of [
            { ...entry, contractId: "shipping" },
            { ...entry, version: "1.0.1" },
            { ...entry, digest },
            { ...entry, contractId: "shipping", status: "unavailable" },
        ]) {
            expect(() =>
                validateProviderRuntimeReport({ ...report, implementations: [implementation] }, admission, {
                    endpoint,
                }),
            ).toThrow("implementation must match an exact approved release and digest");
        }
    });
});
