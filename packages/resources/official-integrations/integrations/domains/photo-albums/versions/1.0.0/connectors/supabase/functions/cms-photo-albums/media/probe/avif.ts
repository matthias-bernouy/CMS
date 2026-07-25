import { ascii, malformed, readU16BE, readU32BE, readU64BE, requireBytes, unsupportedAnimation } from "./bytes.ts";
import type { ImageDimensions } from "./types.ts";

type Box = { end: number; payload: number; type: string };
type ParseState = { boxes: number };

const maxBoxes = 4096;

export function isAvif(bytes: Uint8Array): boolean {
    return bytes.length >= 16 && ascii(bytes, 4, 4) === "ftyp" && avifBrand(bytes);
}

export function avifDimensions(bytes: Uint8Array): ImageDimensions {
    const state = { boxes: 0 };
    const top = boxes(bytes, 0, bytes.length, state);
    const ftyp = top.find((box) => box.type === "ftyp");
    const meta = top.find((box) => box.type === "meta");
    const mediaData = top.find((box) => box.type === "mdat");
    if (!ftyp || !meta || !mediaData || mediaData.end === mediaData.payload || !avifBrand(bytes, ftyp)) {
        malformed();
    }
    if (hasBrand(bytes, ftyp, "avis")) {
        unsupportedAnimation();
    }
    requireBytes(bytes, meta.payload, 4);
    const children = boxes(bytes, meta.payload + 4, meta.end, state);
    if (!children.some((box) => box.type === "iloc") || !children.some((box) => box.type === "iinf")) {
        malformed();
    }
    const primaryId = primaryItemId(
        bytes,
        children.find((box) => box.type === "pitm"),
    );
    const iprp = children.find((box) => box.type === "iprp");
    if (!iprp) {
        malformed();
    }
    const propertyBoxes = boxes(bytes, iprp.payload, iprp.end, state);
    const ipco = propertyBoxes.find((box) => box.type === "ipco");
    if (!ipco) {
        malformed();
    }
    const properties = boxes(bytes, ipco.payload, ipco.end, state);
    const dimensionsByProperty = new Map<number, ImageDimensions>();
    const rotationsByProperty = new Map<number, number>();
    properties.forEach((property, index) => {
        if (property.type === "ispe") {
            dimensionsByProperty.set(index + 1, ispeDimensions(bytes, property));
        }
        if (property.type === "irot") {
            requireBytes(bytes, property.payload, 1);
            rotationsByProperty.set(index + 1, bytes[property.payload]! & 0x03);
        }
    });
    if (!dimensionsByProperty.size) {
        malformed();
    }
    if (primaryId !== null) {
        for (const ipma of propertyBoxes.filter((box) => box.type === "ipma")) {
            const propertyIds = associatedPropertyIds(bytes, ipma, primaryId);
            for (const propertyId of propertyIds) {
                const dimensions = dimensionsByProperty.get(propertyId);
                if (dimensions) {
                    const swapsAxes = propertyIds.some((id) => (rotationsByProperty.get(id) ?? 0) % 2 === 1);
                    return swapsAxes ? { width: dimensions.height, height: dimensions.width } : dimensions;
                }
            }
        }
    }
    return [...dimensionsByProperty.values()].sort(
        (left, right) => right.width * right.height - left.width * left.height,
    )[0]!;
}

function avifBrand(bytes: Uint8Array, knownBox?: Box): boolean {
    const box = knownBox ?? boxes(bytes, 0, bytes.length, { boxes: 0 })[0];
    if (!box || box.type !== "ftyp" || box.end - box.payload < 8) {
        return false;
    }
    return hasBrand(bytes, box, "avif") || hasBrand(bytes, box, "avis");
}

function hasBrand(bytes: Uint8Array, box: Box, expected: string): boolean {
    for (let offset = box.payload; offset + 4 <= box.end; offset += 4) {
        if (ascii(bytes, offset, 4) === expected) {
            return true;
        }
    }
    return false;
}

function boxes(bytes: Uint8Array, start: number, end: number, state: ParseState): Box[] {
    const result: Box[] = [];
    let offset = start;
    while (offset < end) {
        requireBytes(bytes, offset, 8);
        if (++state.boxes > maxBoxes) {
            malformed();
        }
        const size32 = readU32BE(bytes, offset);
        const type = ascii(bytes, offset + 4, 4);
        const header = size32 === 1 ? 16 : 8;
        const size = size32 === 0 ? end - offset : size32 === 1 ? readU64BE(bytes, offset + 8) : size32;
        if (size < header || offset + size > end) {
            malformed();
        }
        result.push({ type, payload: offset + header, end: offset + size });
        offset += size;
        if (size32 === 0) {
            break;
        }
    }
    if (offset !== end) {
        malformed();
    }
    return result;
}

function primaryItemId(bytes: Uint8Array, box: Box | undefined): number | null {
    if (!box) {
        return null;
    }
    requireBytes(bytes, box.payload, 6);
    const version = bytes[box.payload]!;
    return version === 0 ? readU16BE(bytes, box.payload + 4) : readU32BE(bytes, box.payload + 4);
}

function ispeDimensions(bytes: Uint8Array, box: Box): ImageDimensions {
    requireBytes(bytes, box.payload, 12);
    return {
        width: readU32BE(bytes, box.payload + 4),
        height: readU32BE(bytes, box.payload + 8),
    };
}

function associatedPropertyIds(bytes: Uint8Array, box: Box, targetId: number): number[] {
    requireBytes(bytes, box.payload, 8);
    const version = bytes[box.payload]!;
    const flags = (bytes[box.payload + 1]! << 16) | (bytes[box.payload + 2]! << 8) | bytes[box.payload + 3]!;
    let offset = box.payload + 4;
    const entries = readU32BE(bytes, offset);
    offset += 4;
    if (entries > maxBoxes) {
        malformed();
    }
    for (let entry = 0; entry < entries; entry++) {
        const itemId = version < 1 ? readU16BE(bytes, offset) : readU32BE(bytes, offset);
        offset += version < 1 ? 2 : 4;
        requireBytes(bytes, offset, 1);
        const count = bytes[offset++]!;
        const propertyIds: number[] = [];
        for (let association = 0; association < count; association++) {
            const wide = (flags & 1) !== 0;
            const encoded = wide ? readU16BE(bytes, offset) : bytes[offset]!;
            offset += wide ? 2 : 1;
            propertyIds.push(encoded & (wide ? 0x7fff : 0x7f));
        }
        if (itemId === targetId) {
            return propertyIds.filter((id) => id > 0);
        }
    }
    if (offset > box.end) {
        malformed();
    }
    return [];
}
