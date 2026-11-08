import { crc32, deflateRawSync } from "node:zlib";

interface FixtureEntry {
    readonly path: string;
    readonly content?: string | Buffer;
    readonly compression?: number;
    readonly flags?: number;
    readonly mode?: number;
    readonly declaredSize?: number;
    readonly checksum?: number;
}

/** Tiny independent ZIP encoder permits deliberately invalid central-directory metadata. */
export function fixtureZip(entries: readonly FixtureEntry[]): Buffer {
    const local: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;
    for (const entry of entries) {
        const name = Buffer.from(entry.path);
        const content = Buffer.from(entry.content ?? "");
        const method = entry.compression ?? 0;
        const payload = method === 8 ? deflateRawSync(content) : content;
        const size = entry.declaredSize ?? content.length;
        const checksum = entry.checksum ?? crc32(content);
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(0x800 | (entry.flags ?? 0), 6);
        header.writeUInt16LE(method, 8);
        header.writeUInt32LE(checksum, 14);
        header.writeUInt32LE(payload.length, 18);
        header.writeUInt32LE(size, 22);
        header.writeUInt16LE(name.length, 26);
        local.push(header, name, payload);
        const directory = Buffer.alloc(46);
        directory.writeUInt32LE(0x02014b50, 0);
        directory.writeUInt16LE(0x314, 4);
        directory.writeUInt16LE(20, 6);
        directory.writeUInt16LE(0x800 | (entry.flags ?? 0), 8);
        directory.writeUInt16LE(method, 10);
        directory.writeUInt32LE(checksum, 16);
        directory.writeUInt32LE(payload.length, 20);
        directory.writeUInt32LE(size, 24);
        directory.writeUInt16LE(name.length, 28);
        directory.writeUInt32LE(((entry.mode ?? 0o100644) * 0x10000) >>> 0, 38);
        directory.writeUInt32LE(offset, 42);
        central.push(directory, name);
        offset += header.length + name.length + payload.length;
    }
    const index = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(index.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, index, end]);
}
