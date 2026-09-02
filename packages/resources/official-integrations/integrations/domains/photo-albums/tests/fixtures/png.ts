import { Buffer } from "node:buffer";

const PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export function pngBytes(): Uint8Array {
    return new Uint8Array(Buffer.from(PIXEL_PNG, "base64"));
}
