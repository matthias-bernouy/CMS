import { analyzeExpandedPageDocument } from "content/blocs/core/markup/validation/documents/expandedPageDocument";
import { dynamicValue } from "content/blocs/core/markup/validation/documents/expanded/context";
import type { CompositionDefinition } from "content/blocs/core/composition/expandCompositions";
import type { TPage } from "content/pages/interfaces/pages";

export type FragmentIndex = Readonly<{
    hasId(id: string): boolean;
    isConditional(id: string): boolean;
    dynamic: boolean;
}>;
type IndexedPage = Readonly<{ index: FragmentIndex; nodes: number; characters: number }>;
type Entry = { content: string; revision: number; value: IndexedPage; bytes: number };

/** One batch's immutable evidence only. Route visibility and each source's budget remain live. */
export class PageFragmentIndexCache {
    private readonly definitions: readonly CompositionDefinition[];
    private readonly entries = new Map<string, Entry>();
    private bytes = 0;

    constructor(
        definitions: readonly CompositionDefinition[],
        private readonly maxEntries = 128,
        private readonly maxBytes = 8 * 1024 * 1024,
    ) {
        if ([maxEntries, maxBytes].some((value) => !Number.isSafeInteger(value) || value < 1)) {
            throw new TypeError("Invalid fragment cache limits");
        }
        this.definitions = definitions.map(({ id, kind, markupHTML }) => ({ id, kind, markupHTML }));
    }

    get size(): number {
        return this.entries.size;
    }

    get retainedBytes(): number {
        return this.bytes;
    }

    read(target: TPage, definitions: readonly CompositionDefinition[]): IndexedPage {
        const sameDefinitions =
            definitions.length === this.definitions.length &&
            definitions.every((value, index) => {
                const expected = this.definitions[index]!;
                return (
                    value.id === expected.id && value.kind === expected.kind && value.markupHTML === expected.markupHTML
                );
            });
        const cached = sameDefinitions ? this.entries.get(target.id) : undefined;
        if (cached && cached.revision === target.revision && cached.content === target.content) {
            this.entries.delete(target.id);
            this.entries.set(target.id, cached);
            return cached.value;
        }
        const analysis = analyzeExpandedPageDocument(target.content, definitions, false);
        const ids = new Set<string>();
        const conditional = new Set<string>();
        let dynamic = false;
        for (const element of analysis.context.elements) {
            if (!element.id) {
                continue;
            }
            dynamic ||= dynamicValue(element.id);
            ids.add(element.id);
            const state = analysis.context.presence.get(element)!;
            if (state.branches.size || state.conditions.size || state.repeated) {
                conditional.add(element.id);
            }
        }
        const value: IndexedPage = Object.freeze({
            index: Object.freeze({
                hasId: (id: string) => ids.has(id),
                isConditional: (id: string) => conditional.has(id),
                dynamic,
            }),
            nodes: analysis.context.elements.length,
            characters: analysis.root.innerHTML.length,
        });
        const bytes =
            (target.content.length + target.id.length) * 2 +
            [...ids, ...conditional].reduce((sum, id) => sum + id.length * 2 + 64, 0) +
            256;
        if (sameDefinitions && bytes <= this.maxBytes) {
            const previous = this.entries.get(target.id);
            if (previous) {
                this.bytes -= previous.bytes;
                this.entries.delete(target.id);
            }
            while (this.entries.size && (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes)) {
                const oldest = this.entries.keys().next().value!;
                this.bytes -= this.entries.get(oldest)!.bytes;
                this.entries.delete(oldest);
            }
            this.entries.set(target.id, { content: target.content, revision: target.revision, value, bytes });
            this.bytes += bytes;
        }
        return value;
    }
}
