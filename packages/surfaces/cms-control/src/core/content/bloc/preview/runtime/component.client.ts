import { Component } from "@bernouy/components/base";
import {
    PROVIDER_IMAGE_WIDTHS,
    buildProviderImageAttributes,
    installProviderMediaImageRuntime,
    syncProviderMediaImage,
} from "@bernouy/cms-gateway/media/browser";

(window as any).cmsRuntime = {
    ...(window as any).cmsRuntime,
    Component,
    PROVIDER_IMAGE_WIDTHS,
    buildProviderImageAttributes,
    syncProviderMediaImage,
};
installProviderMediaImageRuntime(document);
installCompositionControllerSync(document);

function installCompositionControllerSync(document: Document): void {
    const hostAttribute = "data-cms-composition";
    const controllerAttribute = "data-cms-composition-controller-runtime";
    new MutationObserver((records) => {
        for (const record of records) {
            if (record.type !== "attributes" || !record.attributeName) {
                continue;
            }
            const host = record.target as HTMLElement;
            if (!host.hasAttribute(hostAttribute) || record.attributeName.startsWith("data-cms-composition")) {
                continue;
            }
            const controller = host.querySelector<HTMLElement>(`[${controllerAttribute}]`);
            const value = host.getAttribute(record.attributeName);
            if (value === null) {
                controller?.removeAttribute(record.attributeName);
            } else {
                controller?.setAttribute(record.attributeName, value);
            }
        }
    }).observe(document, { attributes: true, subtree: true });
}
