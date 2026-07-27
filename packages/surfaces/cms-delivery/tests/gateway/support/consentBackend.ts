type ConsentDocument = {
    documentKey: string;
    versionId: string;
    label: string;
    consentText: string;
    page: { id: string; path: string; title: string };
    contentHash: string;
};

type Intent = { subjectClaim: string; versionIds: string[] };
type Acceptance = Intent & { id: string; cmsUserId: string; acceptedAt: string };

export class ConsentBackend {
    enabled = false;
    contextKey = "signup";
    documents: ConsentDocument[] = [];
    failCommit = false;
    readonly intents = new Map<string, Intent>();
    readonly acceptances = new Map<string, Acceptance>();
    readonly calls: string[] = [];

    readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const request = requestOf(input, init);
        const path = new URL(request.url).pathname;
        this.calls.push(path);
        if (!request.headers.get("authorization")?.startsWith("Bearer cms_consent_")) {
            return json({ error: "unauthorized" }, 401);
        }
        if (path.endsWith("/context/sync")) {
            return this.sync(await request.json());
        }
        if (path.endsWith("/requirements")) {
            return json({ enabled: this.enabled, contextKey: this.contextKey, documents: this.documents });
        }
        if (path.endsWith("/acceptances/stage")) {
            return this.stage(await request.json());
        }
        if (path.endsWith("/acceptances/commit")) {
            return this.commit(await request.json());
        }
        return json({ error: `unexpected consent route: ${path}` }, 404);
    };

    rotateDocuments(): void {
        this.documents = this.documents.map((document, index) => ({
            ...document,
            versionId: String.fromCharCode(99 + index).repeat(64),
            contentHash: String.fromCharCode(99 + index).repeat(64),
        }));
    }

    private sync(body: unknown): Response {
        const payload = record(body);
        const configuration = record(
            typeof payload.configuration === "string" ? JSON.parse(payload.configuration) : payload.configuration,
        );
        this.enabled = configuration.enabled === true;
        this.contextKey = String(configuration.contextKey ?? "signup");
        const documents = Array.isArray(configuration.documents) ? configuration.documents : [];
        this.documents = documents
            .filter((candidate) => record(candidate).enabled !== false)
            .map((candidate, index) => documentOf(record(candidate), index));
        return json({ contextKey: this.contextKey, enabled: this.enabled, documentCount: this.documents.length });
    }

    private stage(body: unknown): Response {
        const payload = record(body);
        if (!this.enabled) {
            return json({ staged: false, attemptId: "", requiredCount: 0 });
        }
        const attemptId = typeof payload.attemptId === "string" ? payload.attemptId : "";
        const subjectClaim = normalizeClaim(payload.subjectClaim);
        const versionIds = stringArray(payload.acceptedVersionIds);
        if (!attemptId || !subjectClaim || !versionIds.length) {
            return json({ error: "consent attempt and evidence are required" }, 400);
        }
        const currentIds = this.documents.map((document) => document.versionId).sort();
        if (!sameValues(versionIds, currentIds)) {
            return json({ error: "CONSENT_DOCUMENT_VERSION_CHANGED" }, 409);
        }
        const existing = this.intents.get(attemptId) ?? this.acceptances.get(attemptId);
        if (existing && (existing.subjectClaim !== subjectClaim || !sameValues(existing.versionIds, versionIds))) {
            return json({ error: "consent attempt belongs to different evidence" }, 409);
        }
        this.intents.set(attemptId, { subjectClaim, versionIds });
        return json({ staged: true, attemptId, requiredCount: currentIds.length });
    }

    private commit(body: unknown): Response {
        const payload = record(body);
        const cmsUserId = typeof payload.cmsUserId === "string" ? payload.cmsUserId : "";
        if (!this.enabled && cmsUserId) {
            return json({ committed: false, acceptanceId: null, cmsUserId, acceptedAt: null });
        }
        if (this.failCommit) {
            return json({ error: "temporary commit outage" }, 503);
        }
        const attemptId = typeof payload.attemptId === "string" ? payload.attemptId : "";
        const existing = this.acceptances.get(attemptId);
        if (existing) {
            return commitResponse(existing);
        }
        const intent = this.intents.get(attemptId);
        if (!intent || intent.subjectClaim !== normalizeClaim(payload.subjectClaim) || !cmsUserId) {
            return json({ error: "consent attempt was not staged" }, 409);
        }
        const acceptedAt = new Date().toISOString();
        const acceptance = { ...intent, id: crypto.randomUUID(), cmsUserId, acceptedAt };
        this.acceptances.set(attemptId, acceptance);
        this.intents.delete(attemptId);
        return commitResponse(acceptance);
    }
}

function documentOf(value: Record<string, unknown>, index: number): ConsentDocument {
    const page = record(value.page);
    const hash = String.fromCharCode(97 + index).repeat(64);
    return {
        documentKey: String(value.key),
        versionId: hash,
        contentHash: hash,
        label: String(value.label),
        consentText: String(value.consentText),
        page: { id: String(page.id), path: String(page.path), title: String(page.title) },
    };
}

function commitResponse(value: Acceptance): Response {
    return json({ committed: true, acceptanceId: value.id, cmsUserId: value.cmsUserId, acceptedAt: value.acceptedAt });
}

function requestOf(input: string | URL | Request, init?: RequestInit): Request {
    return input instanceof Request && !init ? input : new Request(input, init);
}

function record(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function normalizeClaim(value: unknown): string {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function stringArray(value: unknown): string[] {
    return (Array.isArray(value) ? value : typeof value === "string" ? [value] : []).map(String).sort();
}

function sameValues(left: string[], right: string[]): boolean {
    return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function json(body: unknown, status = 200): Response {
    return Response.json(body, { status });
}
