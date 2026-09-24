import { describe, expect, test } from "bun:test";
import {
    DEFAULT_PROVIDER_MANIFEST_LIMITS,
    parseProviderManifest,
    parseProviderManifestJson,
} from "@bernouy/cms-providers";
import { implementation, manifestDocument, requirement } from "../support/fixtures";

const digest = `sha256:${"a".repeat(64)}`;

describe("provider manifest parsing", () => {
    test("rejects unknown fields and duplicate JSON properties", () => {
        expect(() =>
            parseProviderManifest(
                manifestDocument([implementation("domain.example", "1.0.0", digest)], { extra: true }),
            ),
        ).toThrow('unknown property "extra"');

        const source = JSON.stringify(manifestDocument([implementation("domain.example", "1.0.0", digest)])).replace(
            '"providerId":"ulvia.example"',
            '"providerId":"ulvia.example","providerId":"replacement"',
        );
        expect(() => parseProviderManifestJson(source)).toThrow("duplicate property");
    });

    test("rejects provider-controlled endpoint expansion", () => {
        expect(() =>
            parseProviderManifest(
                manifestDocument([implementation("domain.example", "1.0.0", digest)], {
                    endpoint: { allowedOrigins: ["http://provider.example.com"] },
                }),
            ),
        ).toThrow("HTTPS origin or loopback HTTP origin");
    });

    test("keeps secret values out of credential declarations", () => {
        expect(() =>
            parseProviderManifest(
                manifestDocument([implementation("domain.example", "1.0.0", digest)], {
                    credentialSlots: [
                        {
                            id: "provider-token",
                            label: "Provider token",
                            required: true,
                            secretType: "token",
                            value: "must-not-be-here",
                        },
                    ],
                }),
            ),
        ).toThrow('unknown property "value"');
    });

    test("rejects binary installation configuration", () => {
        expect(() =>
            parseProviderManifest(
                manifestDocument([implementation("domain.example", "1.0.0", digest)], {
                    configuration: {
                        type: "object",
                        properties: {
                            certificate: { type: "binary", maxBytes: 1024, mediaTypes: ["application/x-pem-file"] },
                        },
                        required: ["certificate"],
                    },
                }),
            ),
        ).toThrow("configuration cannot contain binary values");
    });

    test("normalizes set-like declarations with locale-independent ordinal order", () => {
        const parsed = parseProviderManifest(
            manifestDocument(
                [
                    implementation("domain.hotel", "1.0.0", digest, [
                        requirement("dependency.hotel", "hotel.run"),
                        requirement("dependency.chess", "chess.run"),
                        requirement("dependency.delta", "delta.run"),
                    ]),
                    implementation("domain.chess", "1.0.0", digest),
                    implementation("domain.delta", "1.0.0", digest),
                ],
                {
                    credentialSlots: ["hotel", "chess", "delta"].map((id) => ({
                        id,
                        label: id,
                        required: true,
                        secretType: "token",
                    })),
                },
            ),
        );

        expect(parsed.implementations.map((entry) => entry.contractId)).toEqual([
            "domain.chess",
            "domain.delta",
            "domain.hotel",
        ]);
        expect(parsed.implementations[2]?.requires.map((entry) => entry.contractId)).toEqual([
            "dependency.chess",
            "dependency.delta",
            "dependency.hotel",
        ]);
        expect(parsed.credentialSlots.map((slot) => slot.id)).toEqual(["chess", "delta", "hotel"]);
    });

    test("applies the canonical byte limit to object input", () => {
        expect(() =>
            parseProviderManifest(manifestDocument([implementation("domain.example", "1.0.0", digest)]), {
                ...DEFAULT_PROVIDER_MANIFEST_LIMITS,
                maxDocumentBytes: 64,
            }),
        ).toThrow("canonical manifest exceeds 64 bytes");
    });

    test("requires restore support before same-provider relocation", () => {
        expect(() =>
            parseProviderManifest(
                manifestDocument([implementation("domain.example", "1.0.0", digest)], {
                    recovery: {
                        backupFormatVersion: "provider-backup/v1",
                        compatibleBuildRange: "^1.0.0",
                        restore: false,
                        relocation: true,
                    },
                }),
            ),
        ).toThrow("relocation support requires restore support");
    });

    test("rejects relative HTTPS retention links", () => {
        for (const retentionPolicyUrl of ["https:example.com", "https:/example.com"]) {
            expect(() =>
                parseProviderManifest(
                    manifestDocument([implementation("domain.example", "1.0.0", digest)], {
                        dataPolicy: { residency: ["eu"], retentionPolicyUrl },
                    }),
                ),
            ).toThrow("absolute HTTPS URL");
        }
        expect(
            parseProviderManifest(
                manifestDocument([implementation("domain.example", "1.0.0", digest)], {
                    dataPolicy: { residency: ["eu"], retentionPolicyUrl: "https://example.com/retention" },
                }),
            ).dataPolicy.retentionPolicyUrl,
        ).toBe("https://example.com/retention");
    });
});
