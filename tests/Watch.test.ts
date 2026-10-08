import { Publisher } from "@triforce-heroes/triforce-publisher";
import { beforeAll, describe, expect, it, vi } from "vitest";

describe("watch languages", () => {
  const save = vi.spyOn(Publisher.prototype, "save").mockResolvedValue();
  let languages: Set<string>;

  beforeAll(async () => {
    await import("../tools/watch");

    const publisher = save.mock.contexts.at(0);

    if (!(publisher instanceof Publisher)) {
      throw new Error("The watch did not save a publisher instance");
    }

    const entries = publisher.getEntries();

    languages = new Set(entries.flatMap((entry) => Object.values(entry.sources).flat()));
  });

  const expectedLanguages: string[] = [
    "de",
    "es-EU",
    "fr-EU",
    "it",
    "ru",
    "jp",
    "zh-CN",
    "zh-TW",
    "en",
  ];

  it.each(expectedLanguages)("publishes the canonical language %s", (language) => {
    expect.assertions(1);

    expect(languages.has(language)).toBe(true);
  });

  it("excludes unsupported languages from the fixtures", () => {
    expect.assertions(1);

    expect(languages).toStrictEqual(new Set(expectedLanguages));
  });
});
