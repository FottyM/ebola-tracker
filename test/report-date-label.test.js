import { it, expect } from "vite-plus/test";
import fs from "node:fs";
import { parseMinistrySitrepText } from "../server/pipeline/parsers/sitrep-parser.js";

it("accepts Date du rapport without confusing it with publication date", () => {
  const text = fs.readFileSync(
    new URL("./fixtures/sitrep/sitrep-118-2026-09-09.txt", import.meta.url),
    "utf8",
  );
  const changed = text.replace(
    /Date de (?:notification|rapportage)\s*:[^\n]+/i,
    "Date du rapport : 28 septembre 2026\nDate de publication : 29 septembre 2026",
  );
  expect(changed).not.toBe(text);
  const parsed = parseMinistrySitrepText(changed);
  expect(parsed.errors).toEqual([]);
  expect(parsed.valid).toBe(true);
  expect(parsed.reportingDate).toBe("2026-09-28");
  expect(parsed.publicationDate).toBe("2026-09-29T12:00:00.000Z");
});
