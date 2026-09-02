import { exifOrientation, malformed, matches, readU16BE, requireBytes } from "./bytes.ts";
import type { ImageDimensions } from "./types.ts";

const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export function isJpeg(bytes: Uint8Array): boolean {
    return matches(bytes, 0, [0xff, 0xd8, 0xff]);
}

export function jpegDimensions(bytes: Uint8Array): ImageDimensions {
    if (!isJpeg(bytes)) {
        malformed();
    }
    let offset = 2;
    let orientation = 1;
    let dimensions: ImageDimensions | null = null;
    let sawQuantization = false;
    let sawCodingTable = false;
    let sawScan = false;
    let sawEnd = false;
    let entropyBytes = 0;
    while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
            malformed();
        }
        while (bytes[offset] === 0xff) {
            offset++;
        }
        requireBytes(bytes, offset, 1);
        const marker = bytes[offset++]!;
        if (marker === 0xd9) {
            sawEnd = true;
            break;
        }
        if (marker === 0x00 || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            if (marker === 0x00 || marker === 0xd8) {
                malformed();
            }
            continue;
        }
        const segmentLength = readU16BE(bytes, offset);
        if (segmentLength < 2) {
            malformed();
        }
        const payload = offset + 2;
        const payloadLength = segmentLength - 2;
        requireBytes(bytes, payload, payloadLength);
        if (marker === 0xe1) {
            orientation = exifOrientation(bytes.subarray(payload, payload + payloadLength)) ?? orientation;
        }
        if (marker === 0xdb) {
            sawQuantization = true;
        }
        if (marker === 0xc4 || marker === 0xcc) {
            sawCodingTable = true;
        }
        if (startOfFrameMarkers.has(marker)) {
            requireBytes(bytes, payload, 6);
            const components = bytes[payload + 5]!;
            if (!components || segmentLength !== 8 + components * 3) {
                malformed();
            }
            dimensions = {
                width: readU16BE(bytes, payload + 3),
                height: readU16BE(bytes, payload + 1),
            };
        }
        if (marker === 0xda) {
            if (!dimensions || payloadLength < 6) {
                malformed();
            }
            sawScan = true;
            const scan = scanEntropy(bytes, payload + payloadLength);
            entropyBytes += scan.bytes;
            offset = scan.nextMarker;
            continue;
        }
        offset += segmentLength;
    }
    if (
        !dimensions ||
        !sawQuantization ||
        !sawCodingTable ||
        !sawScan ||
        !sawEnd ||
        entropyBytes === 0 ||
        offset !== bytes.length
    ) {
        malformed();
    }
    return orientation >= 5 && orientation <= 8 ? { width: dimensions.height, height: dimensions.width } : dimensions;
}

function scanEntropy(bytes: Uint8Array, start: number): { bytes: number; nextMarker: number } {
    let offset = start;
    let dataBytes = 0;
    while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
            dataBytes++;
            offset++;
            continue;
        }
        const markerStart = offset;
        while (bytes[offset] === 0xff) {
            offset++;
        }
        requireBytes(bytes, offset, 1);
        const marker = bytes[offset]!;
        if (marker === 0x00) {
            dataBytes++;
            offset++;
            continue;
        }
        if (marker >= 0xd0 && marker <= 0xd7) {
            offset++;
            continue;
        }
        return { bytes: dataBytes, nextMarker: markerStart };
    }
    malformed();
}
