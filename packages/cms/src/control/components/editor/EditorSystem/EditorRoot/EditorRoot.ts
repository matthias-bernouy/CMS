import html from "./template.html" with { type: "text" }
import { isToggable } from "src/control/core/isToggable";
import type { EDITOR_SYSTEM_MODE } from "types/w13c/EditorSystem";
import { ObserverManager } from "src/control/components/editor/EditorSystem/ObserverManager";
import { DragManager } from "src/control/components/editor/EditorSystem/DragManager";
import { BlocActions } from "../BlocActions/BlocActions";
import type { BlocLibrary } from "../BlocLibrary/BlocLibrary";
import { waitForScripts } from "./waitForScripts";
import type { TemplatePicker } from "./TemplatePicker/TemplatePicker";


export default class EditorRoot extends HTMLElement {

    private _mode: EDITOR_SYSTEM_MODE = "editor";

    private _observer: ObserverManager | null = null;
    private _dragmanager: DragManager | null = null;
    private _blocActions: BlocActions | null = null;
    private _blocLibrary: BlocLibrary | null = null;

    constructor(){
        super();
        this.attachShadow({ mode: "open"} );
        const template = document.createElement("template");
        template.innerHTML = html as unknown as string;
        this.shadowRoot?.append(template.content.cloneNode(true));
    }

    connectedCallback(){

        requestAnimationFrame(() => {
            const workingElement = this.shadowRoot?.querySelector("#workingElement") as HTMLElement;
            workingElement.style.visibility = "hidden";
            this._blocActions = this.shadowRoot?.querySelector("cms-bloc-actions") as BlocActions;
            const slot = this.shadowRoot!.querySelector("#workingElement slot") as HTMLSlotElement;
            if (!slot) throw new Error("Working slot not found in shadow DOM");
            
            waitForScripts(this).then(async () => {
                this._observer = new ObserverManager(slot);
                this._dragmanager = new DragManager(workingElement);

                this._blocLibrary = this.shadowRoot?.querySelector("cms-bloc-library") as BlocLibrary;

                if (this._isWorkingEmpty()) await this._maybePickTemplate();

                workingElement.style.visibility = "visible";
            })
        })

    }

    private _isWorkingEmpty(): boolean {
        const slot = this.shadowRoot!.querySelector("#workingElement slot") as HTMLSlotElement;
        const nodes = slot.assignedNodes({ flatten: true }).filter(n =>
            n.nodeType === Node.ELEMENT_NODE ||
            (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "")
        );
        if (nodes.length === 0) return true;
        if (nodes.length !== 1 || nodes[0]!.nodeType !== Node.ELEMENT_NODE) return false;
        const el = nodes[0] as Element;
        if (el.tagName !== "P") return false;
        const text = (el.textContent ?? "").trim();
        if (text !== "") return false;
        const onlyBr = el.children.length === 1 && el.children[0]!.tagName === "BR";
        return el.children.length === 0 || onlyBr;
    }

    private async _maybePickTemplate(): Promise<void> {
        const picker = document.createElement("cms-template-picker") as TemplatePicker;
        this.shadowRoot!.appendChild(picker);
        const html = await picker.open();
        picker.remove();
        if (!html) return;
        // Surgical: only replace the default-slotted children (the page
        // content). Named slots — `style` / `script` / `configuration` —
        // must survive, otherwise the editor loses its config panel.
        Array.from(this.children).forEach(c => { if (!c.hasAttribute("slot")) c.remove(); });
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;
        while (wrapper.firstChild) this.appendChild(wrapper.firstChild);
    }

    save(){
        const ele = this.shadowRoot?.querySelector("#workingElement") as HTMLElement;
        const content = ele.innerHTML;
        this.dispatchEvent(new CustomEvent("editor-system-save", {
            bubbles: true,
            detail: content
        }))
    }

    openConfig() {
        const slot = this.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="configuration"]');
        const ele = slot?.assignedElements()[0] as HTMLElement | undefined;
        
        if (!ele || !isToggable(ele)) {
            throw new Error("Configuration element must implement open()");
        }
        ele.open();
    }

    switchMode(mode?: EDITOR_SYSTEM_MODE){
        const newMode = ( this._mode === "editor" ) ? "view" : "editor";
        this.dispatchEvent(new CustomEvent("editor-system-switch-mode", {
            bubbles: true,
            detail: mode ?? newMode
        }))
        this._mode = mode ?? newMode;
    }

    get observer(){
        if ( !this._observer ) throw new Error("You try to get observer before his initialization")
        return this._observer;
    }

    get dragManager(){
        if ( !this._dragmanager ) throw new Error("You try to get dragManager before his initialization");
        return this._dragmanager;
    }

    get blocActions(){
        if ( !this._blocActions ) throw new Error("You try to get blocActions before his initialization");
        return this._blocActions;
    }

    get editorDOM(){
        const ele = this.shadowRoot?.querySelector("#editorSystem");
        if (!ele ) throw new Error("You try to get editorSystem before his initialization");
        return ele
    }

    get blocLibrary(){
        if ( !this._blocLibrary ) throw new Error("You try to get _blocLibrary before his initialization");
        return this._blocLibrary;
    }

    get mode(){
        return this._mode;
    }

    get pageContent(){
        this.switchMode("view");
        const slot = this.shadowRoot!.querySelector('#workingElement slot') as HTMLSlotElement;                                                                                                  
        const nodes = slot.assignedNodes({ flatten: true });                                                                                                                            
        const html = nodes                    
            .filter(n => n.nodeName !== "#text")                                                                                                                  
            .map(n => n instanceof Element ? n.outerHTML : n.textContent ?? '')
            .join('');   
        this.switchMode("editor");                                                                                                                                                                          
        return html;
    }

}

if ( !customElements.get("cms-editor-system") ){
    customElements.define("cms-editor-system", EditorRoot)
}