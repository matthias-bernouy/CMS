import { describe, expect, test } from "bun:test";
import {
    admitContractRelease,
    computeReleaseDigest,
    DEFAULT_RELEASE_LIMITS,
    parseContractRelease,
    parseContractReleaseJson,
    ReleaseValidationError,
} from "@bernouy/cms-repository/contracts";
import { capabilityDocument, contractDocument, objectSchema, stringSchema } from "../support/fixtures";

describe("contract release parsing", () => {
    test("returns a normalized immutable contract release", () => {
        const release = parseContractRelease(contractDocument());

        expect(release.contractId).toBe("communication.email");
        expect(release.capabilities[0]?.id).toBe("email.message.send");
        expect(Object.isFrozen(release)).toBe(true);
        expect(Object.isFrozen(release.capabilities[0]?.input.properties)).toBe(true);
    });

    test("admits one immutable release artifact with compiled bindings and digest", async () => {
        const admitted = await admitContractRelease(contractDocument());

        expect(admitted.kind).toBe("admitted-contract-release");
        expect(admitted.bindings[0]?.capabilityId).toBe("email.message.send");
        expect(admitted.canonicalJson).toContain('"contractId":"communication.email"');
        expect(admitted.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(Object.isFrozen(admitted)).toBe(true);
    });

    test("rejects duplicate JSON properties before JSON.parse can hide them", () => {
        const source = JSON.stringify(contractDocument()).replace(
            '"contractId":"communication.email"',
            '"contractId":"communication.email","contractId":"replacement"',
        );

        expect(() => parseContractReleaseJson(source)).toThrow(ReleaseValidationError);
        try {
            parseContractReleaseJson(source);
        } catch (error) {
            expect((error as ReleaseValidationError).code).toBe("duplicate_json_property");
        }
    });

    test("rejects unknown fields and capability-level versions", () => {
        expect(() => parseContractRelease({ ...contractDocument(), surprise: true })).toThrow("unknown property");

        const document = contractDocument();
        document.capabilities = [{ ...(document.capabilities as Record<string, unknown>[])[0], version: "1.0.0" }];
        expect(() => parseContractRelease(document)).toThrow('unknown property "version"');
    });

    test("requires canonical SemVer on the release", () => {
        expect(() => parseContractRelease(contractDocument({ version: "v1.0" }))).toThrow("canonical SemVer");
        expect(() => parseContractRelease(contractDocument({ version: "01.0.0" }))).toThrow("canonical SemVer");
        expect(parseContractRelease(contractDocument({ version: "1.2.3-beta.1+build.4" })).version).toBe(
            "1.2.3-beta.1+build.4",
        );
    });

    test("requires a publisher ID without accepting author-supplied publication time", () => {
        const { publisherId: _, ...missingPublisher } = contractDocument();

        expect(() => parseContractRelease(missingPublisher)).toThrow("$.publisherId: must be a string");
        expect(() => parseContractRelease(contractDocument({ publisherId: "Third Party" }))).toThrow(
            "must be a lowercase dotted identifier",
        );
        expect(() => parseContractRelease(contractDocument({ publishedAt: "2026-09-22T00:00:00Z" }))).toThrow(
            'unknown property "publishedAt"',
        );
        expect(() => parseContractRelease(contractDocument({ provenance: { publisherId: "ulvia.official" } }))).toThrow(
            'unknown property "provenance"',
        );
    });

    test("accepts the three human access levels and rejects the former audience model", () => {
        for (const access of ["public", "authenticated", "admin"]) {
            const release = parseContractRelease(contractDocument({ capabilities: [capabilityDocument({ access })] }));
            expect(release.capabilities[0]?.access).toBe(access);
        }

        expect(() =>
            parseContractRelease(contractDocument({ capabilities: [capabilityDocument({ access: "operator" })] })),
        ).toThrow('unsupported value "operator"');
        expect(() =>
            parseContractRelease(
                contractDocument({ capabilities: [capabilityDocument({ access: "admin", audience: "operator" })] }),
            ),
        ).toThrow('unknown property "audience"');
    });

    test("computes the same digest regardless of object key insertion order", async () => {
        const release = parseContractRelease(contractDocument());
        const reordered = { ...release, name: release.name, contractId: release.contractId };

        expect(await computeReleaseDigest(release)).toBe(await computeReleaseDigest(reordered));
        expect(await computeReleaseDigest(release)).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    test("refuses to hash a release that has not passed structural validation", async () => {
        await expect(computeReleaseDigest({ ...contractDocument(), unknown: true })).rejects.toThrow(
            'unknown property "unknown"',
        );
    });

    test("refuses to hash a release with invalid binding semantics", async () => {
        const document = contractDocument();
        const capability = (document.capabilities as Record<string, unknown>[])[0]!;
        capability.binding = {
            ...(capability.binding as Record<string, unknown>),
            response: {
                successStatuses: [400],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_RECIPIENT: 422 },
            },
        };

        await expect(computeReleaseDigest(document)).rejects.toThrow("success statuses must be 2xx");
    });

    test("applies the configured JSON depth limit to object input", () => {
        const limits = { ...DEFAULT_RELEASE_LIMITS, maxJsonDepth: 4 };

        expect(() => parseContractRelease(contractDocument(), limits)).toThrow("exceeds nesting depth 4");
        expect(() => parseContractReleaseJson(JSON.stringify(contractDocument()), limits)).toThrow(
            "exceeds nesting depth 4",
        );
    });

    test("rejects a nullable capability input root", () => {
        const input = objectSchema({ id: stringSchema(64) }, ["id"]);
        input.nullable = true;
        const capability = capabilityDocument({
            input,
            binding: {
                transport: "http",
                method: "GET",
                path: "/v1/messages/{id}",
                input: { path: { id: "id" } },
                response: {
                    successStatuses: [200],
                    contentTypes: ["application/json"],
                    errorStatuses: { INVALID_RECIPIENT: 422 },
                },
            },
        });

        expect(() => parseContractRelease(contractDocument({ capabilities: [capability] }))).toThrow(
            "capability input root must be non-nullable",
        );
    });
});
