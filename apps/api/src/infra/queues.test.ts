import { afterEach, describe, expect, it } from "vitest";

import { importChunkJobOptions, redisConnection } from "./queues.js";

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe("redisConnection", () => {
  it("parses host, port, password and database from REDIS_URL", () => {
    process.env.REDIS_URL = "redis://:s3cret@cache.local:6380/2";

    expect(redisConnection()).toEqual({
      host: "cache.local",
      port: 6380,
      password: "s3cret",
      db: 2,
    });
  });

  it("defaults the port and leaves password and db out when the URL has none", () => {
    process.env.REDIS_URL = "redis://localhost";

    expect(redisConnection()).toEqual({ host: "localhost", port: 6379 });
  });

  it("refuses to start without REDIS_URL", () => {
    delete process.env.REDIS_URL;

    expect(() => redisConnection()).toThrow("REDIS_URL is not set");
  });
});

describe("importChunkJobOptions", () => {
  it("retries five times with exponential backoff from two seconds by default", () => {
    delete process.env.IMPORT_CHUNK_ATTEMPTS;
    delete process.env.IMPORT_CHUNK_BACKOFF_MS;

    expect(importChunkJobOptions()).toEqual({
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: false,
    });
  });

  it("takes the retry knobs from the environment and rejects nonsense", () => {
    process.env.IMPORT_CHUNK_ATTEMPTS = "2";
    process.env.IMPORT_CHUNK_BACKOFF_MS = "10";
    expect(importChunkJobOptions()).toMatchObject({
      attempts: 2,
      backoff: { type: "exponential", delay: 10 },
    });

    process.env.IMPORT_CHUNK_ATTEMPTS = "zero";
    expect(() => importChunkJobOptions()).toThrow("IMPORT_CHUNK_ATTEMPTS");
  });
});
