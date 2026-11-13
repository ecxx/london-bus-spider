// The test data: data/export_131026 and data/data_131026 of the project root.
// If the export is not there, the tests that use it are skipped (CLAUDE.md, "Tests").
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCore, loadLines, type Core } from "../../src/data/load";
import type { DecodedLine, PatternKey } from "../../src/data/types";

export const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
export const EXPORT_DIR = path.join(ROOT, "data", "export_131026");
export const DATA_DIR = path.join(ROOT, "data", "data_131026");
export const HAS_EXPORT = fs.existsSync(path.join(EXPORT_DIR, "manifest.json"));

export const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, "utf8"));

// A FetchJson that reads the files of a folder. The URLs are "<base><file>".
export const diskFetch = (dir: string) => async (url: string) => readJson(path.join(dir, url.replace(/^\/data\//, "")));

let core: Promise<Core> | undefined;
let lines: Promise<Map<PatternKey, DecodedLine>> | undefined;

export const getCore = (): Promise<Core> => (core ??= loadCore("/data/", diskFetch(EXPORT_DIR)));
export const getLines = async (): Promise<Map<PatternKey, DecodedLine>> =>
  (lines ??= getCore().then((c) => loadLines(c, "/data/", diskFetch(EXPORT_DIR))));
