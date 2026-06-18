import { Component } from "@bernouy/components/base";
import {
    Card,
    Container,
    Grid,
    PhotoAlbum,
} from "@bernouy/components";

(window as any).p9r = {
    ...(window as any).p9r,
    Component,
};

function define(tag: string, constructor: CustomElementConstructor): void {
    if (!customElements.get(tag)) customElements.define(tag, constructor);
}

define("base-card", Card);
define("base-container", Container);
define("base-grid", Grid);
define("base-photo-album", PhotoAlbum);
