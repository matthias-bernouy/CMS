function isLosslessUtf8(value: string): boolean {
    for (let index = 0; index < value.length; index++) {
        const unit = value.charCodeAt(index);
        if (unit >= 0xd800 && unit <= 0xdbff) {
            const next = value.charCodeAt(++index);
            if (!(next >= 0xdc00 && next <= 0xdfff)) {
                return false;
            }
        } else if (unit >= 0xdc00 && unit <= 0xdfff) {
            return false;
        }
    }
    return true;
}

// Every UTF-16 unit consumes at least one JSON byte. Each field, option, answer
// and recipient object consumes more than eight bytes, so 65,536 / 8 = 8,192
// bounds their counts. Selections cannot exceed the number of admitted options.
const requestBytes = 65536;
export function lossless(value: unknown): boolean {
    if (typeof value === "string") {
        return isLosslessUtf8(value);
    }
    if (Array.isArray(value)) {
        return value.every(lossless);
    }
    if (typeof value === "object" && value !== null) {
        return Object.entries(value).every(([key, entry]) => isLosslessUtf8(key) && lossless(entry));
    }
    return true;
}
export function validRequest(value: unknown): boolean {
    return lossless(value) && new TextEncoder().encode(JSON.stringify(value)).length <= requestBytes;
}
