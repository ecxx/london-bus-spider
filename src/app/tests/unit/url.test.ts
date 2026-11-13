import { beforeAll, describe, expect, test } from "vitest";
import type { Core } from "../../src/data/load";
import { datasetDate } from "../../src/model/text";
import { parseHash, resolveView, upView, viewHash, type View } from "../../src/model/url";
import { HAS_EXPORT, getCore } from "./fixtures";

describe("the URLs of app_design 4.3", () => {
  const cases: [string, View][] = [
    ["#/", { kind: "home" }],
    ["#/station/ICS1001038", { kind: "station", key: "ICS1001038" }],
    ["#/stop/490001038D", { kind: "stop", key: "490001038D" }],
    ["#/line/189", { kind: "route", line: "189" }],
    ["#/line/189/outbound", { kind: "route", line: "189", dir: "outbound" }],
    ["#/line/189/outbound/2", { kind: "route", line: "189", dir: "outbound", n: "2" }],
    ["#/station/ICS1001038/line/189", { kind: "route", line: "189", ctx: { kind: "station", key: "ICS1001038" } }],
    ["#/stop/490001038D/line/189/inbound/1", { kind: "route", line: "189", dir: "inbound", n: "1", ctx: { kind: "stop", key: "490001038D" } }],
    ["#/about", { kind: "about" }],
  ];

  test.each(cases)("%s", (hash, v) => {
    expect(parseHash(hash)).toEqual(v);
    expect(viewHash(v)).toBe(hash);
  });

  test("a hash that is not in the table gives the home view", () => {
    for (const h of ["", "#", "#/nothing", "#/about/x", "#/line", "#/station", "#/station/x/y", "#/line/1/2/3/4", "#/stop/%E0%A4%A"]) {
      expect(parseHash(h), h).toEqual({ kind: "home" });
    }
  });

  test("keys are decoded and encoded", () => {
    expect(parseHash("#/station/A%2FB")).toEqual({ kind: "station", key: "A/B" });
    expect(viewHash({ kind: "station", key: "A/B" })).toBe("#/station/A%2FB");
  });
});

describe("the date of the bus data (app_design 6.7)", () => {
  test("data_131026 gives 13 October 2026", () => {
    expect(datasetDate("data_131026")).toBe("13 October 2026");
    expect(datasetDate("data_010127")).toBe("1 January 2027");
    expect(datasetDate("data_311399")).toBe(null);
    expect(datasetDate("export_131026")).toBe(null);
  });
});

describe.skipIf(!HAS_EXPORT)("D12 and one level up, in data_131026", () => {
  let d: Core;
  beforeAll(async () => {
    d = await getCore();
  });
  const resolve = (h: string) => viewHash(resolveView(d, parseHash(h)));
  const up = (h: string) => viewHash(upView(d, parseHash(h)));

  test("D12: a key that is not in the data opens the home view", () => {
    expect(resolve("#/station/NOPE")).toBe("#/");
    expect(resolve("#/stop/NOPE")).toBe("#/");
    expect(resolve("#/line/NOPE")).toBe("#/");
    expect(resolve("#/stop/490001038D/line/NOPE")).toBe("#/stop/490001038D");
    expect(resolve("#/stop/NOPE/line/189/inbound")).toBe("#/line/189/inbound");
  });

  test("the keys that are in the data do not change", () => {
    for (const h of ["#/station/ICS1001038", "#/stop/490001038D", "#/line/189/outbound/2", "#/station/ICS1001038/line/189", "#/about", "#/"]) {
      expect(resolve(h)).toBe(h);
    }
  });

  test("route -> the stop or station that opened it -> the station of the stop -> home", () => {
    expect(up("#/stop/490001038D/line/189")).toBe("#/stop/490001038D");
    expect(up("#/station/ICS1001038/line/189")).toBe("#/station/ICS1001038");
    expect(up("#/line/189")).toBe("#/");
    expect(up("#/stop/490001038D")).toBe("#/station/ICS1001038");
    expect(up("#/station/ICS1001038")).toBe("#/");
    expect(up("#/about")).toBe("#/");
  });
});
