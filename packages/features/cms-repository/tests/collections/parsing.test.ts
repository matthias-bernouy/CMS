import { describe, expect, test } from "bun:test";
import {
    DEFAULT_COLLECTION_LIMITS,
    parseCollectionRelease,
    parseCollectionReleaseJson,
} from "@bernouy/cms-repository/collections";
import { canonicalIJsonBytes } from "@bernouy/cms-repository/contracts/protocol";
import { collectionDocument } from "./fixtures";

describe("collection release parsing", () => {
    test("reports validation paths in the collection document", () => {
        try {
            parseCollectionRelease({ ...collectionDocument(), version: "v1.0.0" });
            throw new Error("Expected rejection");
        } catch (error) {
            expect(error).toMatchObject({ code: "invalid_collection", path: "$.version" });
        }
        try {
            parseCollectionRelease({
                ...collectionDocument(),
                configuration: {
                    schema: { type: "object", properties: { title: { type: "string", maxLength: -1 } }, required: [] },
                    defaults: {},
                },
            });
            throw new Error("Expected rejection");
        } catch (error) {
            expect(error).toMatchObject({
                code: "invalid_collection",
                path: "$.configuration.schema.properties.title.maxLength",
            });
        }
    });

    test("normalizes resource order and locale into independent immutable data", () => {
        const source = collectionDocument();
        source.locale = "en-us";
        const parsed = parseCollectionRelease(source);
        expect(parsed.locale).toBe("en-US");
        expect(parsed.blocs.map((bloc) => bloc.id)).toEqual(["atlas-page", "atlas-panel"]);
        expect(Object.isFrozen(source.blocs)).toBe(false);
        expect(Object.isFrozen(parsed.blocs)).toBe(true);
        (source.blocs as Record<string, unknown>[])[0]!.shadowdom = "Changed";
        expect(parsed.blocs.find((bloc) => bloc.kind === "component")!.shadowdom).toContain("<section>");
        expect(parseCollectionReleaseJson(JSON.stringify(parsed))).toEqual(parsed);
    });

    test("rejects unsupported fields and malformed identity or version metadata", () => {
        for (const patch of [
            { providerId: "provider" },
            { imports: [] },
            { views: null },
            { locale: "en_US" },
            { kind: "contract" },
            { protocol: "ulvia-provider/v1" },
            { assets: null },
            { blocs: null },
            ...["v1.0.0", "1.0", "01.0.0", "1.0.0-01", "^1.0.0"].map((version) => ({ version })),
        ]) {
            expect(() => parseCollectionRelease({ ...collectionDocument(), ...patch })).toThrow();
        }
    });

    test("uses the same byte and depth limits for object and JSON entry points", () => {
        const source = parseCollectionRelease(collectionDocument());
        const byteLength = canonicalIJsonBytes(source).byteLength;
        const limits = { ...DEFAULT_COLLECTION_LIMITS, maxDocumentBytes: byteLength };
        expect(parseCollectionRelease(source, limits)).toEqual(source);
        expect(parseCollectionReleaseJson(JSON.stringify(source), limits)).toEqual(source);
        for (const override of [{ maxDocumentBytes: byteLength - 1 }, { maxJsonDepth: 2 }]) {
            const constrained = { ...DEFAULT_COLLECTION_LIMITS, ...override };
            expect(() => parseCollectionRelease(source, constrained)).toThrow();
            expect(() => parseCollectionReleaseJson(JSON.stringify(source), constrained)).toThrow();
        }
    });

    test("rejects invalid I-JSON before traversing resources", () => {
        const source = collectionDocument();
        expect(() => parseCollectionRelease({ ...source, blocs: Array(1) })).toThrow();
        expect(() => parseCollectionReleaseJson('{"kind":"collection","kind":"collection"}')).toThrow();
        expect(() => parseCollectionReleaseJson(new Uint8Array([0xff]))).toThrow();
        let reads = 0;
        const accessor = Object.defineProperty({ ...source }, "blocs", {
            enumerable: true,
            get() {
                reads += 1;
                return [];
            },
        });
        expect(() => parseCollectionRelease(accessor)).toThrow();
        expect(reads).toBe(0);
    });

    test("bounds schema/defaults and preserves custom schema limits", () => {
        const configuration = {
            schema: {
                type: "object",
                properties: { label: { type: "string", maxLength: 10000 } },
                required: ["label"],
            },
            defaults: { label: "Welcome" },
        };
        const source = { ...collectionDocument(), configuration };
        expect(() => parseCollectionRelease(source)).toThrow();
        const limits = {
            ...DEFAULT_COLLECTION_LIMITS,
            schema: { ...DEFAULT_COLLECTION_LIMITS.schema, maxStringLength: 10000 },
        };
        expect(parseCollectionRelease(source, limits).configuration).toEqual(configuration);
        expect(parseCollectionReleaseJson(JSON.stringify(source), limits).configuration).toEqual(configuration);
        for (const patch of [
            { defaults: {} },
            { defaults: { label: 1 } },
            { defaults: { label: "OK", extra: true } },
            { schema: { ...configuration.schema, nullable: true } },
            {
                schema: {
                    type: "object",
                    properties: { file: { type: "binary", maxBytes: 8, mediaTypes: ["image/png"] } },
                    required: [],
                },
            },
        ]) {
            expect(() =>
                parseCollectionRelease({ ...source, configuration: { ...configuration, ...patch } }, limits),
            ).toThrow();
        }
    });
});
