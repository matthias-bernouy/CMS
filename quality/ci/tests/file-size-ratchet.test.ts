import { expect, test } from "bun:test";
import {
    countPhysicalLines,
    fileSizeException,
    findFileSizeViolations,
    isGovernedFile,
    MAX_FILE_LINES,
    parseRenames,
    resolveFileSizeReference,
    TARGET_FILE_LINES,
} from "../file-size-ratchet";

test("file-size policy keeps a 150-line target and a 180-line hard cap", () => {
    expect(TARGET_FILE_LINES).toBe(150);
    expect(MAX_FILE_LINES).toBe(180);
    expect(countPhysicalLines("one\ntwo\n")).toBe(2);
    expect(countPhysicalLines("one\ntwo")).toBe(2);
    expect(countPhysicalLines("")).toBe(0);
});

test("file-size policy covers handwritten code, tests, styles, templates, and workflows", () => {
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
    const generated = "packages/surfaces/cms-control/src/static/assets/control-components.js";
    expect(isGovernedFile(generated)).toBeFalse();
    expect(fileSizeException(generated)).toContain("generated");
    expect(isGovernedFile("quality/ci/coverage-baseline.json")).toBeFalse();
    const schema = "packages/resources/official-integrations/integrations/demo/versions/1.0.0/connectors/supabase/schema.sql";
    expect(fileSizeException(schema)).toContain("atomic");
});

test("file-size policy rejects a new file above the hard cap", () => {
    expect(findFileSizeViolations(new Map([["new.ts", 181]]), new Map())).toEqual([
        {
            path: "new.ts",
            currentLines: 181,
            allowedLines: 180,
            reason: "new_over_limit",
        },
    ]);
});

test("file-size policy lets legacy files shrink but never grow", () => {
    expect(findFileSizeViolations(new Map([["legacy.ts", 250]]), new Map([["legacy.ts", 300]]))).toEqual([]);
    expect(findFileSizeViolations(new Map([["legacy.ts", 301]]), new Map([["legacy.ts", 300]]))).toEqual([
        {
            path: "legacy.ts",
            currentLines: 301,
            allowedLines: 300,
            reason: "legacy_growth",
        },
    ]);
});

test("file-size policy keeps the source allowance across a rename", () => {
    const renames = new Map([["new-name.ts", "old-name.ts"]]);
    const baseline = new Map([["old-name.ts", 240]]);
    expect(findFileSizeViolations(new Map([["new-name.ts", 240]]), baseline, renames)).toEqual([]);
    expect(findFileSizeViolations(new Map([["new-name.ts", 241]]), baseline, renames)).toHaveLength(1);
});

test("file-size rename parsing carries only Git rename records", () => {
    const parsed = parseRenames("M\0kept.ts\0R095\0old.ts\0new.ts\0A\0added.ts\0");
    expect([...parsed]).toEqual([["new.ts", "old.ts"]]);
});

test("file-size reference treats an initial-push zero like an absent reference", () => {
    expect(resolveFileSizeReference("0000000000000000000000000000000000000000")).toBe(
        resolveFileSizeReference(undefined),
    );
});
