import { parseSyncSelection, parseSyncTarget } from "cms-content/blocs/core/markup/bindings/sync";
import type { CmsSyncSelection, CmsSyncTarget } from "cms-content/blocs/core/markup/bindings/types";
import { parseJsonValue, serializeJsonValue } from "./jsonValue";

const CMS_SYNC_CHANGE_EVENT = "cms-sync:change";

type StoredValue = { readonly version: 1; readonly value: unknown; readonly expiresAt?: number };
export type SyncChange = { readonly target: string; readonly source?: Element };

const PAGE_VALUES = new WeakMap<Document, Map<string, string>>();
const STORAGE_PREFIX = "cms-sync:v1:";
const MAX_PAGE_BYTES = 256 * 1024;
const MAX_SESSION_BYTES = 128 * 1024;
const MAX_PERSISTENT_BYTES = 256 * 1024;

export function readSyncValue(target: CmsSyncTarget, doc: Document = document): unknown {
    if (target.scope === "param") {
        return currentParamsFor(doc).get(target.key) ?? undefined;
    }
    if (target.scope === "page") {
        const serialized = pageValues(doc).get(target.key);
        return serialized === undefined ? undefined : parseJsonValue(serialized);
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
    options: { readonly expiresAt?: number; readonly source?: Element } = {},
): void {
    if (target.scope === "param") {
        const next = paramValue(value);
        if ((currentParamsFor(doc).get(target.key) ?? "") === next) {
            return;
        }
        writeParam(target.key, next, doc);
        dispatchChange(target, doc, options.source);
        return;
    }
    if (target.scope === "page") {
        const values = pageValues(doc);
        const serialized = value === undefined ? undefined : serializeJsonValue(value);
        if (serialized !== undefined) {
            assertSerializedSize(serialized, "page", MAX_PAGE_BYTES);
        }
        const previous = values.get(target.key);
        if (previous === serialized) {
            return;
        }
        if (serialized === undefined) {
            values.delete(target.key);
        } else {
            values.set(target.key, serialized);
        }
        dispatchChange(target, doc, options.source);
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
    dispatchChange(target, doc, options.source);
}

export function subscribeSyncValue(
    target: CmsSyncTarget,
    listener: (value: unknown, change: SyncChange) => void,
    doc: Document = document,
): () => void {
    const serializedTarget = `@${target.scope}:${target.key}`;
    const onChange = (event: Event) => {
        if ((event as CustomEvent<SyncChange>).detail?.target === serializedTarget) {
            listener(readSyncValue(target, doc), (event as CustomEvent<SyncChange>).detail);
        }
    };
    const onNavigation = () => {
        if (target.scope === "param") {
            listener(readSyncValue(target, doc), { target: serializedTarget });
        }
    };
    const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey(target)) {
            listener(readSyncValue(target, doc), { target: serializedTarget });
        }
    };
    doc.addEventListener(CMS_SYNC_CHANGE_EVENT, onChange);
    if (target.scope === "param") {
        doc.defaultView?.addEventListener("popstate", onNavigation);
    } else if (target.scope === "persistent" || target.scope === "session") {
        doc.defaultView?.addEventListener("storage", onStorage);
    }
    return () => {
        doc.removeEventListener(CMS_SYNC_CHANGE_EVENT, onChange);
        doc.defaultView?.removeEventListener("popstate", onNavigation);
        doc.defaultView?.removeEventListener("storage", onStorage);
    };
}

export function parseSyncAttribute(element: Element): CmsSyncTarget | null {
    return parseSyncTarget(element.getAttribute("cms-sync"));
}

export function parseSyncSelectionAttribute(element: Element): CmsSyncSelection | null {
    const value = element.getAttribute("cms-sync-select");
    if (value === null) {
        return null;
    }
    const selection = parseSyncSelection(value);
    if (!selection) {
        throw new TypeError("Invalid CMS sync selection");
    }
    return selection;
}

function currentParamsFor(doc: Document): URLSearchParams {
    return new URLSearchParams(doc.defaultView?.location.search ?? "");
}

function writeParam(name: string, value: string, doc: Document): void {
    const win = doc.defaultView;
    if (!win) {
        throw new Error("URL parameter synchronization requires a browser window");
    }
    const params = currentParamsFor(doc);
    if (value === "") {
        params.delete(name);
    } else {
        params.set(name, value);
    }
    const query = params.toString();
    win.history.replaceState(
        win.history.state,
        "",
        `${win.location.pathname}${query ? `?${query}` : ""}${win.location.hash}`,
    );
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

function pageValues(doc: Document): Map<string, string> {
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
    const normalized = parseJsonValue(serializeJsonValue(value));
    const payload: StoredValue = { version: 1, value: normalized, ...(expiresAt === undefined ? {} : { expiresAt }) };
    const serialized = JSON.stringify(payload);
    const limit = scope === "session" ? MAX_SESSION_BYTES : MAX_PERSISTENT_BYTES;
    assertSerializedSize(serialized, scope, limit);
    return serialized;
}

function assertSerializedSize(serialized: string, scope: "page" | "session" | "persistent", limit: number): void {
    if (new TextEncoder().encode(serialized).byteLength > limit) {
        throw new RangeError(`${scope} synchronized state exceeds ${limit} bytes`);
    }
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
        const normalized = parseJsonValue(serializeJsonValue(record.value));
        return {
            version: 1,
            value: normalized,
            ...(record.expiresAt === undefined ? {} : { expiresAt: record.expiresAt }),
        };
    } catch {
        return null;
    }
}

function dispatchChange(target: CmsSyncTarget, doc: Document, source?: Element): void {
    const EventConstructor = doc.defaultView?.CustomEvent ?? CustomEvent;
    doc.dispatchEvent(
        new EventConstructor(CMS_SYNC_CHANGE_EVENT, {
            detail: { target: `@${target.scope}:${target.key}`, ...(source ? { source } : {}) } satisfies SyncChange,
        }),
    );
}
