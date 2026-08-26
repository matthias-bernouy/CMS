import { Component } from "@bernouy/components/base";
import { SOURCE_IMAGE_WIDTHS } from "@bernouy/cms-source-images/browser";
import {
    createResponsiveSourceImageBrowserApi,
    installBoundImageRuntime,
} from "@bernouy/cms-source-images/browser-host";

const sourceImages = createResponsiveSourceImageBrowserApi({
    public: __CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED__,
    private: __CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED__,
});

(window as any).p9r = {
    ...(window as any).p9r,
    Component,
    SOURCE_IMAGE_WIDTHS,
    ...sourceImages,
};
installBoundImageRuntime(document, sourceImages);
installCompositionControllerSync(document);

declare const __CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED__: boolean;
declare const __CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED__: boolean;

function installCompositionControllerSync(document: Document): void {
    const hostAttribute = "data-p9r-composition";
    const controllerAttribute = "data-p9r-composition-controller-runtime";
    new MutationObserver((records) => {
        for (const record of records) {
            if (record.type !== "attributes" || !record.attributeName) {
                continue;
            }
            const host = record.target as HTMLElement;
            if (!host.hasAttribute(hostAttribute) || record.attributeName.startsWith("data-p9r-composition")) {
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
