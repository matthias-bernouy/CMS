import { describe, expect, test } from "bun:test";
import { DEFAULT_RELEASE_LIMITS } from "@bernouy/cms-repository/contracts";
import { objectSchema, stringSchema } from "../../support/fixtures";
import { controls, paginated, pagination, target } from "./fixtures";

const cursor = { ...stringSchema(64), nullable: true };
const items = { type: "array", maxItems: 10, items: objectSchema({ id: stringSchema() }, ["id"]) };

describe("declarative pagination walks", () => {
    test("admits bounded walks and optional item identity checks", () => {
        expect(controls({ pagination }, paginated())).toEqual({ pagination });
        const { uniqueBy: _, ...withoutIdentity } = pagination;
        expect(controls({ pagination: withoutIdentity }, paginated())).toEqual({ pagination: withoutIdentity });
    });

    test("requires a successful sync query and forbids ambiguous captures", () => {
        expect(() => controls({ pagination }, target())).toThrow("successful sync query");
        expect(() =>
            controls({ pagination, expect: { kind: "error", code: "INVALID_RECIPIENT" } }, paginated()),
        ).toThrow("successful sync query");
        expect(() => controls({ pagination, captures: [] }, paginated())).toThrow("cannot capture");
    });

    test.each([0, 101, 1.5])("bounds maxPages: %s", (maxPages) => {
        expect(() => controls({ pagination: { ...pagination, maxPages } }, paginated())).toThrow();
    });

    test("honors configured page limits and rejects unknown control fields", () => {
        const limits = { ...DEFAULT_RELEASE_LIMITS, maxConformancePages: 2 };
        expect(() => controls({ pagination }, paginated(), limits)).toThrow("between 1 and 2");
        expect(() => controls({ pagination: { ...pagination, extra: true } }, paginated())).toThrow("unknown property");
    });

    test.each([
        objectSchema({ items, next: cursor }, ["items"]),
        objectSchema({ items, next: stringSchema(64) }, ["items", "next"]),
        objectSchema({ items, next: { type: "integer", nullable: true } }, ["items", "next"]),
    ])("requires a guaranteed nullable string cursor: %j", (output) => {
        expect(() => controls({ pagination }, paginated({ output }))).toThrow();
    });

    test.each([
        objectSchema({ cursor }, ["cursor"]),
        objectSchema({ cursor: stringSchema(64) }),
        objectSchema({ different: cursor }),
        { ...objectSchema({ cursor }), minProperties: 1 },
    ])("requires a genuinely optional nullable input cursor: %j", (input) => {
        expect(() => controls({ pagination }, paginated({ input }))).toThrow("optional nullable string");
    });

    test("requires all non-null output cursor values to fit the input domain", () => {
        const input = objectSchema({ cursor: { ...stringSchema(32), nullable: true } });
        expect(() => controls({ pagination }, paginated({ input }))).toThrow("not proven valid");
        const narrowed = { type: "string", maxLength: 64, enum: ["next"], nullable: true };
        const output = objectSchema({ items, next: narrowed }, ["items", "next"]);
        expect(() => controls({ pagination }, paginated({ input, output }))).not.toThrow();
    });

    test.each([
        objectSchema({ items, next: cursor }, ["next"]),
        objectSchema({ items: { ...items, nullable: true }, next: cursor }, ["items", "next"]),
        objectSchema({ items: stringSchema(), next: cursor }, ["items", "next"]),
    ])("requires a guaranteed non-null items array: %j", (output) => {
        expect(() => controls({ pagination }, paginated({ output }))).toThrow();
    });

    test.each([
        objectSchema({ id: stringSchema() }),
        objectSchema({ id: { ...stringSchema(), nullable: true } }, ["id"]),
        objectSchema({ id: { type: "number" } }, ["id"]),
        objectSchema({ id: { type: "boolean" } }, ["id"]),
    ])("requires a guaranteed non-null string or integer identity: %j", (item) => {
        const output = objectSchema({ items: { ...items, items: item }, next: cursor }, ["items", "next"]);
        expect(() => controls({ pagination }, paginated({ output }))).toThrow();
    });

    test("supports integer identities and scalar-item identity at the root path", () => {
        for (const item of [{ type: "integer" }, stringSchema()]) {
            const output = objectSchema({ items: { ...items, items: item }, next: cursor }, ["items", "next"]);
            expect(() =>
                controls({ pagination: { ...pagination, uniqueBy: "" } }, paginated({ output })),
            ).not.toThrow();
        }
    });

    test("checks that continuation cursors fit the authored input's property budget", () => {
        const input = { ...objectSchema({ cursor, filter: stringSchema() }), maxProperties: 1 };
        const capability = paginated({ input });
        expect(() => controls({ pagination, input: { filter: "active" } }, capability)).toThrow(
            "would exceed input maxProperties",
        );
        expect(() => controls({ pagination, input: { cursor: null } }, capability)).not.toThrow();
    });

    test("understands escaped literal roots without treating captured root shape as known", () => {
        expect(() => controls({ pagination, input: { $literal: { filter: "active" } } }, paginated())).not.toThrow();
        expect(() => controls({ pagination, input: { $capture: "previous-input" } }, paginated())).toThrow(
            "literal root properties",
        );
    });
});
