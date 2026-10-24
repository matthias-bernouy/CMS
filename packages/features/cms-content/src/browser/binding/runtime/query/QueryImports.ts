import { parseQueries } from "cms-content/blocs/core/markup/bindings/operation/query";
import { QUERIES_ATTR } from "../../core/attrs";
import { readSyncValue, subscribeSyncValue } from "../../state/SyncState";
import { initialQueryState, isQueryState, successfulQueryState, type QueryState } from "./queryState";

export class QueryImports {
    private readonly states = new Map<string, QueryState>();
    private readonly stops: Array<() => void> = [];

    constructor(
        private readonly element: Element,
        private readonly onChange: () => void,
    ) {}

    start(): void {
        const imports = parseQueries(this.element.getAttribute(QUERIES_ATTR));
        if (!imports) {
            return;
        }
        for (const binding of imports) {
            this.states.set(binding.name, normalizeQueryState(readSyncValue(binding.sync, this.element.ownerDocument)));
            this.stops.push(
                subscribeSyncValue(
                    binding.sync,
                    (value) => {
                        this.states.set(binding.name, normalizeQueryState(value));
                        this.onChange();
                    },
                    this.element.ownerDocument,
                ),
            );
        }
    }

    dispose(): void {
        for (const stop of this.stops.splice(0)) {
            stop();
        }
        this.states.clear();
    }

    variables(): Record<string, QueryState> {
        return Object.fromEntries(this.states);
    }
}

function normalizeQueryState(value: unknown): QueryState {
    if (value === undefined) {
        return initialQueryState();
    }
    return isQueryState(value) ? value : successfulQueryState(initialQueryState(), value, { status: 200 });
}
