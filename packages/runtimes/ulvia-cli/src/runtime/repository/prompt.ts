import type { ReadStream, WriteStream } from "node:tty";

/** Read bounded ASCII input in raw mode so the terminal never echoes the PAT. */
export async function promptRepositoryToken(
    input: ReadStream = process.stdin,
    output: WriteStream = process.stderr,
): Promise<string> {
    if (!input.isTTY || !output.isTTY) {
        throw new Error("Provide a Repository PAT through ULVIA_REPOSITORY_TOKEN or --token-stdin outside a terminal");
    }
    const wasRaw = input.isRaw === true;
    const wasFlowing = input.readableFlowing === true;
    let cleanup = () => {};
    let value = "";
    let size = 0;
    try {
        input.setRawMode(true);
        output.write("Repository PAT: ");
        return await new Promise<string>((resolve, reject) => {
            const data = (chunk: Buffer | string) => {
                size += Buffer.byteLength(chunk);
                if (size > 128) {
                    reject(new Error("Repository token input exceeds its byte limit"));
                    return;
                }
                for (const byte of Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)) {
                    if (byte === 3) {
                        reject(new Error("Repository login cancelled"));
                        return;
                    }
                    if (byte === 4) {
                        reject(new Error("Repository token input ended before submission"));
                        return;
                    }
                    if (byte === 13 || byte === 10) {
                        const token = value.trim();
                        if (token) {
                            resolve(token);
                        } else {
                            reject(new Error("Provide a Repository PAT"));
                        }
                        return;
                    }
                    if (byte === 8 || byte === 127) {
                        value = value.slice(0, -1);
                    } else if (byte >= 32 && byte <= 126) {
                        value += String.fromCharCode(byte);
                    } else {
                        reject(new Error("Repository token input contains an unsupported character"));
                        return;
                    }
                }
            };
            const ended = () => reject(new Error("Repository token input ended before submission"));
            const failed = () => reject(new Error("Repository token input failed"));
            cleanup = () => {
                input.removeListener("data", data);
                input.removeListener("end", ended);
                input.removeListener("close", ended);
                input.removeListener("error", failed);
            };
            input.on("data", data);
            input.once("end", ended);
            input.once("close", ended);
            input.once("error", failed);
            input.resume();
        });
    } finally {
        cleanup();
        value = "";
        input.setRawMode(wasRaw);
        if (!wasFlowing) {
            input.pause();
        }
        output.write("\n");
    }
}
