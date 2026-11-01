import { Writable } from "node:stream";

export function destination() {
    const lines: string[] = [];
    const pending: (() => void)[] = [];
    const stream = new Writable({
        highWaterMark: 1,
        write(chunk, _encoding, done) {
            lines.push(String(chunk));
            pending.push(done);
        },
    });
    return { stream, lines, release: () => pending.shift()?.() };
}
