import { expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import type { ReadStream, WriteStream } from "node:tty";
import { promptRepositoryToken } from "../../../src/runtime/repository/prompt";

function terminalFixture(raw = false) {
    const input = Object.assign(new PassThrough(), {
        isTTY: true,
        isRaw: raw,
        setRawMode(enabled: boolean) {
            this.isRaw = enabled;
            return this;
        },
    });
    const output = Object.assign(new PassThrough(), { isTTY: true });
    let written = "";
    output.on("data", (chunk) => {
        written += chunk.toString();
    });
    return {
        input,
        output,
        written: () => written,
        prompt: () => promptRepositoryToken(input as unknown as ReadStream, output as unknown as WriteStream),
        close() {
            input.destroy();
            output.destroy();
        },
    };
}

test("the PAT prompt submits on Enter, supports corrections and never echoes the secret", async () => {
    const f = terminalFixture();
    const token = `pat_${"a".repeat(43)}`;
    try {
        const pending = f.prompt();
        expect(f.written()).toBe("Repository PAT: ");
        f.input.write(`${token.slice(0, -1)}b\x7fa\r`);
        expect(await pending).toBe(token);
        expect(f.written()).toBe("Repository PAT: \n");
        expect(f.input.isRaw).toBe(false);
        expect(f.input.isPaused()).toBe(true);
        expect(f.input.listenerCount("data")).toBe(0);
    } finally {
        f.close();
    }
});

test("invalid, oversized and cancelled PAT input releases the terminal without printing input", async () => {
    for (const [input, message] of [
        ["\r", "Provide a Repository PAT"],
        ["secret\x03", "cancelled"],
        ["\x04", "ended before submission"],
        ["x".repeat(129), "byte limit"],
        ["secret\t", "unsupported character"],
    ]) {
        const f = terminalFixture();
        try {
            const pending = f.prompt();
            f.input.write(input);
            await expect(pending).rejects.toThrow(message);
            expect(f.written()).toBe("Repository PAT: \n");
            expect(f.input.isRaw).toBe(false);
            expect(f.input.isPaused()).toBe(true);
            expect(f.input.listenerCount("data")).toBe(0);
        } finally {
            f.close();
        }
    }
});

test("the PAT prompt restores existing raw mode and handles a disconnected terminal", async () => {
    const f = terminalFixture(true);
    try {
        const pending = f.prompt();
        f.input.end();
        await expect(pending).rejects.toThrow("ended before submission");
        expect(f.input.isRaw).toBe(true);
        expect(f.written()).toBe("Repository PAT: \n");
        expect(f.input.listenerCount("data")).toBe(0);
    } finally {
        f.close();
    }
});

test("noninteractive login requires an explicit token source without consuming stdin", async () => {
    const f = terminalFixture();
    try {
        f.input.isTTY = false;
        await expect(f.prompt()).rejects.toThrow("--token-stdin outside a terminal");
        expect(f.written()).toBe("");
        expect(f.input.listenerCount("data")).toBe(0);
        f.input.isTTY = true;
        f.output.isTTY = false;
        await expect(f.prompt()).rejects.toThrow("--token-stdin outside a terminal");
        expect(f.input.isRaw).toBe(false);
    } finally {
        f.close();
    }
});
