import { expect, test } from "bun:test";
import { formatSummaryReport } from "../../check-all/report";
import { reviewBlock } from "../../check-all/review";
import type { CheckResult } from "../../check-all/types";
const check = (output: string, exitCode = 0): CheckResult => ({
    id: "shape",
    label: "Shape",
    args: [],
    exitCode,
    stdout: output,
    stderr: "",
});
const unrelated = "[file-size][WARNING] packages/other/file.ts: 240 lines";
const changed = "[file-size][WARNING] packages/changed/file.ts: 250 lines";

test("compact output counts unrelated advice and preserves changed-file findings", () => {
    const result = formatSummaryReport([check(`${unrelated}\n${changed}`)], {
        changedPaths: ["packages/changed/file.ts"],
    });
    expect(result).toStartWith("[check:all][SUMMARY] 1 passed, 0 failed");
    expect(result).toContain(changed);
    expect(result).not.toContain(unrelated);
    expect(result).toContain("1 other advisory findings");
    expect(result).toContain("not a security or performance review");
});
test("blocking errors outside changed files and failed tool output are always visible", () => {
    const error = "[directory-fanout][ERROR] packages/other: 9 entries";
    expect(formatSummaryReport([check(error)], { changedPaths: [] })).toContain(error);
    const failure = formatSummaryReport([{ ...check("unexpected diagnostics", 2), stderr: "fatal failure" }], {
        changedPaths: [],
    });
    expect(failure).toContain("unexpected diagnostics");
    expect(failure).toContain("fatal failure");
    expect(failure).toContain("0 passed, 1 failed");
    expect(failure).toContain("Review:");
});
test("verbose output preserves all successful diagnostics", () => {
    expect(formatSummaryReport([check(unrelated)], { changedPaths: [], verbose: true })).toContain(unrelated);
});
test("directory findings include changed descendants, without substring matches", () => {
    const line = "[directory-fanout][INFO] packages/feature: 8 entries";
    expect(formatSummaryReport([check(line)], { changedPaths: ["packages/feature/new.ts"] })).toContain(line);
    expect(formatSummaryReport([check(line)], { changedPaths: ["packages/feature-other/new.ts"] })).not.toContain(line);
});
test("documentation gets a single review line; shared code still gets caller guidance", () => {
    expect(reviewBlock(["docs/README.md", "AGENTS.md"])).toEqual([
        "Review: documentation only; check accuracy and local links.",
    ]);
    expect(reviewBlock(["packages/features/cms-gateway/src/access/Cache.ts"]).join("\n")).toContain(
        "Instance isolation",
    );
    expect(reviewBlock(["packages/foundation/shared.ts"]).join("\n")).toContain("affected callers");
});

test("UI diagnostics retain rule tags and multiline guidance for changed files", () => {
    const output =
        "[ui-contracts][WARNING][network] packages/changed/file.ts:3:4\n  Use the supported boundary.\n[ui-contracts][INFO][network] packages/other/file.ts:1:2\n  Other guidance.";
    const compact = formatSummaryReport([check(output)], { changedPaths: ["packages/changed/file.ts"] });
    expect(compact).toContain("[WARNING][network]");
    expect(compact).toContain("Use the supported boundary.");
    expect(compact).not.toContain("Other guidance.");
    expect(compact).toContain("1 other advisory findings");
});
