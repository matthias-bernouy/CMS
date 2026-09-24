import { describe, expect, test } from "bun:test";
import { ProviderInstallationValidationError } from "../../../src/installations/core/errors";
import {
    parseProviderRuntimeReport,
    parseProviderRuntimeReportJson,
} from "../../../src/installations/core/reports/parseProviderRuntimeReport";
import { reportDocument } from "./fixtures";

describe("provider runtime report parsing", () => {
    test("returns an independent immutable snapshot without freezing the input", () => {
        const document = reportDocument();
        const parsed = parseProviderRuntimeReport(document);
        expect(parsed).toEqual(document);
        expect(Object.isFrozen(parsed)).toBe(true);
        expect(Object.isFrozen(parsed.account)).toBe(true);
        expect(Object.isFrozen(parsed.manifest)).toBe(true);
        expect(Object.isFrozen(parsed.implementations)).toBe(true);
        expect(Object.isFrozen(parsed.implementations[0])).toBe(true);
        expect(Object.isFrozen(document.account)).toBe(false);
        document.account.label = "Changed after parsing";
        document.implementations[0]!.status = "unavailable";
        expect(parsed.account.label).toBe("Main shop — production");
        expect(parsed.implementations[0]?.status).toBe("ready");
    });

    test("uses ordinal set ordering and accepts multiple exact releases of a contract", () => {
        const document = reportDocument();
        const entry = document.implementations[0]!;
        document.implementations = [
            { ...entry, contractId: "hotel" },
            { ...entry, contractId: "delta" },
            { ...entry, contractId: "chess", version: "2.0.0" },
            { ...entry, contractId: "chess", version: "1.0.0" },
        ];
        expect(
            parseProviderRuntimeReport(document).implementations.map(
                ({ contractId, version }) => `${contractId}@${version}`,
            ),
        ).toEqual(["chess@1.0.0", "chess@2.0.0", "delta@1.0.0", "hotel@1.0.0"]);
        expect(document.implementations[0]?.contractId).toBe("hotel");
    });

    test("rejects duplicate release tuples even when their statuses differ", () => {
        const document = reportDocument();
        document.implementations.push({ ...document.implementations[0]!, status: "unavailable" });
        expect(() => parseProviderRuntimeReport(document)).toThrow("duplicates");
    });

    test("rejects unknown fields at every report boundary", () => {
        const document = reportDocument();
        for (const value of [
            { ...document, permissions: [] },
            { ...document, account: { ...document.account, credentials: "not-allowed" } },
            { ...document, manifest: { ...document.manifest, url: "https://other.example.com" } },
            { ...document, implementations: [{ ...document.implementations[0]!, requires: [] }] },
        ]) {
            expect(() => parseProviderRuntimeReport(value)).toThrow(ProviderInstallationValidationError);
            expect(() => parseProviderRuntimeReport(value)).toThrow("unknown property");
        }
    });

    test("requires a bounded opaque account ID and a nonempty label", () => {
        const document = reportDocument();
        for (const id of ["", "a b", "a/b", "é", "a".repeat(129)]) {
            expect(() => parseProviderRuntimeReport({ ...document, account: { ...document.account, id } })).toThrow(
                ProviderInstallationValidationError,
            );
        }
        for (const label of ["", "a".repeat(129)]) {
            expect(() => parseProviderRuntimeReport({ ...document, account: { ...document.account, label } })).toThrow(
                ProviderInstallationValidationError,
            );
        }
    });

    test("requires protocol, identifiers, exact versions, digests, and known availability states", () => {
        const document = reportDocument();
        for (const value of [
            { ...document, protocol: "ulvia-provider/v2" },
            { ...document, providerId: "Provider" },
            { ...document, buildVersion: "^1.0.0" },
            { ...document, manifest: { ...document.manifest, version: "1" } },
            { ...document, manifest: { ...document.manifest, digest: "sha256:bad" } },
            ...["contractId", "version", "digest", "status"].map((key) => ({
                ...document,
                implementations: [{ ...document.implementations[0]!, [key]: "INVALID" }],
            })),
        ]) {
            expect(() => parseProviderRuntimeReport(value)).toThrow(ProviderInstallationValidationError);
        }
    });

    test("parses the same shape from strict JSON text or bytes", () => {
        const json = JSON.stringify(reportDocument());
        expect(parseProviderRuntimeReportJson(json)).toEqual(parseProviderRuntimeReport(reportDocument()));
        expect(parseProviderRuntimeReportJson(new TextEncoder().encode(json))).toEqual(reportDocument());
    });
});
