
import { NearestElementRequire } from "cms-control/errors/NearestElementRequire";
import { ImageEditor } from "cms-control/core/editorSystem/defaultEditors/ImageEditor/ImageEditor";
import { SvgEditor } from "cms-control/core/editorSystem/defaultEditors/SvgEditor";
import type { Editor } from "../../../core/editorSystem/Editor/Editor";
import { EmptyEditor } from "../../../core/editorSystem/registerEditor";
import { TextEditor, textTags } from "cms-control/core/editorSystem/defaultEditors/TextEditor";
import { ListEditor } from "cms-control/core/editorSystem/defaultEditors/ListEditor";
import { SnippetEditor } from "cms-control/core/editorSystem/defaultEditors/SnippetEditor";
import { BindingCoreEditor } from "cms-control/core/editorSystem/defaultEditors/BindingCoreEditor";
import { getEditorContext } from "cms-control/core/editorSystem/editorContext";

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
            tag: "svg",
            label: "svg",
            cl: SvgEditor as unknown as new (node: HTMLElement) => Editor,
        });
        // <a> is intercepted at the document level (`installLinkInterceptor`)
        // because most authored links live inside bloc shadow trees that
        // ObserverManager doesn't traverse.

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

        // The Shell's data-binding root, rendered into the canvas. Invisible
        // (empty label → no breadcrumb, visible:false → no picker, non-interactive
        // → no BAG); it only toggles the runtime with the editor mode.
        this.register_editor({
            tag: "cms-binding-core",
            cl: BindingCoreEditor,
            label: "",
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
        // Skip nodes that have already left the editor scope. The mutation
        // observer batches added/removed pairs from the same task tick;
        // when a bloc reshapes its descendants (clear + re-stamp), some
        // intermediate nodes appear in `addedNodes` even though they're
        // no longer connected to a `cms-editor-system` by the time we
        // look. Editorizing them is pointless (they'll be reaped on the
        // next batch) and `Editor` would throw `NearestElementRequire`,
        // killing the rest of the foreach.
        if (!node.closest("cms-editor-system")) return;
        const tag = node.tagName.toLowerCase();
        if (!this.editors.has(tag)) return
        const cl = this.editors.get(tag)?.cl;
        if (cl) {
            // Defensive try/catch: even with the closest() guard above,
            // a bloc's own constructor may sync-mutate the DOM and detach
            // the target before `Editor`'s ModeBinding gets to its own
            // `getClosestEditorSystem(target)`. We swallow the throw and
            // dispose any partially-built editor so the rest of the
            // observer batch runs and the next mutation cycle can have
            // a clean retry.
            try {
                const editor = new cl(node);
                // viewEditor() first to run the full init() lifecycle and
                // register baseline state; then drop to viewClient() if the
                // system is currently in view mode. Without this, nodes
                // added by data-driven blocs after a `?mode=view` boot stay
                // editorized forever — ModeBinding only fires on subsequent
                // switches, not on first construction.
                editor.viewEditor();
                if (getEditorContext().mode === "view") editor.viewClient();
            } catch (err) {
                if (!(err instanceof NearestElementRequire)) throw err;
                document.compIdentifierToEditor?.forEach((ed, id) => {
                    if (ed.target === node) {
                        ed.dispose?.();
                        document.compIdentifierToEditor!.delete(id);
                    }
                });
                return;
            }
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