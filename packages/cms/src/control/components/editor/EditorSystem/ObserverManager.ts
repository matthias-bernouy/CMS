
import { ImageEditor } from "src/control/core/editorSystem/defaultEditors/ImageEditor/ImageEditor";
import type { Editor } from "../../../core/editorSystem/Editor/Editor";
import { EmptyEditor } from "../../../core/editorSystem/registerEditor";
import { TextEditor, textTags } from "src/control/core/editorSystem/defaultEditors/TextEditor";
import { ListEditor } from "src/control/core/editorSystem/defaultEditors/ListEditor";
import { SnippetEditor } from "src/control/core/editorSystem/defaultEditors/SnippetEditor";

export type TagElement = {
    cl: new (node: HTMLElement) => Editor,
    visible?: boolean,
    tag: string,
    group?: string,
    label: string
}

export class ObserverManager {

    private workingElement: HTMLElement;
    private observer?: MutationObserver;

    private editors: Map<string, TagElement> = new Map();

    private groups: Set<string> = new Set(["default"])

    private opaqueTags: Set<string> = new Set();

    constructor(slot: HTMLSlotElement) {
        const root = slot.getRootNode();
        if (!(root instanceof ShadowRoot)) {
            throw new Error("ObserverManager: slot must live in a ShadowRoot");
        }
        const host = root.host as HTMLElement;
        this.workingElement = host;

        this._registerEditors();

        const initialAssigned = slot.assignedElements({ flatten: true }) as HTMLElement[];
        initialAssigned.forEach((el) => {
            this.make_it_editor(el);
            el.querySelectorAll('*').forEach((child) =>
                this.make_it_editor(child as HTMLElement)
            );
        });

        const callback = (mutationsList: MutationRecord[]) => {
            const allAdded = new Set<Node>();
            for (const mutation of mutationsList) {
                for (const node of Array.from(mutation.addedNodes)) {
                    allAdded.add(node);
                }
            }

            for (const mutation of mutationsList) {
                for (const removeNode of Array.from(mutation.removedNodes)) {
                    const node = removeNode as any;
                    if (!node.getAttribute) continue;
                    const identifier = node.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
                    if (!identifier) continue;
                    const componentParent = node.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);

                    if (allAdded.has(node)) {
                        document.compIdentifierToEditor.get(componentParent)?.onChildrenRemoved(node as HTMLElement);
                        continue;
                    }

                    document.compIdentifierToEditor.get(componentParent)?.onChildrenRemoved(node as HTMLElement);
                    this._disposeSubtree(node);
                    document.compIdentifierToEditor.get(identifier)?.dispose();
                }

                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node: Node) => {
                        if (!(node instanceof HTMLElement)) return;

                        //if (node.hasAttribute("slot")) return;

                        if (node.getAttribute(p9r.attr.EDITOR.IS_EDITOR)) {
                            const newParentId = node.parentElement?.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
                            if (newParentId) {
                                document.compIdentifierToEditor.get(newParentId)?.onChildrenAdded(node);
                            }
                            return;
                        }

                        this.make_it_editor(node);
                        node.querySelectorAll('*').forEach((child) =>
                            this.make_it_editor(child as HTMLElement)
                        );
                    });
                }
            }
        };

        this.observer = new MutationObserver(callback);
        this.observer.observe(host, {
            childList: true,
            subtree: true
        });

        slot.addEventListener("slotchange", () => {
            const current = slot.assignedElements({ flatten: true }) as HTMLElement[];
            current.forEach((el) => {
                if (el.getAttribute(p9r.attr.EDITOR.IS_EDITOR)) return;
                this.make_it_editor(el);
                el.querySelectorAll('*').forEach((child) =>
                    this.make_it_editor(child as HTMLElement)
                );
            });
        });
    }
    private _registerEditors() {
        textTags.forEach((tag) => {
            if (["span", "a"].includes(tag)) {
                this.register_editor({
                    tag,
                    cl: TextEditor,
                    visible: false,
                    label: tag
                });
            } else {
                this.register_editor({
                    tag,
                    label: tag,
                    cl: TextEditor
                });
            }
        })

        this.register_editor({
            tag: "img",
            label: "image",
            cl: ImageEditor
        });

        this.register_editor({
            tag: "ul",
            cl: ListEditor,
            label: "ul"
        });

        this.register_editor({
            tag: "ol",
            cl: ListEditor,
            label: "ol"
        });

        this.register_editor({
            tag: "w13c-snippet",
            cl: SnippetEditor,
            label: "snippet",
            visible: false
        });

        if (document.editors) {
            for (const editor of document.editors) {
                if (editor.cl instanceof EmptyEditor) {
                    this.register_editor_opaque(editor);
                } else {
                    this.register_editor(editor);
                }
            }
        }
    }

    dispose() {
        this.observer?.disconnect();
        this.observer = undefined;
        const map = document.compIdentifierToEditor;
        if (!map) return;
        const descendants = this.workingElement.querySelectorAll(`[${p9r.attr.EDITOR.IDENTIFIER}]`);
        descendants.forEach((node) => {
            const id = node.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
            if (id) map.get(id)?.dispose();
        });
    }

    private _disposeSubtree(root: HTMLElement) {
        if (!root.querySelectorAll) return;
        const descendants = root.querySelectorAll(`[${p9r.attr.EDITOR.IDENTIFIER}]`);
        descendants.forEach((node) => {
            const id = node.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
            if (id) document.compIdentifierToEditor?.get(id)?.dispose();
        });
    }

    getGroups() {
        return this.groups;
    }

    getItemsByGroup(group: string) {
        return this.editors.values().filter(v => v.visible && v.group === group);
    }

    getItems() {
        return this.editors.values().filter(v => v.visible);
    }

    getLabel(tag: string): string | undefined {
        return this.editors.get(tag)?.label;
    }

    register_editor(element: TagElement): void {
        this.editors.set(element.tag, {
            ...element,
            group: element.group || "default",
            visible: element.visible ?? true
        });
        this.groups.add(element.group || "default")
        const existingElements = this.workingElement.querySelectorAll(element.tag);
        existingElements.forEach((el: any) => this.make_it_editor(el));
    }

    register_editor_opaque(element: TagElement): void {
        this.opaqueTags.add(element.tag);
        this.register_editor(element);
        const roots = this.workingElement.querySelectorAll(element.tag);
        roots.forEach((root) => this._sealOpaqueSubtree(root as HTMLElement));
    }

    private _sealOpaqueSubtree(root: HTMLElement): void {
        const descendants = root.querySelectorAll(`[${p9r.attr.EDITOR.IDENTIFIER}]`);
        descendants.forEach((node) => {
            const id = node.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
            if (!id) return;
            const editor = document.compIdentifierToEditor?.get(id);
            if (editor) {
                editor.viewClient();
                editor.dispose();
            }
        });
    }

    register_sub_components(tag: string[]) {
        tag.forEach(t => {
            this.editors.set(t, {
                cl: EmptyEditor,
                tag: t,
                label: t,
                visible: false
            })
            const existingElements = this.workingElement.querySelectorAll(t);
            existingElements.forEach((el: any) => this.make_it_editor(el));
        })

    }

    make_it_editor(node: HTMLElement) {
        if (node.getAttribute(p9r.attr.EDITOR.IS_EDITOR)) return;
        if (node.parentElement?.closest(`[${p9r.attr.EDITOR.OPAQUE}]`)) return;
        const tag = node.tagName.toLowerCase();
        if (!this.editors.has(tag)) return
        const cl = this.editors.get(tag)?.cl;
        if (cl) {
            const editor = new cl(node);
            editor.viewEditor();
        }
        if (this.opaqueTags.has(tag)) {
            node.setAttribute(p9r.attr.EDITOR.OPAQUE, "true");
        }
        const parentComponent = node.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
        if (parentComponent) {
            document.compIdentifierToEditor.get(parentComponent)?.onChildrenAdded(node);
        }
    }
}