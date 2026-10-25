import { describe, expect, test } from "bun:test";
import { readOfficialRepositoryEnv } from "../src/env";

const valid = {
    ULVIA_REPOSITORY_DIR: "/var/lib/ulvia-repository",
};

describe("official repository environment", () => {
    test("uses bounded production defaults", () => {
        expect(readOfficialRepositoryEnv(valid)).toEqual({
            host: "0.0.0.0",
            port: 3000,
            publicUrl: "http://127.0.0.1:3000",
            root: "/var/lib/ulvia-repository",
            shutdownTimeoutMs: 10_000,
        });
        expect(
            readOfficialRepositoryEnv({ ...valid, ULVIA_REPOSITORY_SEED_DIR: "/opt/ulvia-repository-seed" }).seedRoot,
        ).toBe("/opt/ulvia-repository-seed");
    });

    test("rejects relative storage and invalid listen values", () => {
        expect(() => readOfficialRepositoryEnv({ ...valid, ULVIA_REPOSITORY_DIR: "repository" })).toThrow(
            "absolute path",
        );
        expect(() => readOfficialRepositoryEnv({ ...valid, REPOSITORY_PORT: "0" })).toThrow("between 1 and 65535");
        expect(() => readOfficialRepositoryEnv({ ...valid, REPOSITORY_HOST: "https://repository" })).toThrow(
            "hostname or IP",
        );
        expect(() => readOfficialRepositoryEnv({ ...valid, REPOSITORY_HOST: "999.999.999.999" })).toThrow(
            "hostname or IP",
        );
        expect(() => readOfficialRepositoryEnv({ ...valid, ULVIA_REPOSITORY_SEED_DIR: "seed" })).toThrow(
            "absolute path",
        );
    });

    test("validates the configured public origin independently of listen and forwarded headers", () => {
        expect(
            readOfficialRepositoryEnv({ ...valid, REPOSITORY_PUBLIC_URL: "https://repository.example" }).publicUrl,
        ).toBe("https://repository.example");
        expect(readOfficialRepositoryEnv({ ...valid, REPOSITORY_PORT: "4100" }).publicUrl).toBe(
            "http://127.0.0.1:4100",
        );
        for (const origin of [
            "http://repository.example",
            "https://user:secret@repository.example",
            "https://repository.example/prefix",
            "https://repository.example/?query=1",
            "https://repository.example/#fragment",
            "file:///tmp/repository",
        ]) {
            expect(() => readOfficialRepositoryEnv({ ...valid, REPOSITORY_PUBLIC_URL: origin })).toThrow(
                "REPOSITORY_PUBLIC_URL",
            );
        }
    });
});
