import { describe, expect, test } from "bun:test";
import { isDashboardRelationProjection, isRelation } from "cms-cli/dev-server/relationShapes";

describe("relation shape guards", () => {
    test("accepts a complete CMS relation and rejects incomplete lookalikes", () => {
        const relation = {
            id: "orders-to-customers",
            from: { sourceId: "orders" },
            to: { sourceId: "customers" },
            cardinality: "many",
            binding: { type: "field", field: "customerId" },
        };

        expect(isRelation(relation)).toBe(true);
        expect(isRelation(null)).toBe(false);
        expect(isRelation([relation])).toBe(false);
        expect(isRelation({ ...relation, cardinality: "optional" })).toBe(false);
        expect(isRelation({ ...relation, binding: null })).toBe(false);
    });

    test("accepts dashboard projections only when every identifier is present", () => {
        const projection = {
            type: "dashboardRelation",
            relationId: "orders-to-customers",
            dashboardId: "commerce",
            viewId: "orders",
            widget: "table",
        };

        expect(isDashboardRelationProjection(projection)).toBe(true);
        expect(isDashboardRelationProjection({ ...projection, type: "relation" })).toBe(false);
        expect(isDashboardRelationProjection({ ...projection, viewId: 42 })).toBe(false);
        expect(isDashboardRelationProjection([])).toBe(false);
    });
});
