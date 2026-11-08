import { expect, test } from "bun:test";
import { readZip, writeZip } from "../src/exports";
import { captureBlobBytes } from "../src/core/blob";
import type { ZipSourceEntry } from "../src/exports";

class MisleadingBlob extends Blob {
    constructor(parts: BlobPart[]) {
        super(parts);
        Object.defineProperty(this, "size", { value: 0 });
    }
    override arrayBuffer(): Promise<ArrayBuffer> {
        throw new Error("Caller-controlled Blob method must not run");
    }
}
function misleadingBytes(buffer: ArrayBuffer): Uint8Array {
    const bytes = new Uint8Array(buffer);
    Object.defineProperty(bytes, "byteLength", { value: 0 });
    return bytes;
}

test("refuses array-like binary values before allocation or caller-controlled conversion", async () => {
    const value = { length: 2, byteLength: 1, 0: 65, 1: 66 };
    await expect(readZip(value as unknown as Uint8Array)).rejects.toThrow("binary input must be a Blob or Uint8Array");
    await expect(writeZip([{ path: "file", bytes: value }] as unknown as ZipSourceEntry[])).rejects.toThrow(
        "binary input must be a Blob or Uint8Array",
    );
    await expect(writeZip({ length: 0 } as unknown as ZipSourceEntry[])).rejects.toThrow(
        "ZIP sources must be an array",
    );
});

test("measures intrinsic Blob/typed-array bytes and captures data without calling Blob overrides", async () => {
    const original = await writeZip([{ path: "file", bytes: "original" }]);
    const bytes = misleadingBytes(await original.arrayBuffer());
    await expect(readZip(bytes, { limits: { maxArchiveBytes: original.size - 1 } })).rejects.toMatchObject({
        code: "limit_exceeded",
    });
    const blob = new MisleadingBlob([await original.arrayBuffer()]);
    await expect(readZip(blob, { limits: { maxArchiveBytes: original.size - 1 } })).rejects.toMatchObject({
        code: "limit_exceeded",
    });
    expect(await (await readZip(blob)).entries[0]?.bytes.text()).toBe("original");
    const data = new MisleadingBlob(["payload"]);
    await expect(writeZip([{ path: "file", bytes: data }], { limits: { maxEntryBytes: 6 } })).rejects.toMatchObject({
        code: "limit_exceeded",
    });
    expect(await (await readZip(await writeZip([{ path: "file", bytes: data }]))).entries[0]?.bytes.text()).toBe(
        "payload",
    );
});

test("bounds observed Blob bytes and preserves cancellation during capture", async () => {
    await expect(captureBlobBytes(new Blob(["growing"]), 2)).rejects.toMatchObject({ code: "limit_exceeded" });
    const controller = new AbortController();
    const pending = captureBlobBytes(new Blob([new Uint8Array(65536)]), 65536, controller.signal);
    const reason = new Error("cancel capture");
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
});
