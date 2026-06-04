import { describe, test, expect } from "bun:test";
import { lineSvg, barsHtml, formatValue } from "../src/ui/Dataviz/charts";

describe("formatValue", () => {
    test("int → fr thousands grouping", () => expect(formatValue(21284, "int")).toMatch(/21.284/));
    test("ms", () => expect(formatValue(42, "ms")).toBe("42 ms"));
    test("pct → fraction to fr percent", () => expect(formatValue(0.012, "pct")).toBe("1,2 %"));
});

describe("lineSvg", () => {
    test("empty → ''", () => expect(lineSvg([])).toBe(""));
    test("renders area + polyline + a dot per point + gradient fill", () => {
        const svg = lineSvg([{ label: "a", value: 1 }, { label: "b", value: 2 }, { label: "c", value: 1 }]);
        expect(svg).toContain("<polyline");
        expect(svg).toContain("<polygon");
        expect((svg.match(/<circle/g) ?? []).length).toBe(3);
        expect(svg).toContain('fill="url(#lc-grad)"');
    });
});

describe("barsHtml", () => {
    test("empty → ''", () => expect(barsHtml([], false)).toBe(""));
    test("bar width = share of total; show-count prints the count too", () => {
        const html = barsHtml([{ label: "/a", value: 75 }, { label: "/b", value: 25 }], true);
        expect((html.match(/class="bar"/g) ?? []).length).toBe(2);
        expect(html).toContain('width="75.0"');
        expect(html).toContain('width="25.0"');
        expect(html).toContain("75 · 75,0 %");
    });
    test("escapes keys (no HTML injection)", () => {
        expect(barsHtml([{ label: "<x>", value: 1 }], false)).toContain("&lt;x&gt;");
    });
});
