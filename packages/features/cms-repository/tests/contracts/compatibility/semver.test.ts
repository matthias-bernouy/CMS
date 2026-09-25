import { describe, expect, test } from "bun:test";
import { compareSemVer, versionBump } from "@bernouy/cms-repository/contracts/compatibility";

describe("SemVer comparison", () => {
    test("preserves arbitrary numeric core precision", () => {
        expect(compareSemVer("9007199254740993.0.0", "9007199254740992.0.0")).toBe(1);
        expect(compareSemVer("1.9007199254740993.0", "1.9007199254740992.0")).toBe(1);
        expect(compareSemVer("1.0.9007199254740993", "1.0.9007199254740992")).toBe(1);
        expect(versionBump("9007199254740992.0.0", "9007199254740993.0.0")).toBe("major");
    });

    test("preserves arbitrary numeric prerelease precision", () => {
        expect(compareSemVer("1.0.0-9007199254740993", "1.0.0-9007199254740992")).toBe(1);
        expect(compareSemVer("1.0.0-9007199254740992", "1.0.0-9007199254740993")).toBe(-1);
    });
});
