import { describe, expect, it } from "vitest";

import { extract } from "#/Extract";
import { fixtures, readFixture, readTables, withShift } from "#tests/fixtures/ptd";

describe(extract, () => {
  it.each(fixtures)("extracts every text in $file", async ({ file }) => {
    expect.assertions(4);

    const data = await readFixture(file);
    const before = Buffer.from(data);
    const entries = extract(data);

    expect([...entries.values()]).toStrictEqual(readTables(data).at(0)!.texts);
    expect([...entries.keys()]).not.toContain("");
    expect(data.equals(before)).toBe(true);

    await expect(`${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`).toMatchFileSnapshot(
      `snaps/extract/${file}.snap`,
    );
  });

  const shifts: number[] = [0, 1, 0x80, 0xff];

  it.each(shifts)("reads the string shift %i from the header", async (shift) => {
    expect.assertions(1);

    const original = await readFixture("title_USen.bin");
    const data = withShift(original, shift);

    expect(extract(data)).toStrictEqual(extract(original));
  });

  it("uses the decoded identifiers as references", async () => {
    expect.assertions(3);

    const data = await readFixture("archive_MES_USen.bin");
    const entries = extract(data);

    expect(entries.get("ARC_HITODAMA_0015")).toBe("Vince");
    expect(entries.get("ARC_CHARA_EM0000_003")).toBe("Sparcanagh");
    expect(entries.has("CharName")).toBe(false);
  });

  it("preserves both occurrences of a duplicate reference", async () => {
    expect.assertions(2);

    const data = await readFixture("Episode1_USen.bin");
    const entries = extract(data);

    expect(entries.get("SM_001090_0020_NAR")).toBe(
      "Somehow disrupted the illusion,\r\nrevealing the true path forward.",
    );
    expect(entries.get("SM_001090_0020_NAR#2")).toBe(
      "They spotted the white wolf.\r\nWithout a moment's hesitation,\r\nthe pair gave chase.",
    );
  });
});
