export type DnsQuestion = Readonly<{ name: string; type: number; end: number }>;
export type DnsRecord = Readonly<{ type: "TXT" | "A"; value: string }>;

/** One bounded IN question; queries never authorize recursion or public forwarding. */
export function dnsQuestion(bytes: Buffer): DnsQuestion | null {
    if (bytes.length < 17 || bytes.length > 1232 || bytes.readUInt16BE(4) !== 1 || (bytes[2]! & 0xf8) !== 0) {
        return null;
    }
    const labels: string[] = [];
    let offset = 12;
    while (offset < bytes.length) {
        const length = bytes[offset++]!;
        if (length === 0) {
            if (offset + 4 !== bytes.length || bytes.readUInt16BE(offset + 2) !== 1) {
                return null;
            }
            const name = labels.join(".").toLowerCase();
            return name.length > 0 && name.length <= 253
                ? { name, type: bytes.readUInt16BE(offset), end: offset + 4 }
                : null;
        }
        if (length > 63 || offset + length >= bytes.length || labels.length >= 127) {
            return null;
        }
        const label = bytes.subarray(offset, offset + length).toString("ascii");
        if (!/^[a-zA-Z0-9_-]+$/u.test(label)) {
            return null;
        }
        labels.push(label);
        offset += length;
    }
    return null;
}

export function dnsReply(query: Buffer, question: DnsQuestion, record: DnsRecord | undefined, nameExists = false) {
    const header = Buffer.alloc(12);
    query.copy(header, 0, 0, 2);
    header.writeUInt16BE(0x8400 | (query[2]! & 1 ? 0x100 : 0) | (record || nameExists ? 0 : 3), 2);
    header.writeUInt16BE(1, 4);
    const body = query.subarray(12, question.end);
    if (!record) {
        return Buffer.concat([header, body]);
    }
    const type = record.type === "TXT" ? 16 : 1;
    if (question.type !== type) {
        header.writeUInt16BE(header.readUInt16BE(2) & 0xfff0, 2);
        return Buffer.concat([header, body]);
    }
    const value = Buffer.from(record.value);
    const chunks: Buffer[] = [];
    if (record.type === "TXT") {
        for (let offset = 0; offset < value.length || offset === 0; offset += 255) {
            const chunk = value.subarray(offset, offset + 255);
            chunks.push(Buffer.from([chunk.length]), chunk);
        }
    } else {
        chunks.push(Buffer.from(record.value.split(".").map(Number)));
    }
    const data = Buffer.concat(chunks);
    const answer = Buffer.alloc(12);
    answer.writeUInt16BE(0xc00c, 0);
    answer.writeUInt16BE(type, 2);
    answer.writeUInt16BE(1, 4);
    answer.writeUInt16BE(data.length, 10);
    header.writeUInt16BE(1, 6);
    return Buffer.concat([header, body, answer, data]);
}
