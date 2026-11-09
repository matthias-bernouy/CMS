/** Case-insensitive file/prefix index; work is bounded by path depth, not prior file count. */
export class SourcePathIndex {
    private readonly files = new Set<string>();
    private readonly directories = new Set<string>();

    add(path: string) {
        const normalized = path.toLowerCase();
        const parents: string[] = [];
        for (
            let separator = normalized.indexOf("/");
            separator !== -1;
            separator = normalized.indexOf("/", separator + 1)
        ) {
            const parent = normalized.slice(0, separator);
            if (this.files.has(parent)) {
                throw new Error("Source paths overlap or are duplicated");
            }
            parents.push(parent);
        }
        if (this.files.has(normalized) || this.directories.has(normalized)) {
            throw new Error("Source paths overlap or are duplicated");
        }
        this.files.add(normalized);
        for (const parent of parents) {
            this.directories.add(parent);
        }
    }

    has(path: string) {
        return this.files.has(path.toLowerCase());
    }
}
