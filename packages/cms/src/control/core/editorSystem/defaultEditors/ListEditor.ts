import { Editor } from "../Editor/Editor";

const cssStyle = `
    li:empty::before{
        content: attr(p9r-text-placeholder);
        color: #aaa;
        pointer-events: none;
        display: block;
        font-style: italic;
        font-weight: 300;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`

export class ListEditor extends Editor {

    private onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    private onInput = (e: Event) => this.handleInput(e);

    constructor(target: HTMLElement) {
        super(target, cssStyle);

        let li = this.target.querySelector("li");
        if ( !li ){
            li = document.createElement("li");
            this.target.append(li);
        }
        requestAnimationFrame(() => {
            li.focus();
        });
    }

    handleKeyDown(e: KeyboardEvent){
        const item = e.target as HTMLElement;
        if (e.key === "Enter"){
            if (e.shiftKey) return;
            e.preventDefault();
            const elem = document.createElement("li");
            if (item.innerHTML === ""){
                const p = document.createElement("p");
                this.target.after(p);
            } else {
                item.after(elem);
                this.init();
                requestAnimationFrame(() => {
                    elem.focus();
                });
            }
        }

        if (e.key === "Backspace" && e.target) {
            const item = e.target as HTMLElement;
            if (item.innerHTML === ""){
                item.remove();
                item.removeEventListener("keydown", this.onKeyDown);
                item.removeEventListener("input", this.onInput);
                if ( !this.target.querySelector("li") ){
                    this.target.remove();
                }
            }
        }
    }

    handleInput(e: Event) {
        const item = e.target as HTMLElement;
        if (item.innerHTML === "<br>") {
            item.innerHTML = "";
        }
    }

    init() {
        const items = this.target.querySelectorAll("li");
        items.forEach((item) => {
            item.removeEventListener("keydown", this.onKeyDown);
            item.removeEventListener("input", this.onInput);
            item.contentEditable = "true";
            item.setAttribute(p9r.attr.TEXT.PLACEHOLDER, "Type text")
            item.addEventListener("keydown", this.onKeyDown);
            item.addEventListener("input", this.onInput);
        })
    }

    restore() {
        const items = this.target.querySelectorAll("li");
        items.forEach((item) => {
            item.contentEditable = "false";
            item.removeEventListener("keydown", this.onKeyDown);
            item.removeEventListener("input", this.onInput);
        })
    }
}