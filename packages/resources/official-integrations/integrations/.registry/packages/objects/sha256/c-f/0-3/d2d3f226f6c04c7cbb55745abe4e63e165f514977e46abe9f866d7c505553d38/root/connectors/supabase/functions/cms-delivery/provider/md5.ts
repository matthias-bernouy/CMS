const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const constants = Array.from(
    { length: 64 },
    (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0,
);

export function md5(value: string): string {
    const bytes = new TextEncoder().encode(value);
    const length = bytes.length;
    const paddedLength = (((length + 8) >>> 6) + 1) * 64;
    const data = new Uint8Array(paddedLength);
    data.set(bytes);
    data[length] = 0x80;
    const bits = length * 8;
    const view = new DataView(data.buffer);
    view.setUint32(paddedLength - 8, bits >>> 0, true);
    view.setUint32(paddedLength - 4, Math.floor(bits / 0x100000000), true);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    for (let offset = 0; offset < data.length; offset += 64) {
        let a = a0;
        let b = b0;
        let c = c0;
        let d = d0;
        for (let index = 0; index < 64; index += 1) {
            let f: number;
            let word: number;
            if (index < 16) {
                f = (b & c) | (~b & d);
                word = index;
            } else if (index < 32) {
                f = (d & b) | (~d & c);
                word = (5 * index + 1) % 16;
            } else if (index < 48) {
                f = b ^ c ^ d;
                word = (3 * index + 5) % 16;
            } else {
                f = c ^ (b | ~d);
                word = (7 * index) % 16;
            }
            const sum = (a + f + constants[index]! + view.getUint32(offset + word * 4, true)) >>> 0;
            const shift = shifts[Math.floor(index / 16) * 4 + (index % 4)]!;
            const next = (b + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0;
            a = d;
            d = c;
            c = b;
            b = next;
        }
        a0 = (a0 + a) >>> 0;
        b0 = (b0 + b) >>> 0;
        c0 = (c0 + c) >>> 0;
        d0 = (d0 + d) >>> 0;
    }

    return [a0, b0, c0, d0]
        .map((part) =>
            Array.from({ length: 4 }, (_, index) => ((part >>> (index * 8)) & 0xff).toString(16).padStart(2, "0")).join(
                "",
            ),
        )
        .join("");
}
