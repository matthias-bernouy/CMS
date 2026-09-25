import { describe, expect, test } from "bun:test";
import {
    DEFAULT_PROVIDER_INSTALLATION_LIMITS,
    parseProviderInstallation,
    parseProviderInstallationJson,
    ProviderInstallationValidationError,
} from "@bernouy/cms-repository/providers/installations";
import { installationDocument } from "./fixtures";

describe("provider installation parsing", () => {
    test("clones and deeply freezes configuration without freezing the caller", () => {
        const document = installationDocument();
        const installation = parseProviderInstallation(document);
        document.configuration.locale = "fr";
        expect(installation.configuration.locale).toBe("en");
        expect(Object.isFrozen(installation)).toBe(true);
        expect(Object.isFrozen(installation.configuration)).toBe(true);
        expect(Object.isFrozen(document.configuration)).toBe(false);
        expect(parseProviderInstallationJson(JSON.stringify(installation))).toEqual(installation);
    });

    test("supports administrative states, without treating them as runtime readiness", () => {
        for (const status of ["enabled", "disabled", "revoked"]) {
            expect(parseProviderInstallation({ ...installationDocument(), status }).status).toBe(status);
        }
        expect(() => parseProviderInstallation({ ...installationDocument(), status: "ready" })).toThrow();
        const { gatewayTokenRef: _, ...withoutGateway } = installationDocument();
        expect(parseProviderInstallation(withoutGateway).gatewayTokenRef).toBeUndefined();
    });

    test("accepts only secret references and separates credential directions", () => {
        for (const providerTokenRef of ["raw-token", "${lowercase}", "prefix${TOKEN}", "${}"]) {
            expect(() => parseProviderInstallation({ ...installationDocument(), providerTokenRef })).toThrow(
                ProviderInstallationValidationError,
            );
        }
        const document = installationDocument();
        document.gatewayTokenRef = document.providerTokenRef;
        expect(() => parseProviderInstallation(document)).toThrow("distinct references");
        expect(() => parseProviderInstallation({ ...installationDocument(), apiKey: "secret" })).toThrow();
    });

    test("validates identifiers, approval pins, closed records, and chronological dates", () => {
        const document = installationDocument();
        for (const patch of [
            { id: "contains spaces" },
            { siteId: "" },
            { providerId: "UPPERCASE" },
            { accountId: "" },
            { createdAt: "2026-09-25T00:00:00Z" },
            { updatedAt: "2026-09-23T00:00:00Z" },
            { updatedAt: "2026-02-30T00:00:00Z" },
            { approval: { ...document.approval, manifestVersion: "v1" } },
            { approval: { ...document.approval, manifestDigest: "sha256:bad" } },
            { approval: { ...document.approval, grants: ["everything"] } },
        ]) {
            expect(() => parseProviderInstallation({ ...document, ...patch })).toThrow();
        }
    });

    test("applies byte and depth limits to both object and JSON entry points", () => {
        const document = installationDocument();
        for (const limits of [
            { ...DEFAULT_PROVIDER_INSTALLATION_LIMITS, maxDocumentBytes: 16 },
            { ...DEFAULT_PROVIDER_INSTALLATION_LIMITS, maxJsonDepth: 1 },
        ]) {
            expect(() => parseProviderInstallation(document, limits)).toThrow(ProviderInstallationValidationError);
            expect(() => parseProviderInstallationJson(JSON.stringify(document), limits)).toThrow(
                ProviderInstallationValidationError,
            );
        }
        expect(() => parseProviderInstallationJson('{"id":"one","id":"two"}')).toThrow();
        expect(() => parseProviderInstallationJson(new Uint8Array([0xff]))).toThrow();
        expect(() => parseProviderInstallation({ ...document, configuration: { values: Array(1) } })).toThrow();
    });
});
