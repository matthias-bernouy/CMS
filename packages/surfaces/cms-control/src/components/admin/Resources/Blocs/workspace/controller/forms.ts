export function configureWorkspaceForms(host: HTMLElement, basePath: string): void {
    configure(
        host,
        "[data-new-composition-form]",
        `${basePath}/api/site-bloc as created`,
        `${basePath}/editor/bloc?id={{ created.body.tag }}`,
    );
    configure(
        host,
        "[data-new-collection-form]",
        `${basePath}/api/bloc/collections as created`,
        `${basePath}/admin/collections/site:{{ created.body.id }}/overview`,
    );
    for (const form of Array.from(host.querySelectorAll<HTMLElement>("[data-import-collection-form]"))) {
        configureElement(
            form,
            `${basePath}/api/integrations/import as imported`,
            `${basePath}/admin/collections/managed:{{ imported.body.installation.id }}/overview`,
        );
    }
    configure(
        host,
        "[data-collection-settings-form]",
        `${basePath}/api/bloc/collections?id={{ workspace.collection.siteId }} as updated`,
        `${basePath}/admin/collections/site:{{ updated.body.id }}/overview`,
    );
    host.querySelector<HTMLElement>("[data-availability-form]")?.setAttribute(
        "cms-source",
        `${basePath}/api/bloc/collections/availability as saved`,
    );
}

function configure(host: HTMLElement, selector: string, source: string, redirect: string): void {
    const form = host.querySelector<HTMLElement>(selector);
    if (form) {
        configureElement(form, source, redirect);
    }
}

function configureElement(form: HTMLElement, source: string, redirect: string): void {
    form.setAttribute("cms-source", source);
    form.setAttribute("cms-source-success-redirect", redirect);
}
