import { JSDOM } from "jsdom";

// A browser-like global for component tests. Import this before React or Testing Library.
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom.window;
globals.document = dom.window.document;
globals.navigator = dom.window.navigator;
for (const key of ["HTMLElement", "Node", "Event", "MouseEvent", "KeyboardEvent", "MutationObserver", "getComputedStyle"]) {
  globals[key] = (dom.window as unknown as Record<string, unknown>)[key];
}
globals.IS_REACT_ACT_ENVIRONMENT = true;
