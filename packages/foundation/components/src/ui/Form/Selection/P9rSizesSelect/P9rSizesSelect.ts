/**
 * <p9r-sizes-select name="size" label="Size"></p9r-sizes-select>
 *
 * Shortcut for a P9rSelect with XS / S / M / L / XL options.
 */
export class P9rSizesSelect extends HTMLElement {
    private _bufferedValue = "";

    connectedCallback() {
        const label = this.getAttribute("label") || "Size";
        const name = this.getAttribute("name") || "size";

        const select = document.createElement("p9r-select") as HTMLElement;
        select.setAttribute("label", label);
        select.setAttribute("name", name);

        const sizes = [
            { value: "none", label: "NONE" },
            { value: "xs", label: "XS" },
            { value: "sm", label: "S" },
            { value: "md", label: "M", selected: true },
            { value: "lg", label: "L" },
            { value: "xl", label: "XL" },
        ];

        sizes.forEach((s) => {
            const opt = document.createElement("option");
            opt.value = s.value;
            opt.textContent = s.label;
            if (s.selected) {
                opt.setAttribute("selected", "");
            }
            select.appendChild(opt);
        });

        // Forward any value set on us (e.g. by `<p9r-attr-sync>`) before
        // we got connected onto the replacement select.
        if (this._bufferedValue) {
            (select as HTMLElement & { value?: string }).value = this._bufferedValue;
        }

        this.replaceWith(select);
    }

    get name() {
        return this.getAttribute("name");
    }
    get value() {
        return this._bufferedValue;
    }
    set value(v: string) {
        this._bufferedValue = v;
    }
}
