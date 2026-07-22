import { describe, expect, test } from "bun:test";
import { parseRelationDashboardActions } from "cms-integrations/core/parsing/artifacts/relations/relationDashboardActions";

describe("relation dashboard action parsing", () => {
    test("parses display metadata and a fully mapped endpoint", () => {
        expect(
            parseRelationDashboardActions(
                [
                    {
                        id: "refund",
                        label: "Refund",
                        icon: "rotate-ccw",
                        tone: "danger",
                        placement: "row",
                        endpoint: {
                            sourceId: "payments",
                            endpointId: "refund",
                            params: { saleId: "$resource.id" },
                            body: { reason: "$field.reason" },
                        },
                    },
                ],
                "relation.actions",
            ),
        ).toEqual([
            {
                id: "refund",
                label: "Refund",
                icon: "rotate-ccw",
                tone: "danger",
                placement: "row",
                endpoint: {
                    sourceId: "payments",
                    endpointId: "refund",
                    params: { saleId: "$resource.id" },
                    body: { reason: "$field.reason" },
                },
            },
        ]);
    });

    test("rejects malformed action and endpoint containers", () => {
        expect(() => parseRelationDashboardActions({}, "relation.actions")).toThrow("must be an array");
        expect(() => parseRelationDashboardActions([null], "relation.actions")).toThrow(
            "relation.actions.0: must be an object",
        );
        expect(() =>
            parseRelationDashboardActions([{ id: "refund", label: "Refund", endpoint: null }], "relation.actions"),
        ).toThrow("relation.actions.0.endpoint: must be an object");
    });
});
