import { describe, expect, test } from "bun:test";
import {
    ContentValidationError,
    validateBlocWrite,
    validateSiteBlocDefinition,
    validateSiteBlocSnapshot,
} from "@bernouy/cms-content";
import { siteBlocArtifact, siteBlocDefinition, siteBlocSnapshot } from "../blocs/siteBlocFixture";

describe("site bloc validation", () => {
    test("keeps composition templates and component views mutually exclusive", () => {
        const artifact = siteBlocArtifact();

        expect(validateBlocWrite({ ...artifact, viewJS: "", compositionHTML: "<slot></slot>" }).compositionHTML).toBe(
            "<slot></slot>",
        );
        expect(() => validateBlocWrite({ ...artifact, compositionHTML: "<slot></slot>" })).toThrow(
            ContentValidationError,
        );
        expect(() => validateBlocWrite({ ...artifact, viewJS: "", compositionHTML: "  " })).toThrow(
            ContentValidationError,
        );
        expect(() => validateBlocWrite({ ...artifact, internal: true, viewJS: "" })).toThrow(ContentValidationError);
    });

    test("rejects malformed runtime ownership without throwing native type errors", () => {
        for (const ownership of [
            null,
            { kind: "unknown" },
            { kind: "site-builder", definitionId: 42 },
            { kind: "integration", integrationKind: "catalogue", installationId: "install-1" },
        ]) {
            expect(() => validateBlocWrite({ ...siteBlocArtifact(), ownership } as never)).toThrow(
                ContentValidationError,
            );
        }

        const { ownership: _ownership, ...legacyWrite } = siteBlocArtifact();
        expect(validateBlocWrite(legacyWrite).ownership).toEqual({ kind: "code-managed" });
    });

    test("accepts only site-prefixed definitions with matching ownership", () => {
        expect(validateSiteBlocDefinition(siteBlocDefinition()).tag).toBe("site-feature-panel");
        expect(() => validateSiteBlocDefinition(siteBlocDefinition({ tag: "custom-panel" }))).toThrow(
            ContentValidationError,
        );
        expect(() =>
            validateSiteBlocDefinition(
                siteBlocDefinition({
                    ownership: { kind: "site-builder", definitionId: "another-definition" },
                }),
            ),
        ).toThrow(ContentValidationError);
    });

    test("derives sorted dependencies and accepts static private text", () => {
        const valid = validateSiteBlocSnapshot(
            siteBlocSnapshot({
                structure: [
                    { kind: "text", value: "Shared navigation" },
                    { kind: "bloc", tag: "z-card", attributes: {}, children: [] },
                    { kind: "bloc", tag: "a-card", attributes: {}, children: [] },
                    { kind: "bloc", tag: "z-card", attributes: {}, children: [] },
                ],
                dependencies: ["caller-input"],
            }),
            "site-feature-panel",
        );
        expect(valid.dependencies).toEqual(["a-card", "z-card"]);
        expect(valid.structure[0]).toEqual({ kind: "text", value: "Shared navigation" });
        expect(() =>
            validateSiteBlocSnapshot(siteBlocSnapshot({ structure: [{ kind: "text", value: "{{ private.value }}" }] })),
        ).toThrow(ContentValidationError);
    });

    test("rejects unknown slots, duplicate ids, self references, and invalid public names", () => {
        expect(() =>
            validateSiteBlocSnapshot(siteBlocSnapshot({ structure: [{ kind: "slot", slotId: "missing" }] })),
        ).toThrow(ContentValidationError);
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    slots: [
                        ...siteBlocSnapshot().slots,
                        { id: "body", label: "Duplicate", accepts: [{ kind: "any-component" }] },
                    ],
                }),
            ),
        ).toThrow(ContentValidationError);
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    slots: [{ id: "", label: "Empty id", accepts: [{ kind: "any-component" }] }],
                }),
            ),
        ).toThrow(ContentValidationError);
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    structure: [{ kind: "bloc", tag: "site-feature-panel", attributes: {}, children: [] }],
                }),
                "site-feature-panel",
            ),
        ).toThrow(ContentValidationError);
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    slots: [
                        {
                            id: "body",
                            label: "Body",
                            slot: "Bad Name",
                            accepts: [{ kind: "any-component" }],
                        },
                    ],
                }),
            ),
        ).toThrow(ContentValidationError);
    });

    test("rejects malformed runtime slot and attribute shapes with domain errors", () => {
        expect(() => validateSiteBlocSnapshot(siteBlocSnapshot({ slots: [null] as never }))).toThrow(
            ContentValidationError,
        );
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    structure: [
                        {
                            kind: "bloc",
                            tag: "basic-card",
                            attributes: { tone: 42 },
                            children: [],
                        } as never,
                    ],
                }),
            ),
        ).toThrow(ContentValidationError);
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    slots: [
                        {
                            id: "body",
                            label: "Body",
                            slot: 42,
                            accepts: [{ kind: "any-component" }],
                        } as never,
                    ],
                }),
            ),
        ).toThrow(ContentValidationError);
    });

    test("validates slot cardinality and publication metadata", () => {
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    slots: [
                        {
                            id: "body",
                            label: "Body",
                            min: 2,
                            max: 1,
                            accepts: [{ kind: "any-component" }],
                        },
                    ],
                }),
            ),
        ).toThrow(ContentValidationError);
        expect(() => validateSiteBlocDefinition(siteBlocDefinition({ publishedRevision: 1, published: null }))).toThrow(
            ContentValidationError,
        );
    });
});
