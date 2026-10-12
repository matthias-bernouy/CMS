import { Component } from "cms-content/browser/component/Component";

(window as Window & { cmsRuntime?: unknown }).cmsRuntime = { Component };
