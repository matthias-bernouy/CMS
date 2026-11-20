import { randomUUID } from "node:crypto";
import type { CaptureArtifacts } from "../interfaces/CaptureArtifacts";
import { CAPTURE_LIMITS, CaptureError } from "./limits";

/** Ephemeral artifacts only. An opaque owner key is supplied by the authenticated host. */
export class MemoryCaptureArtifacts implements CaptureArtifacts {
    private readonly entries = new Map<string, { owner: string; bytes: Uint8Array; expiresAt: number }>();
    private bytes = 0;
    constructor(private readonly now: () => number = Date.now) {}
    put(owner: string, bytes: Uint8Array) {
        this.prune();
        if (!owner || bytes.byteLength > CAPTURE_LIMITS.imageBytes) {
            throw new CaptureError("LIMIT_EXCEEDED");
        }
        while (this.entries.size >= 16 || this.bytes + bytes.byteLength > 32 * 1024 * 1024) {
            this.remove(this.entries.keys().next().value!);
        }
        const captureId = randomUUID();
        const expiresAt = this.now() + 300_000;
        this.entries.set(captureId, { owner, bytes: bytes.slice(), expiresAt });
        this.bytes += bytes.byteLength;
        return { captureId, expiresAt };
    }
    get(owner: string, captureId: string): Uint8Array | null {
        this.prune();
        const entry = this.entries.get(captureId);
        return entry?.owner === owner ? entry.bytes.slice() : null;
    }
    private prune() {
        for (const [id, entry] of this.entries) {
            if (entry.expiresAt <= this.now()) {
                this.remove(id);
            }
        }
    }
    private remove(id: string) {
        const entry = this.entries.get(id);
        if (entry) {
            this.bytes -= entry.bytes.byteLength;
            this.entries.delete(id);
        }
    }
}
