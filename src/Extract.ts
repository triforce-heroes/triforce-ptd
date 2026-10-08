import { decodeString, describePTD } from "#/Common";

export function extract(data: Buffer): Map<string, string> {
  const { sections } = describePTD(data);
  const entries = new Map<string, string>();

  for (const section of sections) {
    for (const table of section.tables) {
      if (table.name !== "Text") {
        continue;
      }

      for (const record of table.records) {
        entries.set(record.reference, decodeString(record.value));
      }
    }
  }

  return entries;
}
