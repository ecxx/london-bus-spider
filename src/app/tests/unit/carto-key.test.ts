import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { describe, expect, test } from "vitest";

// prod_design 5.2: the tests use the test key, and the code gets it only from __CARTO_KEY__.
describe("CARTO key selection", () => {
  const env = loadEnv("test", fileURLToPath(new URL("../../../..", import.meta.url)), "VITE_");

  test("the tests get the test key", () => {
    expect(__CARTO_KEY__.length).toBeGreaterThan(0);
    expect(__CARTO_KEY__ === env.VITE_TEST_CARTO_KEY).toBe(true);
  });

  test("the tests do not get the live key", () => {
    expect(__CARTO_KEY__ === env.VITE_CARTO_KEY).toBe(false);
  });

  test("import.meta.env has no key of the project root .env", () => {
    const names = Object.keys(import.meta.env);
    expect(names.filter((n) => n.includes("CARTO") || n.includes("TFL"))).toEqual([]);
  });
});
