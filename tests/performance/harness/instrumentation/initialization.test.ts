import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { measureInitializationMethod, instrumentInitialization } from "./initialization";
import { scope, traceFile } from "./records";

test("initialization probes preserve arguments, this, results and the original exception without logging payloads", async () => {
    const traceId = randomUUID();
    const original = new Error("private error message");
    const object = {
        value: 4,
        async run(input: number) {
            if (input < 0) {
                throw original;
            }
            return this.value + input;
        },
    };
    measureInitializationMethod(object, "run", "unit.phase");
    measureInitializationMethod(object, "run", "unit.phase");
    await scope.run({ traceId }, async () => {
        expect(await object.run(2)).toBe(6);
        await expect(object.run(-1)).rejects.toBe(original);
    });
    const text = await readFile(traceFile(traceId), "utf8");
    const rows = text
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    expect(rows).toHaveLength(2);
    expect(rows.map(({ success }) => success)).toEqual([true, false]);
    expect(rows.every(({ durationMs }) => durationMs >= 0)).toBe(true);
    expect(text).not.toContain("private error message");
    expect(text).not.toContain("input");
    await Bun.file(traceFile(traceId)).delete();
});

test("plan probes wrap shared verifier methods once and retain phase evidence when preview fails", async () => {
    const traceId = randomUUID();
    const failure = new Error("preview failed");
    const noop = async () => {};
    const options = {
        execution: noop,
        validateCandidate: async () => {
            throw failure;
        },
        source: { list: noop, get: noop, getMetadata: noop },
        verifier: { metadata: noop, metadataJson: noop, artifact: noop, evolution: noop },
    };
    const object = {
        options,
        async plan() {
            await this.options.execution();
            await this.options.verifier.metadata();
            await this.options.validateCandidate();
        },
    };
    instrumentInitialization(object);
    await scope.run({ traceId }, async () => {
        for (let index = 0; index < 2; index++) {
            await expect(object.plan()).rejects.toBe(failure);
        }
    });
    const rows = (await readFile(traceFile(traceId), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    expect(rows.filter(({ name }) => name === "verify.metadata")).toHaveLength(2);
    expect(rows.filter(({ name, success }) => name === "preview.total" && success === false)).toHaveLength(2);
    expect(rows.filter(({ name }) => name === "plan.total")).toHaveLength(2);
    await Bun.file(traceFile(traceId)).delete();
});
