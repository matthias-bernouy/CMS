import { describe, expect, test } from "bun:test";
import { dashboardReferenceFieldPaths, dashboardSecretRefPaths } from "../../src/exports";
import type { DashboardField } from "../../src/exports";

const fields: DashboardField[] = [
    { id: "key", label: "API key", type: "secret-ref", path: "connection.key" },
    { id: "note", label: "Note", type: "text", path: "note" },
    {
        id: "documents",
        label: "Documents",
        type: "reorderable-list",
        path: "documents",
        itemKey: "id",
        fields: [
            { id: "page", label: "Published page", type: "page-link", path: "page", publishedOnly: true },
            { id: "key", label: "Key", type: "secret-ref", path: "signing.key" },
        ],
    },
];

describe("declared dashboard reference paths", () => {
    test("uses schema fields, preserves row indices and never treats arbitrary text as a secret", () => {
        const values = {
            connection: { key: "${PAYMENT_KEY}" },
            note: "${NOT_A_GRANT}",
            documents: [{ page: "/terms" }, null, { page: "/privacy" }],
        };
        expect(dashboardSecretRefPaths(fields, values)).toEqual([
            "connection.key",
            "documents.0.signing.key",
            "documents.2.signing.key",
        ]);
        expect(
            dashboardReferenceFieldPaths(fields, values, "page-link").map(({ path, field }) => ({
                path,
                publishedOnly: field.type === "page-link" && field.publishedOnly,
            })),
        ).toEqual([
            { path: "documents.0.page", publishedOnly: true },
            { path: "documents.2.page", publishedOnly: true },
        ]);
    });
    test("does not traverse inherited properties or unsafe declared paths", () => {
        expect(dashboardSecretRefPaths(fields, Object.create({ documents: [{}] }))).toEqual(["connection.key"]);
        expect(
            dashboardSecretRefPaths([{ id: "unsafe", label: "Unsafe", type: "secret-ref", path: "__proto__.key" }], {}),
        ).toEqual([]);
    });
});
