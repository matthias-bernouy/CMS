import {
    type EditableState,
    type EditableStateSession,
    type Editor,
} from "@bernouy/cms-content/editor";

import type { StructureNode } from "../../../../../runtime";

export function toggleStateSession(
    sessionsByEditor: WeakMap<Editor, Map<string, EditableStateSession>>,
    editor: Editor,
    state: EditableState,
): void {
    const sessions = sessionsByEditor.get(editor) ?? new Map<string, EditableStateSession>();

    if (sessions.has(state.id)) {
        exitStateSession(sessionsByEditor, editor, state.id);
        return;
    }

    if (state.group) {
        for (const candidate of editor.getStates()) {
            if (candidate.id !== state.id && candidate.group === state.group) {
                exitStateSession(sessionsByEditor, editor, candidate.id);
            }
        }
    }

    const session = state.enter();
    sessions.set(state.id, session);
    sessionsByEditor.set(editor, sessions);
}

export function exitStateSession(
    sessionsByEditor: WeakMap<Editor, Map<string, EditableStateSession>>,
    editor: Editor,
    stateId: string,
): void {
    const sessions = sessionsByEditor.get(editor);
    const session = sessions?.get(stateId);
    if (!sessions || !session) return;

    session.exit();
    sessions.delete(stateId);
}

export function exitAllStateSessions(
    sessionsByEditor: WeakMap<Editor, Map<string, EditableStateSession>>,
    nodes: StructureNode[],
): void {
    for (const node of flattenStructure(nodes)) {
        if (isSourceStateNode(node)) continue;
        const sessions = sessionsByEditor.get(node.editor);
        if (!sessions) continue;

        for (const session of sessions.values()) {
            session.exit();
        }
        sessions.clear();
    }
}

function flattenStructure(nodes: StructureNode[]): StructureNode[] {
    return nodes.flatMap(node => [node, ...flattenStructure(node.children)]);
}

function isSourceStateNode(node: StructureNode): node is Extract<StructureNode, { kind: "source-state" }> {
    return node.kind === "source-state";
}
