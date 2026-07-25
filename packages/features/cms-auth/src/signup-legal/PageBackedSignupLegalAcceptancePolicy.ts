import { AuthValidationError } from "cms-auth/core/validation";
import type {
    PreparedSignupLegalAcceptance,
    ResolvedSignupLegalPage,
    SignupLegalAcceptancePolicy,
    SignupLegalAcceptanceStore,
    SignupLegalDocumentDefinition,
    SignupLegalDocumentEvidence,
    SignupLegalRequirements,
} from "cms-auth/signup-legal/contracts";

export type PageBackedSignupLegalAcceptanceConfig = {
    documents(): Promise<readonly SignupLegalDocumentDefinition[]>;
    resolvePublishedPage(pageId: string): Promise<ResolvedSignupLegalPage | null>;
    store: SignupLegalAcceptanceStore;
    now?: () => Date;
    createId?: () => string;
};

/**
 * Materializes current signup requirements exclusively from trusted CMS
 * configuration and published pages. Browser input contains version ids only.
 */
export class PageBackedSignupLegalAcceptancePolicy implements SignupLegalAcceptancePolicy {
    constructor(private readonly config: PageBackedSignupLegalAcceptanceConfig) {}

    async requirements(): Promise<SignupLegalRequirements> {
        const documents = await this.materialize();
        return {
            documents: documents.map((document) => ({
                documentKey: document.documentKey,
                versionId: document.versionId,
                label: document.label,
                consentText: document.consentText,
                page: {
                    id: document.pageSnapshot.id,
                    path: document.pageSnapshot.path,
                    title: document.pageSnapshot.title,
                },
                contentHash: document.contentHash,
            })),
        };
    }

    async prepare(acceptedVersionIds: readonly string[]): Promise<PreparedSignupLegalAcceptance> {
        const documents = await this.materialize();
        assertExactAcceptance(
            acceptedVersionIds,
            documents.map((document) => document.versionId),
        );
        return { documents };
    }

    async record(prepared: PreparedSignupLegalAcceptance, cmsUserId: string): Promise<void> {
        if (!cmsUserId) {
            throw new Error("Signup legal acceptance requires a CMS user id.");
        }
        if (prepared.documents.length === 0) {
            return;
        }
        await this.config.store.append({
            id: this.config.createId?.() ?? crypto.randomUUID(),
            cmsUserId,
            acceptedAt: this.config.now?.() ?? new Date(),
            documents: prepared.documents,
        });
    }

    private async materialize(): Promise<SignupLegalDocumentEvidence[]> {
        const definitions = (await this.config.documents()).filter((document) => document.enabled);
        assertDefinitions(definitions);
        return Promise.all(definitions.map((definition) => this.materializeDocument(definition)));
    }

    private async materializeDocument(definition: SignupLegalDocumentDefinition): Promise<SignupLegalDocumentEvidence> {
        const resolved = await this.config.resolvePublishedPage(definition.pageId);
        if (!resolved || resolved.snapshot.id !== definition.pageId) {
            throw new Error(`Signup legal document "${definition.key}" does not reference a published CMS page.`);
        }
        assertCanonicalSnapshot(resolved);
        const contentHash = await sha256Hex(resolved.canonicalSnapshot);
        const versionId = await sha256Hex(
            JSON.stringify({
                schema: "cms-signup-legal-document-version-v1",
                key: definition.key,
                label: definition.label,
                consentText: definition.consentText,
                contentHash,
            }),
        );
        return {
            documentKey: definition.key,
            versionId,
            label: definition.label,
            consentText: definition.consentText,
            pageSnapshot: structuredClone(resolved.snapshot),
            pageSnapshotCanonical: resolved.canonicalSnapshot,
            contentHash,
        };
    }
}

function assertDefinitions(definitions: readonly SignupLegalDocumentDefinition[]): void {
    const keys = new Set<string>();
    for (const definition of definitions) {
        if (
            !definition.key.trim() ||
            !definition.label.trim() ||
            !definition.consentText.trim() ||
            !definition.pageId.trim()
        ) {
            throw new Error("Enabled signup legal documents require key, label, consent text and page id.");
        }
        if (keys.has(definition.key)) {
            throw new Error(`Duplicate signup legal document key "${definition.key}".`);
        }
        keys.add(definition.key);
    }
}

function assertCanonicalSnapshot(resolved: ResolvedSignupLegalPage): void {
    let parsed: unknown;
    try {
        parsed = JSON.parse(resolved.canonicalSnapshot);
    } catch {
        throw new Error("Published signup legal page canonical snapshot is invalid JSON.");
    }
    if (JSON.stringify(parsed) !== JSON.stringify(resolved.snapshot)) {
        throw new Error("Published signup legal page snapshot does not match its canonical serialization.");
    }
}

function assertExactAcceptance(accepted: readonly string[], expected: readonly string[]): void {
    if (!Array.isArray(accepted) || accepted.some((id) => typeof id !== "string" || !id)) {
        throw new AuthValidationError("acceptedLegalDocumentVersionIds", "must be an array of version ids");
    }
    const acceptedSet = new Set(accepted);
    const exact =
        acceptedSet.size === accepted.length &&
        acceptedSet.size === expected.length &&
        expected.every((id) => acceptedSet.has(id));
    if (!exact) {
        throw new AuthValidationError(
            "acceptedLegalDocumentVersionIds",
            "all current signup legal documents must be explicitly accepted",
        );
    }
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
