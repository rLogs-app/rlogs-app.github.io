import { describe, expect, it } from "vitest";

import { orderedMedalEntries, resolvePublishedPhotoUrl } from "./profile-view";

describe("published Photo Wall URLs", () => {
  it("resolves only the server-owned public Photo Wall route", () => {
    expect(
      resolvePublishedPhotoUrl(
        "/v1/profiles/prf_0123456789abcdef/photo-wall/42",
        "https://api.rlogs.example",
      ),
    ).toBe("https://api.rlogs.example/v1/profiles/prf_0123456789abcdef/photo-wall/42");
    expect(resolvePublishedPhotoUrl("https://private-game-cdn.example/photo.png")).toBeUndefined();
    expect(
      resolvePublishedPhotoUrl(
        "/v1/profiles/prf_0123456789abcdef/photo-wall/0",
        "https://api.rlogs.example",
      ),
    ).toBeUndefined();
    expect(
      resolvePublishedPhotoUrl(
        "/v1/profiles/prf_0123456789abcdef/photo-wall/42",
        "http://api.rlogs.example",
      ),
    ).toBeUndefined();
  });
});

describe("published medal ordering", () => {
  it("uses the player's display-slot order before unplaced owned medals", () => {
    expect(orderedMedalEntries(
      [9040008, 9040011, 9040012],
      { "2": 9040011, "1": 9040012 },
    )).toEqual([
      { id: 9040012, slot: 1 },
      { id: 9040011, slot: 2 },
      { id: 9040008 },
    ]);
  });

  it("ignores duplicate and unowned slot references", () => {
    expect(orderedMedalEntries(
      [9040008, 9040008],
      { "1": 9999999, "2": 9040008, "3": 9040008 },
    )).toEqual([{ id: 9040008, slot: 2 }]);
  });
});
