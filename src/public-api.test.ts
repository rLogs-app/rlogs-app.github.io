import { describe, expect, it, vi } from "vitest";

import { fetchPublicRead } from "./public-api";

describe("fetchPublicRead", () => {
  it("retries transient HTTP failures and returns the recovered response", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status: "ok" }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await fetchPublicRead("https://api.example/health", {}, {
      request,
      sleep,
      delays: [0, 1],
    });

    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1);
  });

  it("does not retry permanent failures", async () => {
    const request = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }));
    const response = await fetchPublicRead("https://api.example/profile", {}, {
      request,
      sleep: vi.fn(),
      delays: [0, 1, 2],
    });
    expect(response.status).toBe(404);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("retries network failures without retrying writes", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new TypeError("network failure"))
      .mockResolvedValueOnce(Response.json({ status: "ok" }));
    const response = await fetchPublicRead("https://api.example/profiles", {}, {
      request,
      sleep: vi.fn().mockResolvedValue(undefined),
      delays: [0, 1],
    });
    expect(response.status).toBe(200);
    await expect(fetchPublicRead("https://api.example/profiles", { method: "POST" }, {
      request,
      delays: [0],
    })).rejects.toThrow("does not support POST");
  });
});
