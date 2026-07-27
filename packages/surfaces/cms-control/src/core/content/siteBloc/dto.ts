import { ContentValidationError, type SiteBlocSnapshot } from "@bernouy/cms-content";
import type { CreateSiteBlocInput, SaveSiteBlocInput } from "./service";

export function parseCreateSiteBlocInput(body: Record<string, unknown>): CreateSiteBlocInput {
    return {
        tag: requiredString(body.tag, "tag").toLowerCase(),
        name: requiredString(body.name, "name"),
        group: optionalString(body.group, "group"),
        description: optionalString(body.description, "description"),
    };
}

export function parseSaveSiteBlocInput(body: Record<string, unknown>): SaveSiteBlocInput {
    const snapshot = body.snapshot === undefined ? undefined : siteBlocSnapshot(body.snapshot);
    const structureHtml =
        body.structureHtml === undefined ? undefined : optionalString(body.structureHtml, "structureHtml");
    if (!snapshot && structureHtml === undefined) {
        throw new ContentValidationError("structureHtml", "structureHtml or snapshot is required");
    }
    return {
        expectedDraftRevision: parseRevision(body.expectedDraftRevision),
        name: snapshot?.name ?? requiredString(body.name, "name"),
        group: snapshot?.group ?? optionalString(body.group, "group"),
        description: snapshot?.description ?? optionalString(body.description, "description"),
        defaultContent: snapshot?.defaultContent ?? optionalString(body.defaultContent, "defaultContent"),
        ...(structureHtml !== undefined ? { structureHtml } : {}),
        ...(snapshot ? { snapshot } : {}),
    };
}

export function parseRevision(value: unknown): number {
    return revision(value, "expectedDraftRevision");
}

export function parseOptionalRevision(value: string | null): number | undefined {
    return value === null ? undefined : revision(Number(value), "revision");
}

export function siteBlocTag(url: string): string {
    const tag = new URL(url).searchParams.get("id")?.trim().toLowerCase();
    if (!tag) {
        throw new ContentValidationError("id", "required query parameter");
    }
    return tag;
}

function siteBlocSnapshot(value: unknown): SiteBlocSnapshot {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ContentValidationError("snapshot", "object expected");
    }
    const snapshot = value as Partial<SiteBlocSnapshot>;
    if (!Array.isArray(snapshot.structure) || !Array.isArray(snapshot.slots)) {
        throw new ContentValidationError("snapshot", "structure and slots arrays are required");
    }
    return {
        name: requiredString(snapshot.name, "snapshot.name"),
        group: optionalString(snapshot.group, "snapshot.group"),
        description: optionalString(snapshot.description, "snapshot.description"),
        structure: snapshot.structure as SiteBlocSnapshot["structure"],
        slots: snapshot.slots as SiteBlocSnapshot["slots"],
        defaultContent: optionalString(snapshot.defaultContent, "snapshot.defaultContent"),
        dependencies: Array.isArray(snapshot.dependencies) ? (snapshot.dependencies as string[]) : [],
    };
}

function revision(value: unknown, field: string): number {
    if (!Number.isInteger(value) || (value as number) < 1) {
        throw new ContentValidationError(field, "positive integer expected");
    }
    return value as number;
}

function requiredString(value: unknown, field: string): string {
    const text = optionalString(value, field).trim();
    if (!text) {
        throw new ContentValidationError(field, "required");
    }
    return text;
}

function optionalString(value: unknown, field: string): string {
    if (value === undefined || value === null) {
        return "";
    }
    if (typeof value !== "string") {
        throw new ContentValidationError(field, "string expected");
    }
    return value;
}
