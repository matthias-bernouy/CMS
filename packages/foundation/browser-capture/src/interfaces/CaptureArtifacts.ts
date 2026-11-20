export interface CaptureArtifacts {
    put(owner: string, bytes: Uint8Array): { captureId: string; expiresAt: number };
    get(owner: string, captureId: string): Uint8Array | null;
}
