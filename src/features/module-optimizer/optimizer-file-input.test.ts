import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { optimizerInputFromFileValue } from "./optimizer-file-input";

describe("optimizer local file input", () => {
  it("loads a sealed native profile package through package validation", async () => {
    const value: unknown = JSON.parse(
      readFileSync(
        new URL(
          "../../../public/fixtures/bpsr-local-profile-package.v1.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );

    const input = await optimizerInputFromFileValue(value);

    expect(input.modules).toHaveLength(1);
    expect(input.currentInstanceIds).toEqual(["9007199254740993"]);
  });

  it("loads a plain inventory without weakening module validation", async () => {
    const input = await optimizerInputFromFileValue({
      inventory: [
        {
          instance_id: "local-1",
          config_id: 5_500_101,
          quality: 5,
          parts: [
            { part_id: 1110, initial_link_points: 4 },
            { part_id: 1111, initial_link_points: 6 },
          ],
        },
      ],
      equipped_slots: { 1: "local-1" },
    });

    expect(input.currentInstanceIds).toEqual(["local-1"]);
    expect(input.modules[0].parts).toHaveLength(2);
  });

  it("rejects package-like JSON instead of bypassing a broken seal", async () => {
    const value: unknown = JSON.parse(
      readFileSync(
        new URL(
          "../../../public/fixtures/bpsr-local-profile-package.v1.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    (value as { request: { payload: { body: { level: number } } } }).request.payload.body.level = 1;

    await expect(optimizerInputFromFileValue(value)).rejects.toThrow(
      "package_id does not match",
    );
  });

  it("rejects numeric instance IDs that could lose precision", async () => {
    await expect(
      optimizerInputFromFileValue({
        modules: [
          {
            instance_id: 9_007_199_254_740_992,
            config_id: 5_500_101,
            parts: [],
          },
        ],
      }),
    ).rejects.toThrow("string instance_id");
  });
});
