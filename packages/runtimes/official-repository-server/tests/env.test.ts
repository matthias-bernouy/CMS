import { describe, expect, test } from "bun:test";
import { readOfficialRepositoryEnv } from "../src/env";

const valid = {
    ULVIA_REPOSITORY_DIR: "/var/lib/ulvia-repository",
    ULVIA_REPOSITORY_TOKEN: "a".repeat(32),
};

describe("official repository environment", () => {
    test("uses bounded production defaults", () => {
        expect(readOfficialRepositoryEnv(valid)).toEqual({
            host: "0.0.0.0",
            port: 3000,
            root: "/var/lib/ulvia-repository",
            token: valid.ULVIA_REPOSITORY_TOKEN,
            shutdownTimeoutMs: 10_000,
        });
    });

    test("rejects relative storage, weak tokens and invalid listen values", () => {
        expect(() => readOfficialRepositoryEnv({ ...valid, ULVIA_REPOSITORY_DIR: "repository" })).toThrow(
            "absolute path",
        );
        expect(() => readOfficialRepositoryEnv({ ...valid, ULVIA_REPOSITORY_TOKEN: "short" })).toThrow("32 to 1024");
        expect(() => readOfficialRepositoryEnv({ ...valid, REPOSITORY_PORT: "0" })).toThrow("between 1 and 65535");
        expect(() => readOfficialRepositoryEnv({ ...valid, REPOSITORY_HOST: "https://repository" })).toThrow(
            "hostname or IP",
        );
        expect(() => readOfficialRepositoryEnv({ ...valid, REPOSITORY_HOST: "999.999.999.999" })).toThrow(
            "hostname or IP",
        );
    });
});
