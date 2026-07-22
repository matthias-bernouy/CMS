import { describe, expect, test } from "bun:test";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";

describe("integration artifact icon parsing", () => {
    test("accepts semantic names and SVG asset references for sources and dashboards", () => {
        const definition = parseIntegrationDefinition({
            kind: "icons",
            label: "Icons",
            inputs: [],
            artifacts: [
                sourceArtifact({ path: "assets/source.svg" }),
                dashboardArtifact({ path: "assets/dashboard.svg" }),
                dashboardArtifact("layout", "semantic-dashboard"),
            ],
        });
        const [source, dashboard, semantic] = definition.artifacts ?? [];

        expect(source?.type === "source" ? source.source.meta.icon : null).toBe("assets/source.svg");
        expect(dashboard?.type === "dashboard" ? dashboard.dashboard.meta?.icon : null).toBe("assets/dashboard.svg");
        expect(semantic?.type === "dashboard" ? semantic.dashboard.meta?.icon : null).toBe("layout");
    });

    test("rejects structured icon references outside assets or with a raster extension", () => {
        expect(() => definitionWithIcon({ path: "../icon.svg" })).toThrow(/must reference an SVG inside assets/);
        expect(() => definitionWithIcon({ path: "assets/icon.png" })).toThrow(/must reference an SVG inside assets/);
        expect(() => definitionWithIcon("assets/../icon.svg")).toThrow(/must reference an SVG inside assets/);
        expect(() => definitionWithIcon("assets\\icon.svg")).toThrow(/must reference an SVG inside assets/);
    });
});

function definitionWithIcon(icon: unknown): void {
    parseIntegrationDefinition({
        kind: "invalid-icon",
        label: "Invalid",
        inputs: [],
        artifacts: [sourceArtifact(icon)],
    });
}

function sourceArtifact(icon: unknown): Record<string, unknown> {
    return {
        type: "source",
        source: { id: "items", meta: { name: "Items", icon }, endpoints: [] },
    };
}

function dashboardArtifact(icon: unknown, id = "items-dashboard"): Record<string, unknown> {
    return {
        type: "dashboard",
        dashboard: { id, source: "items", meta: { name: "Items", icon }, views: [] },
    };
}
