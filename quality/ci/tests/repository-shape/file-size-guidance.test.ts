import { expect, test } from "bun:test";
import {
    countPhysicalLines,
    fileSizeException,
    findFileSizeFindings,
    isGovernedFile,
    LARGE_FILE_LINES,
    TARGET_FILE_LINES,
} from "../../repository-shape/file-size/check";

test("file-size guidance uses 150-line and 180-line review thresholds", () => {
    expect(TARGET_FILE_LINES).toBe(150);
    expect(LARGE_FILE_LINES).toBe(180);
    expect(countPhysicalLines("one\ntwo\n")).toBe(2);
    expect(countPhysicalLines("one\ntwo")).toBe(2);
    expect(countPhysicalLines("")).toBe(0);
});

test("file-size guidance covers handwritten repository files", () => {
    for (const path of [
        "source.ts",
        "module.mts",
        "test.tsx",
        "smoke.sql",
        "Dockerfile",
        "Dockerfile.dev",
        "page.mdx",
        "package.json",
        "quality.yml",
    ]) {
        expect(isGovernedFile(path)).toBeTrue();
    }
    for (const path of ["bun.lock", "README.md"]) {
        expect(isGovernedFile(path)).toBeFalse();
    }
});

test("file-size guidance ignores known generated and atomic files", () => {
    const generated = "packages/surfaces/cms-control/src/static/assets/control-components.js";
    expect(isGovernedFile(generated)).toBeFalse();
    expect(fileSizeException(generated)).toContain("generated");
    expect(isGovernedFile("quality/ci/coverage/baseline.json")).toBeFalse();
    const schema =
        "packages/resources/official-integrations/integrations/providers/demo/versions/1.0.0/connectors/supabase/schema.sql";
    expect(fileSizeException(schema)).toContain("atomic");
    const definition =
        "packages/resources/official-integrations/integrations/domains/commerce/versions/1.0.0/definition.json";
    expect(fileSizeException(definition)).toContain("atomic");
});

test("file-size guidance classifies every current file without a Git baseline", () => {
    const findings = findFileSizeFindings(
        new Map([
            ["small.ts", 150],
            ["review.ts", 151],
            ["edge.ts", 180],
            ["large.ts", 181],
        ]),
    );
    expect(findings).toEqual([
        { path: "edge.ts", currentLines: 180, severity: "info" },
        { path: "large.ts", currentLines: 181, severity: "warning" },
        { path: "review.ts", currentLines: 151, severity: "info" },
    ]);
});
