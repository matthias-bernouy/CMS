import { describe, expect, test } from "bun:test";
import { ProviderInstallationValidationError } from "../../../src/installations/core/errors";
import { DEFAULT_PROVIDER_INSTALLATION_LIMITS } from "../../../src/installations/core/limits";
import {
    parseProviderRuntimeReport,
    parseProviderRuntimeReportJson,
} from "../../../src/installations/core/reports/parseProviderRuntimeReport";
import { reportDocument } from "./fixtures";

describe("provider runtime report input bounds", () => {
    test("rejects duplicate JSON keys and malformed UTF-8", () => {
        const json = JSON.stringify(reportDocument()).replace('"providerId":', '"providerId":"other","providerId":');
        expect(() => parseProviderRuntimeReportJson(json)).toThrow("duplicate property");
        expect(() => parseProviderRuntimeReportJson(new Uint8Array([0xc3, 0x28]))).toThrow(
            ProviderInstallationValidationError,
        );
    });

    test("rejects sparse arrays and undefined members on the object path", () => {
        expect(() => parseProviderRuntimeReport({ ...reportDocument(), implementations: Array(1) })).toThrow(
            ProviderInstallationValidationError,
        );
        expect(() => parseProviderRuntimeReport({ ...reportDocument(), implementations: [undefined] })).toThrow(
            ProviderInstallationValidationError,
        );
    });

    test("honors configured count bounds", () => {
        const document = reportDocument();
        document.implementations.push({ ...document.implementations[0]!, version: "2.0.0" });
        expect(() =>
            parseProviderRuntimeReport(document, {
                ...DEFAULT_PROVIDER_INSTALLATION_LIMITS,
                maxImplementations: 1,
            }),
        ).toThrow("must not contain more than 1 entries");
    });

    test("honors byte and depth limits on both object and JSON paths", () => {
        for (const limits of [
            { ...DEFAULT_PROVIDER_INSTALLATION_LIMITS, maxDocumentBytes: 64 },
            { ...DEFAULT_PROVIDER_INSTALLATION_LIMITS, maxJsonDepth: 1 },
        ]) {
            expect(() => parseProviderRuntimeReport(reportDocument(), limits)).toThrow(
                ProviderInstallationValidationError,
            );
            expect(() => parseProviderRuntimeReportJson(JSON.stringify(reportDocument()), limits)).toThrow(
                ProviderInstallationValidationError,
            );
        }
    });
});
