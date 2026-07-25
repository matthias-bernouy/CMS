export class FakeImage {
    readonly attributes = new Map<string, string>();
    readonly mutations: string[] = [];

    getAttribute(name: string): string | null {
        return this.attributes.get(name) ?? null;
    }

    hasAttribute(name: string): boolean {
        return this.attributes.has(name);
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
        this.mutations.push(`set:${name}`);
    }

    removeAttribute(name: string): void {
        this.attributes.delete(name);
        this.mutations.push(`remove:${name}`);
    }
}

export function image(attributes: Record<string, string>): HTMLImageElement & FakeImage {
    const element = new FakeImage();
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value);
    }
    element.mutations.length = 0;
    return element as unknown as HTMLImageElement & FakeImage;
}
