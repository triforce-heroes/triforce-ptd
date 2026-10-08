import { describe, expect, it } from "vitest";

import { extract } from "#/Extract";
import { rebuild } from "#/Rebuild";
import {
  duplicateSections,
  fixtures,
  readFixture,
  readTables,
  withShift,
} from "#tests/fixtures/ptd";

const englishFixtures = fixtures.filter(({ file }) => file.endsWith("_USen.bin"));

describe(rebuild, () => {
  it.each(englishFixtures)("replaces text and preserves metadata in $file", async ({ file }) => {
    expect.assertions(7);

    const original = await readFixture(file);
    const before = Buffer.from(original);
    const entries = extract(original);
    const reference = entries.keys().next().value!;
    const replacements = new Map([
      [reference, "Tradução com ação, 日本語, 한글 e 😀.\r\nSegunda linha."],
    ]);
    const result = rebuild(original, replacements);
    const expected = new Map([...entries, ...replacements]);

    expect(extract(result)).toStrictEqual(expected);
    expect(readTables(result).map((table) => table.hashes)).toStrictEqual(
      readTables(original).map((table) => table.hashes),
    );
    expect(readTables(result).at(1)!.texts).toStrictEqual(readTables(original).at(1)!.texts);
    expect(result.subarray(0, 8).equals(original.subarray(0, 8))).toBe(true);
    expect(result.readUInt32LE(8)).toBe(0);
    expect(original.equals(before)).toBe(true);
    expect(replacements.size).toBe(1);
  });

  it.each(fixtures)("round-trips all entries as plain UTF-16LE in $file", async ({ file }) => {
    expect.assertions(5);

    const original = await readFixture(file);
    const unchanged = rebuild(original);

    expect(unchanged.readUInt32LE(8)).toBe(0);
    expect(unchanged.equals(withShift(original, 0))).toBe(true);
    expect(readTables(unchanged)).toStrictEqual(readTables(original));
    expect(Object.is(unchanged, original)).toBe(false);
    expect(rebuild(unchanged, extract(unchanged)).equals(unchanged)).toBe(true);
  });

  const texts: string[] = ["", "Sim", "a".repeat(2048), "Ação\r\n[wait:30] 😀 日本語 \uFFFF"];

  it.each(texts)("accepts a replacement %j", async (text) => {
    expect.assertions(2);

    const original = await readFixture("title_USen.bin");
    const result = rebuild(original, new Map([["TRIAL_DIALOG_BUTTON_004_01", text]]));

    expect(extract(result).get("TRIAL_DIALOG_BUTTON_004_01")).toBe(text);
    expect(readTables(result).at(0)!.texts.at(0)).toBe(text);
  });

  it("replaces every entry and supports rebuilding an already modified file", async () => {
    expect.assertions(3);

    const original = await readFixture("Episode1_USen.bin");
    const replacements = new Map(
      [...extract(original).keys()].map((reference) => [reference, reference]),
    );
    const result = rebuild(original, replacements);
    const second = rebuild(result, new Map([["SM_001090_0020_NAR#2", "Segunda ocorrência"]]));

    expect(extract(result)).toStrictEqual(replacements);
    expect(extract(second).get("SM_001090_0020_NAR")).toBe("SM_001090_0020_NAR");
    expect(extract(second).get("SM_001090_0020_NAR#2")).toBe("Segunda ocorrência");
  });

  it("serializes the parsed structure independently of the original offsets", async () => {
    expect.assertions(3);

    const original = await readFixture("title_USen.bin");
    const padded = Buffer.concat([
      original.subarray(0, 28),
      Buffer.alloc(8),
      original.subarray(28),
    ]);

    padded.writeUInt32LE(original.readUInt32LE(16) + 8, 16);
    padded.writeUInt32LE(original.readUInt32LE(24) + 8, 24);

    const result = rebuild(padded);

    expect(result.equals(rebuild(original))).toBe(true);
    expect(extract(result)).toStrictEqual(extract(padded));
    expect(padded.readUInt32LE(16)).toBe(36);
  });

  it("rejects a missing reference", async () => {
    expect.assertions(1);

    const original = await readFixture("title_USen.bin");

    expect(() => rebuild(original, new Map([["MISSING", "texto"]]))).toThrow(
      "reference does not exist",
    );
  });

  const shifts: number[] = [0, 1, 0x26, 0x80, 0xff];

  it.each(shifts)("rebuilds shift %i as unencoded UTF-16LE", async (shift) => {
    expect.assertions(4);

    const fixture = await readFixture("title_USen.bin");
    const original = withShift(fixture, shift);
    const result = rebuild(original, new Map([["TITLE_MENU_TXT_01", "Tradução 😀"]]));

    expect(result.readUInt32LE(8)).toBe(0);
    expect(result.indexOf(Buffer.from("TITLE_MENU_TXT_01\0", "utf16le"))).toBeGreaterThanOrEqual(0);
    expect(result.indexOf(Buffer.from("Tradução 😀\0", "utf16le"))).toBeGreaterThanOrEqual(0);
    expect(
      result.equals(
        rebuild(withShift(fixture, 0), new Map([["TITLE_MENU_TXT_01", "Tradução 😀"]])),
      ),
    ).toBe(true);
  });

  it("rejects clearing only the shift header while keeping encoded strings", async () => {
    expect.assertions(2);

    const fixture = await readFixture("title_USen.bin");
    const original = withShift(fixture, 0x26);
    const patched = Buffer.from(original);

    patched.writeUInt32LE(0, 8);

    expect(() => extract(patched)).toThrow("missing string terminator");
    expect(extract(rebuild(original))).toStrictEqual(extract(original));
  });

  it("relocates metadata and payloads across multiple modified sections", async () => {
    expect.assertions(4);

    const fixture = await readFixture("title_USen.bin");
    const original = duplicateSections(fixture);
    const replacements = new Map([
      ["TRIAL_DIALOG_BUTTON_004_01", ""],
      ["TRIAL_DIALOG_BUTTON_004_01#2", "Segunda seção com uma tradução mais longa 😀"],
    ]);
    const expected = new Map([...extract(original), ...replacements]);
    const result = rebuild(original, replacements);
    const tables = readTables(result);

    expect(extract(result)).toStrictEqual(expected);
    expect(tables.map((table) => table.hashes)).toStrictEqual(
      readTables(original).map((table) => table.hashes),
    );
    expect(tables.at(1)!.texts).toStrictEqual(readTables(fixture).at(1)!.texts);
    expect(tables.at(3)!.texts).toStrictEqual(readTables(fixture).at(1)!.texts);
  });

  it("rejects embedded null characters", async () => {
    expect.assertions(1);

    const original = await readFixture("title_USen.bin");

    expect(() => rebuild(original, new Map([["TITLE_MENU_TXT_01", "a\0b"]]))).toThrow(
      "null character",
    );
  });
});
