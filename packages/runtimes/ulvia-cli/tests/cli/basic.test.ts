import { describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli";
import { resolveDevPorts } from "../../src/commands/dev";
import { localMongoUrl } from "../../src/runtime/mongo";

describe("Ulvia CLI", () => {
    test("documents local development and repository lifecycle commands", async () => {
        const output: string[] = [];
        await runCli(["--help"], { log: (line) => output.push(line) });

        expect(output.join("\n")).toContain("ulvia dev");
        expect(output.join("\n")).toContain("ulvia release");
        expect(output.join("\n")).toContain("ulvia prune");
        expect(output.join("\n")).not.toContain("ulvia pull");
        expect(output.join("\n")).not.toContain("ulvia push");
    });

    test("accepts isolated dev ports and rejects collisions", () => {
        expect(resolveDevPorts({ ULVIA_DEV_CONTROL_PORT: "5210" })).toEqual({
            control: 5210,
            delivery: 5101,
            mongo: 27019,
            repository: 5102,
            provider: 5103,
        });
        expect(() => resolveDevPorts({ ULVIA_DEV_CONTROL_PORT: "5200", ULVIA_DEV_DELIVERY_PORT: "5200" })).toThrow(
            /ports must be distinct/,
        );
        expect(() => resolveDevPorts({ ULVIA_DEV_MONGO_PORT: "70000" })).toThrow(/between 1 and 65535/);
    });

    test("disables retryable writes for the standalone local MongoDB", () => {
        expect(localMongoUrl(27_019)).toBe("mongodb://127.0.0.1:27019/ulvia_dev?retryWrites=false");
    });

    test("rejects removed integration lifecycle commands", async () => {
        await expect(runCli(["pull", "demo"], { log: () => undefined })).rejects.toThrow("Unknown command: pull");
    });
});
