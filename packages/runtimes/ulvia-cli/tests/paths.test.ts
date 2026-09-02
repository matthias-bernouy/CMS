import { describe, expect, test } from "bun:test";
import { resolveUlviaPaths } from "../src/runtime/paths";

describe("Ulvia persistent data paths", () => {
    test("prefers the explicit application data directory", () => {
        const paths = resolveUlviaPaths(
            { ULVIA_DATA_DIR: "/var/tmp/ulvia-data", XDG_DATA_HOME: "/ignored" },
            "/home/u",
        );

        expect(paths.data).toBe("/var/tmp/ulvia-data");
        expect(paths.repository).toBe("/var/tmp/ulvia-data/repository");
        expect(paths.packages).toBe("/var/tmp/ulvia-data/repository/packages");
    });

    test("uses the XDG data home before the home fallback", () => {
        expect(resolveUlviaPaths({ XDG_DATA_HOME: "/data" }, "/home/u").data).toBe("/data/ulvia");
        expect(resolveUlviaPaths({}, "/home/u").data).toBe("/home/u/.local/share/ulvia");
    });

    test("rejects relative application data roots", () => {
        expect(() => resolveUlviaPaths({ ULVIA_DATA_DIR: "./data" }, "/home/u")).toThrow(/absolute path/);
        expect(() => resolveUlviaPaths({ XDG_DATA_HOME: "data" }, "/home/u")).toThrow(/absolute path/);
    });
});
