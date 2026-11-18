import { expect, test } from "bun:test";
import { performanceOptions } from "./options";

test("default performance options keep the full campaign while exact selections deduplicate", () => {
    expect(performanceOptions([])).toEqual({ list: false, scenarioIds: [] });
    expect(performanceOptions(["--scenario", "files.read", "--scenario", "files.read", "--scenario", "other"])).toEqual(
        { list: false, scenarioIds: ["files.read", "other"] },
    );
    expect(performanceOptions(["--reference", "reference-id", "--scenario", "files.read"]).referenceId).toBe(
        "reference-id",
    );
});

test("list can select exact IDs but refuses comparison and malformed arguments", () => {
    expect(performanceOptions(["--list", "--scenario", "files.read"]).list).toBe(true);
    for (const args of [
        ["--unknown"],
        ["files.read"],
        ["--scenario"],
        ["--scenario", ""],
        ["--scenario", "--list"],
        ["--list", "--list"],
        ["--reference", "a", "--reference", "b"],
        ["--list", "--reference", "a"],
    ]) {
        expect(() => performanceOptions(args)).toThrow("Usage:");
    }
});
