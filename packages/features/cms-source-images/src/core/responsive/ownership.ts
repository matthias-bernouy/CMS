type OwnedAttribute = {
    generated: string;
    previous: string | null;
};

export class BoundImageAttributeOwnership {
    private readonly states = new WeakMap<Element, Map<string, OwnedAttribute>>();

    apply(element: Element, name: string, value: string): void {
        const owned = this.states.get(element) ?? new Map<string, OwnedAttribute>();
        const existing = owned.get(name);
        const current = element.getAttribute(name);
        if (!existing && current === value) {
            return;
        }
        const previous = existing && current === existing.generated ? existing.previous : current;
        if (current !== value) {
            element.setAttribute(name, value);
        }
        owned.set(name, { generated: value, previous });
        this.states.set(element, owned);
    }

    clear(element: Element, name: string): void {
        const owned = this.states.get(element);
        const state = owned?.get(name);
        if (!owned || !state) {
            return;
        }
        if (element.getAttribute(name) === state.generated) {
            if (safeToRestore(name, state.previous)) {
                element.setAttribute(name, state.previous!);
            } else {
                element.removeAttribute(name);
            }
        }
        owned.delete(name);
        if (owned.size === 0) {
            this.states.delete(element);
        }
    }

    clearAll(element: Element): void {
        const names = [...(this.states.get(element)?.keys() ?? [])];
        for (const name of names) {
            this.clear(element, name);
        }
    }
}

export function scrubUnresolvedNetworkAttributes(element: Element): void {
    for (const name of ["src", "srcset"] as const) {
        const value = element.getAttribute(name);
        if (value !== null && (!value.trim() || value.includes("{{"))) {
            element.removeAttribute(name);
        }
    }
}

function safeToRestore(name: string, value: string | null): boolean {
    if (value === null) {
        return false;
    }
    return name !== "src" && name !== "srcset" ? true : isResolved(value);
}

function isResolved(value: string): boolean {
    return value.trim().length > 0 && !value.includes("{{");
}
