import { parseSyncTarget, type CmsSyncTarget } from "cms-content/blocs/core/markup/bindings";
import { currentParams, PARAMS_CHANGE_EVENT, setParam } from "../params";

export const CMS_SYNC_CHANGE_EVENT = "cms-sync:change";

type StoredValue = { readonly version: 1; readonly value: unknown; readonly expiresAt?: number };
type SyncChange = { readonly target: string };

const PAGE_VALUES = new WeakMap<Document, Map<string, unknown>>();
const STORAGE_PREFIX = "cms-sync:v1:";
const MAX_SESSION_BYTES = 128 * 1024;
const MAX_PERSISTENT_BYTES = 256 * 1024;

export function readSyncValue(target: CmsSyncTarget, doc: Document = document): unknown {
    if (target.scope === "param") {
        return currentParamsFor(doc).get(target.key) ?? undefined;
    }
    if (target.scope === "page") {
        return pageValues(doc).get(target.key);
    }
    const storage = browserStorage(target.scope, doc);
    if (!storage) {
        return undefined;
    }
    const key = storageKey(target);
    const stored = parseStoredValue(storage.getItem(key));
    if (!stored) {
        storage.removeItem(key);
        return undefined;
    }
    if (stored.expiresAt !== undefined && stored.expiresAt <= Date.now()) {
        storage.removeItem(key);
        return undefined;
    }
    return stored.value;
}

export function writeSyncValue(
    target: CmsSyncTarget,
    value: unknown,
    doc: Document = document,
    options: { readonly expiresAt?: number } = {},
): void {
    if (target.scope === "param") {
        const next = paramValue(value);
        if ((currentParamsFor(doc).get(target.key) ?? "") === next) {
            return;
        }
        setParam(target.key, next);
        return;
    }
    if (target.scope === "page") {
        const values = pageValues(doc);
        const previous = values.get(target.key);
        if (Object.is(previous, value)) {
            return;
        }
        if (value === undefined) {
            values.delete(target.key);
        } else {
            values.set(target.key, value);
        }
        dispatchChange(target, doc);
        return;
    }
    const storage = browserStorage(target.scope, doc);
    if (!storage) {
        throw new Error(`${target.scope} storage is unavailable`);
    }
    const key = storageKey(target);
    const previous = storage.getItem(key);
    const serialized = value === undefined ? null : serializeStoredValue(value, target.scope, options.expiresAt);
    if (previous === serialized) {
        return;
    }
    if (serialized === null) {
        storage.removeItem(key);
    } else {
        storage.setItem(key, serialized);
    }
    dispatchChange(target, doc);
}

export function subscribeSyncValue(
    target: CmsSyncTarget,
    listener: (value: unknown) => void,
    doc: Document = document,
): () => void {
    const serializedTarget = `@${target.scope}:${target.key}`;
    const onChange = (event: Event) => {
        if ((event as CustomEvent<SyncChange>).detail?.target === serializedTarget) {
            listener(readSyncValue(target, doc));
        }
    };
    const onParamChange = () => {
        if (target.scope === "param") {
            listener(readSyncValue(target, doc));
        }
    };
    const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey(target)) {
            listener(readSyncValue(target, doc));
        }
    };
    doc.addEventListener(CMS_SYNC_CHANGE_EVENT, onChange);
    if (target.scope === "param") {
        doc.addEventListener(PARAMS_CHANGE_EVENT, onParamChange);
        doc.defaultView?.addEventListener("popstate", onParamChange);
    } else if (target.scope === "persistent" || target.scope === "session") {
        doc.defaultView?.addEventListener("storage", onStorage);
    }
    return () => {
        doc.removeEventListener(CMS_SYNC_CHANGE_EVENT, onChange);
        doc.removeEventListener(PARAMS_CHANGE_EVENT, onParamChange);
        doc.defaultView?.removeEventListener("popstate", onParamChange);
        doc.defaultView?.removeEventListener("storage", onStorage);
    };
}

export function parseSyncAttribute(element: Element): CmsSyncTarget | null {
    return parseSyncTarget(element.getAttribute("cms-sync"));
}

function currentParamsFor(doc: Document): URLSearchParams {
    return doc === globalThis.document ? currentParams() : new URLSearchParams(doc.defaultView?.location.search ?? "");
}

function paramValue(value: unknown): string {
    if (value === undefined || value === null || value === "") {
        return "";
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    throw new TypeError("URL parameter synchronization only accepts scalar values");
}

function pageValues(doc: Document): Map<string, unknown> {
    let values = PAGE_VALUES.get(doc);
    if (!values) {
        values = new Map();
        PAGE_VALUES.set(doc, values);
    }
    return values;
}

function browserStorage(scope: "session" | "persistent", doc: Document): Storage | null {
    try {
        return scope === "session"
            ? (doc.defaultView?.sessionStorage ?? null)
            : (doc.defaultView?.localStorage ?? null);
    } catch {
        return null;
    }
}

function storageKey(target: CmsSyncTarget): string {
    return `${STORAGE_PREFIX}${target.scope}:${target.key}`;
}

function serializeStoredValue(value: unknown, scope: "session" | "persistent", expiresAt?: number): string {
    const payload: StoredValue = { version: 1, value, ...(expiresAt === undefined ? {} : { expiresAt }) };
    const serialized = JSON.stringify(payload);
    if (serialized === undefined) {
        throw new TypeError("Synchronized state must be JSON-serializable");
    }
    const bytes = new TextEncoder().encode(serialized).byteLength;
    const limit = scope === "session" ? MAX_SESSION_BYTES : MAX_PERSISTENT_BYTES;
    if (bytes > limit) {
        throw new RangeError(`${scope} synchronized state exceeds ${limit} bytes`);
    }
    return serialized;
}

function parseStoredValue(value: string | null): StoredValue | null {
    if (!value) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return null;
        }
        const record = parsed as Record<string, unknown>;
        if (record.version !== 1 || !("value" in record)) {
            return null;
        }
        if (
            record.expiresAt !== undefined &&
            (typeof record.expiresAt !== "number" || !Number.isFinite(record.expiresAt))
        ) {
            return null;
        }
        return parsed as StoredValue;
    } catch {
        return null;
    }
}

function dispatchChange(target: CmsSyncTarget, doc: Document): void {
    const EventConstructor = doc.defaultView?.CustomEvent ?? CustomEvent;
    doc.dispatchEvent(
        new EventConstructor(CMS_SYNC_CHANGE_EVENT, {
            detail: { target: `@${target.scope}:${target.key}` } satisfies SyncChange,
        }),
    );
}
