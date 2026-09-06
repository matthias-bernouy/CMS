import { Component } from "@bernouy/components/base";
import { SOURCE_IMAGE_WIDTHS } from "@bernouy/cms-source-images/browser";
import {
    createResponsiveSourceImageBrowserApi,
    installBoundImageRuntime,
} from "@bernouy/cms-source-images/browser-host";

const sourceImages = createResponsiveSourceImageBrowserApi({ public: false, private: false });

(window as any).p9r = {
    Component,
    SOURCE_IMAGE_WIDTHS,
    ...sourceImages,
};

installBoundImageRuntime(document, sourceImages);
