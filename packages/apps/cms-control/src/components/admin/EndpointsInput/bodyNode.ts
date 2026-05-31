import { makeInput } from "./controls";
import { readControl } from "./shared";
import { makeTypeSelect, makeRequiredCheckbox, makeTrash, makeAddPropButton } from "./bodyParts";
import type { DataShape } from "@bernouy/cms-gateway";

export type NodeHandle = {
    /** Inline type picker (for `array`, also " of <elementType>"). */
    typeEl: HTMLElement;
    /** Block placed below the row: an object's property box / an array element's
     *  box; empty for scalars and scalar arrays. */
    childrenEl: HTMLElement;
    read: () => DataShape;
    /** Retarget the object's "+ Add property to …" button when the owning
     *  property is renamed. */
    setOwnerLabel: (name: string) => void;
};

/** Recursive DataShape node. `object` → a grouped box of named property rows
 *  (each: name + type + Required + trash, with its own sub-box below); `array` →
 *  "array of <type>" inline + the element's box; scalars are leaves. `onChange`
 *  fires after each edit so the section re-serialises. Detached-build safe: the
 *  initial render uses the seed; `read()` (live `.value`) runs only after connect. */
export function makeNode(seed: DataShape, onChange: () => void, depth = 0): NodeHandle {
    const typeSelect = makeTypeSelect(seed.type);
    const typeEl = document.createElement('span');
    typeEl.className = 'ep-type-cell';
    typeEl.appendChild(typeSelect);   // mounted ONCE — never reparented (see rebuild)
    const childrenEl = document.createElement('div');

    const props: Array<{ nameEl: HTMLElement; reqEl: HTMLElement; child: NodeHandle }> = [];
    let itemsNode: NodeHandle | null = null;
    let addBtn: (HTMLElement & { setLabel(n: string): void }) | null = null;

    const makeProp = (name: string, shape: DataShape, required: boolean): HTMLElement => {
        const nameEl = makeInput('', '', 'field name', name);
        nameEl.classList.add('ep-prop-name');
        const child = makeNode(shape, onChange, depth + 1);
        const reqEl = makeRequiredCheckbox(required, onChange);
        const wrapper = document.createElement('div');
        wrapper.className = 'ep-prop';
        const row = document.createElement('div');
        row.className = 'ep-prop-row';
        const trash = makeTrash(() => {
            const i = props.findIndex(p => p.nameEl === nameEl);
            if (i >= 0) props.splice(i, 1);
            wrapper.remove();
            onChange();
        });
        nameEl.addEventListener('input', () => { onChange(); child.setOwnerLabel(readControl(nameEl).trim()); });
        row.append(nameEl, child.typeEl, reqEl, trash);
        wrapper.append(row, child.childrenEl);
        props.push({ nameEl, reqEl, child });
        child.setOwnerLabel(name);
        return wrapper;
    };

    const rebuild = (type: string, s: DataShape) => {
        props.length = 0; itemsNode = null; addBtn = null;
        // Clear only the array's " of <type>" extras — DON'T reparent typeSelect:
        // moving a p9r-select disconnects/reconnects it, which resets its value
        // from the (stale) `value` attribute.
        while (typeSelect.nextSibling) typeSelect.nextSibling.remove();
        childrenEl.replaceChildren();
        if (type === 'object') {
            const box = document.createElement('div');
            box.className = depth > 0 ? 'ep-box' : 'ep-box ep-box-root';
            const list = document.createElement('div');
            list.className = 'ep-prop-list';
            const req = new Set(s.required ?? []);
            for (const [k, v] of Object.entries(s.properties ?? {})) list.appendChild(makeProp(k, v, req.has(k)));
            addBtn = makeAddPropButton(() => { list.appendChild(makeProp('', { type: 'string' }, false)); onChange(); });
            box.append(list, addBtn);
            childrenEl.appendChild(box);
        } else if (type === 'array') {
            itemsNode = makeNode(s.items ?? { type: 'string' }, onChange, depth + 1);
            const of = document.createElement('span');
            of.className = 'ep-of';
            of.textContent = 'of';
            typeEl.append(of, itemsNode.typeEl);
            childrenEl.appendChild(itemsNode.childrenEl);
        }
    };

    typeSelect.addEventListener('change', () => {
        const t = readControl(typeSelect);
        typeSelect.setAttribute('value', t);   // keep attr in sync so a re-slot can't reset it
        rebuild(t, { type: t as DataShape['type'] });
        onChange();
    });
    rebuild(seed.type, seed);

    const read = (): DataShape => {
        const type = readControl(typeSelect) as DataShape['type'];
        if (type === 'object') {
            const properties: Record<string, DataShape> = {};
            const required: string[] = [];
            for (const p of props) {
                const n = readControl(p.nameEl).trim();
                if (!n) continue;
                properties[n] = p.child.read();
                if (p.reqEl.hasAttribute('checked')) required.push(n);
            }
            const out: DataShape = { type };
            if (Object.keys(properties).length) out.properties = properties;
            if (required.length) out.required = required.filter(n => n in properties);
            return out;
        }
        if (type === 'array') return itemsNode ? { type, items: itemsNode.read() } : { type };
        return { type };
    };

    return { typeEl, childrenEl, read, setOwnerLabel: (name) => addBtn?.setLabel(name) };
}
