import {
    SOURCE_OVERLAY_EDITABLE_SCOPES,
    SOURCE_OVERLAY_FIELD_TYPES,
    type SourceOverlayEditableScope,
    type SourceOverlayFieldType,
} from "@bernouy/cms-sources";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";

const SIMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SAFE_PATH = /^[A-Za-z_$][\w$]*(\[\])?(\.[A-Za-z_$][\w$]*(\[\])?)*$/;
const FIELD_PATH = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

export function isSimpleId(value: string): boolean {
    return SIMPLE_ID.test(value);
}

export function requiredId(value: unknown, name: string): string {
    const result = requiredText(value, name);
    if (!isSimpleId(result)) {
        throw new InvalidParam(name, "must be a simple id.");
    }
    return result;
}

export function requiredText(value: unknown, name: string): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new MissingParam(name);
    }
    return value.trim();
}

export function fieldType(value: unknown, name: string): SourceOverlayFieldType {
    if ((SOURCE_OVERLAY_FIELD_TYPES as readonly unknown[]).includes(value)) {
        return value as SourceOverlayFieldType;
    }
    throw new InvalidParam(name, `must be ${SOURCE_OVERLAY_FIELD_TYPES.join("|")}.`);
}

export function editableScope(value: unknown, name: string): SourceOverlayEditableScope {
    if ((SOURCE_OVERLAY_EDITABLE_SCOPES as readonly unknown[]).includes(value)) {
        return value as SourceOverlayEditableScope;
    }
    throw new InvalidParam(name, `must be ${SOURCE_OVERLAY_EDITABLE_SCOPES.join("|")}.`);
}

export function fieldPath(value: unknown, name: string): string {
    const result = requiredText(value, name);
    if (!FIELD_PATH.test(result)) {
        throw new InvalidParam(name, "must be a dotted object path.");
    }
    return result;
}

export function targetPath(value: unknown, name: string): string {
    if (value === "") {
        return "";
    }
    const result = requiredText(value, name);
    if (!SAFE_PATH.test(result)) {
        throw new InvalidParam(name, "must be a dotted shape path.");
    }
    return result;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
