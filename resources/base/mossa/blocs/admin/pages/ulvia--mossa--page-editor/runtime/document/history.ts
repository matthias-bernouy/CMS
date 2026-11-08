export type EditorSnapshot = Readonly<{
    source: string;
    selection: readonly number[] | null;
}>;

export class EditorHistory {
    private readonly past: EditorSnapshot[] = [];
    private readonly future: EditorSnapshot[] = [];

    constructor(private readonly limit = 100) {}

    reset(): void {
        this.past.length = 0;
        this.future.length = 0;
    }

    record(snapshot: EditorSnapshot): void {
        this.past.push(snapshot);
        if (this.past.length > this.limit) {
            this.past.shift();
        }
        this.future.length = 0;
    }

    undo(current: EditorSnapshot): EditorSnapshot | null {
        const previous = this.past.pop() ?? null;
        if (previous) {
            this.future.push(current);
        }
        return previous;
    }

    redo(current: EditorSnapshot): EditorSnapshot | null {
        const next = this.future.pop() ?? null;
        if (next) {
            this.past.push(current);
        }
        return next;
    }

    get canUndo(): boolean {
        return this.past.length > 0;
    }

    get canRedo(): boolean {
        return this.future.length > 0;
    }
}
