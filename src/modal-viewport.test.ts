import { describe, expect, it } from "vitest";

import { modalViewportVariables } from "./modal-viewport";

describe("modal viewport sizing", () => {
  it("uses the visible Android viewport instead of the larger layout viewport", () => {
    expect(modalViewportVariables(
      { offsetTop: 84, offsetLeft: 0, width: 412, height: 724 },
      { innerWidth: 412, innerHeight: 892 },
    )).toEqual({
      "--rlogs-visual-viewport-top": "84px",
      "--rlogs-visual-viewport-left": "0px",
      "--rlogs-visual-viewport-width": "412px",
      "--rlogs-visual-viewport-height": "724px",
    });
  });

  it("falls back to the window viewport and rejects invalid browser metrics", () => {
    expect(modalViewportVariables(
      { offsetTop: Number.NaN, offsetLeft: -10, width: 0, height: Number.NaN },
      { innerWidth: 390, innerHeight: 760 },
    )).toEqual({
      "--rlogs-visual-viewport-top": "0px",
      "--rlogs-visual-viewport-left": "0px",
      "--rlogs-visual-viewport-width": "390px",
      "--rlogs-visual-viewport-height": "760px",
    });
  });
});
