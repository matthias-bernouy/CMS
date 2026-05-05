export async function waitForScripts(ele: HTMLElement) {
    const scriptSlot = ele.shadowRoot?.querySelector('slot[name="script"]') as HTMLSlotElement;
    const scripts = scriptSlot.assignedElements() as HTMLScriptElement[];

    const loaders = scripts.map(s => {
        if (!s.src || s.dataset.loaded) return Promise.resolve(true);

        return new Promise<boolean>((resolve) => {
            const done = () => { s.dataset.loaded = 'true'; resolve(true); };
            s.addEventListener('load', done, { once: true });
            s.addEventListener('error', () => resolve(false), { once: true });

            // The script may already have loaded before this listener was
            // attached (cache hit, fast fetch). Resource Timing tells us.
            if (performance.getEntriesByName(s.src).length > 0) done();
        });
    });

    await Promise.all(loaders);
}