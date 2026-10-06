import type { SourceStatusValue } from "../presentation/sourceStatus";
import { readSourceData } from "../values";

export type SourceObservation = Readonly<SourceStatusValue & { disposed: boolean; data: unknown }>;
type Observer = (state: SourceObservation) => void;
const observers = new WeakMap<Element, Set<Observer>>();
const snapshots = new WeakMap<Element, SourceObservation>();

/** Observe a bound source after presentation, without owning its requests or rendering. */
export function observeSource(source: Element, observer: Observer): () => void {
    let listeners = observers.get(source);
    if (!listeners) {
        listeners = new Set();
        observers.set(source, listeners);
    }
    listeners.add(observer);
    const current = snapshots.get(source);
    if (current) {
        observer(current);
    }
    return () => listeners.delete(observer);
}

export function publishSourceObservation(source: Element, status: SourceStatusValue, disposed = false): void {
    const snapshot = Object.freeze({ ...status, disposed, data: readSourceData(source) });
    snapshots.set(source, snapshot);
    for (const observer of [...(observers.get(source) ?? [])]) {
        observer(snapshot);
    }
}

export function disposeSourceObservation(source: Element): void {
    publishSourceObservation(source, { loading: false, loaded: false, empty: false, error: false }, true);
    snapshots.delete(source);
}
