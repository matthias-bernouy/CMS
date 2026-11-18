import { createHash } from "node:crypto";
import type { PublicKind, PublicResource } from "../../metadata/types";

/** Synthetic unit DTOs only; real resource admission is checked in factory.test.ts and live runs. */
export function unitPublicResource(kind: PublicKind, index: number, patch: number): PublicResource {
    const id = `performance-discovery-unit/${kind}-${String(index).padStart(3, "0")}`;
    const name = `Unit ${kind} ${index} version ${patch}`;
    const description = kind === "provider-manifest" ? "" : "Controlled unit corpus";
    const reference = {
        kind,
        publisherId: "performance-discovery-unit",
        id,
        version: `1.0.${patch}`,
        digest: `sha256:${createHash("sha256").update(`${kind}:${index}:${patch}`).digest("hex")}`,
    };
    const contractIds = kind === "contract" ? [id] : [];
    const metadata = kind === "provider-manifest" ? { name } : { name, description };
    const manifest = new TextEncoder().encode(JSON.stringify({ reference, name, description, metadata, contractIds }));
    return { reference, name, description, metadata, contractIds, manifest, canonicalJson: "{}", assets: [] };
}
