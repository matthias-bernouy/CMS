import type { Editor } from '@bernouy/cms/editor';
import type EditorRoot from '../../EditorRoot/EditorRoot';
import { ancestorChain, collapseChain } from './ancestorChain';
import type { BreadcrumbItem } from '../sub/Breadcrumb/Breadcrumb';

export type BuiltBreadcrumb = {
    items: BreadcrumbItem[];
    /** Reverse lookup: `parent` items carry an opaque key that resolves to
     *  the corresponding Editor instance — used by the click handler. */
    editorByKey: Map<string, Editor>;
};

/**
 * Walks the editor's ancestor chain and produces the (collapsed) sequence
 * of items the Breadcrumb component renders. Returns an empty result when
 * no labels are available — caller should clear the breadcrumb in that case.
 */
export function buildBreadcrumb(editor: Editor, editorSystem: EditorRoot): BuiltBreadcrumb {
    const observer = editorSystem.observer;

    const labelled = ancestorChain(editor)
        .map(ed => {
            const label = observer?.getLabel(ed.target.tagName.toLowerCase());
            return label ? { editor: ed, label } : null;
        })
        .filter((it): it is { editor: Editor; label: string } => it !== null);

    if (labelled.length === 0) return { items: [], editorByKey: new Map() };

    const collapsed = collapseChain(labelled);
    const editorByKey = new Map<string, Editor>();
    const items: BreadcrumbItem[] = collapsed.map((it, idx) => {
        const isLast = idx === collapsed.length - 1;
        if (it === null) return { type: 'ellipsis' };
        if (isLast) return { type: 'current', label: it.label };
        const key = it.editor.identifier;
        editorByKey.set(key, it.editor);
        return { type: 'parent', key, label: it.label };
    });

    return { items, editorByKey };
}
