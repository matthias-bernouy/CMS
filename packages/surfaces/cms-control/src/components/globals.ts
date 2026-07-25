import { Component, Composition } from "@bernouy/components/base";
import { SOURCE_IMAGE_WIDTHS } from "@bernouy/cms-source-images/browser";
import { createResponsiveSourceImageBrowserApi } from "@bernouy/cms-source-images/browser-host";

(window as any).p9r = {
    Component,
    Composition,
    SOURCE_IMAGE_WIDTHS,
    ...createResponsiveSourceImageBrowserApi({ public: false, private: false }),
};
