import { describe, expect, test } from "bun:test";
import { LOCAL_RUNTIME_PROFILES, parseDevFlags } from "../src/commands/CLI_dev";

describe("parseDevFlags", () => {
    test("defaults to the editor port and derived public port", () => {
        expect(parseDevFlags([])).toMatchObject({
            port: 5000,
            deliveryPort: 5001,
            host: "localhost",
            publicHost: "localhost",
            workers: true,
        });
    });

    test("rejects invalid ports and port + 1 overflow", () => {
        expect(() => parseDevFlags(["--port=abc"])).toThrow(/integer/);
        expect(() => parseDevFlags(["--port=0"])).toThrow(/between 1 and 65535/);
        expect(() => parseDevFlags(["--port=65535"])).toThrow(/port \+ 1/);
    });

    test("maps wildcard bind host to localhost for public URLs", () => {
        expect(parseDevFlags(["--host=0.0.0.0", "--port=6000"])).toMatchObject({
            host: "0.0.0.0",
            publicHost: "localhost",
        });
    });

    test("enables scheduled workers by default with an explicit maintenance escape", () => {
        expect(parseDevFlags(["--workers"]).workers).toBe(true);
        expect(parseDevFlags([]).workers).toBe(true);
        expect(parseDevFlags(["--no-workers"]).workers).toBe(false);
    });
});

describe("local runtime profiles", () => {
    test("maps dev and preview to explicit runtime modes", () => {
        expect(LOCAL_RUNTIME_PROFILES).toEqual({
            dev: { command: "dev", mode: "DEV" },
            preview: { command: "preview", mode: "PROD" },
        });
    });
});
