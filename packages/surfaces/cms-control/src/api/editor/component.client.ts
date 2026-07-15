import { Component, Composition } from "@bernouy/components/base";

(window as any).p9r = {
    ...(window as any).p9r,
    Component,
    Composition,
};
