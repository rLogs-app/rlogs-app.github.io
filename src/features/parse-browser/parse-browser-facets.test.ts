// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import type { ParsePresentationCatalog } from "./parse-presentation";
import { populateSceneFacet } from "./parse-browser";

describe("parse browser scene facet initialization", () => {
  it("uses trusted catalog labels across report identities and ignores server labels", () => {
    const select = document.createElement("select");
    const allScenes = document.createElement("option");
    allScenes.value = "";
    allScenes.textContent = "All scenes";
    select.append(allScenes);
    const presentation = {
      scenes: { "30120": "Stimen Remains - Floor 20" },
    } as unknown as ParsePresentationCatalog;

    populateSceneFacet(select, [
      { id: 30_120, label: "<img src=x onerror=alert(1)>", count: 7 },
      { id: 99_999, label: "Invented server scene", count: 2 },
    ], presentation);

    expect([...select.options].map((option) => [option.value, option.textContent])).toEqual([
      ["", "All scenes"],
      ["30120", "Stimen Remains - Floor 20 (7)"],
      ["99999", "Scene #99999 (2)"],
    ]);
    expect(select.textContent).not.toContain("Invented server scene");
    expect(select.querySelector("img")).toBeNull();
  });
});
