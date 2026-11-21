import { expect, test } from "bun:test";
import { parseDateTime } from "@bernouy/ulvia-providers/validation";

test.each([
    "0000-02-29T00:00:00Z",
    "2000-02-29T23:59:59Z",
    "2024-02-29T12:34:56.123456789Z",
    "2024-04-30T00:00:00+23:59",
    "9999-12-31T23:59:59-23:59",
    `2024-02-29T00:00:00.${"1".repeat(43)}Z`,
])("Provider timestamps preserve the accepted string: %s", (value) => {
    expect(parseDateTime(value, "$.publishedAt")).toBe(value);
});

test.each([
    "1900-02-29T00:00:00Z",
    "2023-02-29T00:00:00Z",
    "2024-04-31T00:00:00Z",
    "2024-00-01T00:00:00Z",
    "2024-13-01T00:00:00Z",
    "2024-01-00T00:00:00Z",
    "2024-01-01T24:00:00Z",
    "2024-01-01T00:60:00Z",
    "2024-01-01T00:00:60Z",
    "2024-01-01T00:00:00+24:00",
    "2024-01-01T00:00:00-00:60",
    "2024-01-01T00:00:00",
    "2024-01-01t00:00:00z",
    "2024-01-01T00:00:00.Z",
    "2024-01-01T00:00:00Z\n",
    "2024-01-01T00:00:00Z\r\n",
    " 2024-01-01T00:00:00Z",
])("invalid Provider timestamps preserve the refusal code, path and message: %s", (value) => {
    expect(() => parseDateTime(value, "$.publishedAt")).toThrow(
        expect.objectContaining({
            code: "invalid_manifest",
            path: "$.publishedAt",
            message: "$.publishedAt: must be a valid date-time",
        }),
    );
});

test("Provider timestamp bounds and non-string errors remain specific to the field", () => {
    for (const value of [undefined, null, 0, {}, ""]) {
        expect(() => parseDateTime(value, "$.updatedAt")).toThrow(
            expect.objectContaining({
                code: "invalid_manifest",
                path: "$.updatedAt",
                message: "$.updatedAt: must be a non-empty string",
            }),
        );
    }
    expect(() => parseDateTime(`2024-02-29T00:00:00.${"1".repeat(44)}Z`, "$.updatedAt")).toThrow(
        expect.objectContaining({
            code: "invalid_manifest",
            path: "$.updatedAt",
            message: "$.updatedAt: must not exceed 64 characters",
        }),
    );
});
