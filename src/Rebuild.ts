import { BufferBuilder } from "@triforce-heroes/triforce-core/BufferBuilder";

import { describePTD, encodeString } from "#/Common";
import {
  DESCRIPTOR_SIZE,
  HEADER_SIZE,
  RECORD_SIZE,
  SECTION_SIZE,
  type PTDString,
} from "#/types/PTD";

export type TextReplacements = ReadonlyMap<string, string>;

function getRecordsSize(records: PTDString[]): number {
  return (
    records.length * RECORD_SIZE + records.reduce((size, record) => size + record.value.length, 0)
  );
}

function writeRecords(file: BufferBuilder, records: PTDString[]): void {
  let payload = file.length + records.length * RECORD_SIZE;

  for (const record of records) {
    const descriptor = file.length;

    file.writeUnsignedInt32(record.hash);
    file.writeUnsignedInt32(payload - descriptor);
    file.writeUnsignedInt32(record.value.length / 2);
    file.writeUnsignedInt32(record.value.length);

    payload += record.value.length;
  }

  for (const record of records) {
    file.push(record.value);
  }
}

export function rebuild(data: Buffer, replacements: TextReplacements = new Map()): Buffer {
  const { keys, sections } = describePTD(data);
  const pending = new Map(replacements);

  for (const section of sections) {
    for (const table of section.tables) {
      for (const record of table.records) {
        const replacement = table.name === "Text" ? pending.get(record.reference) : undefined;

        if (replacement !== undefined) {
          record.value = encodeString(replacement);
          pending.delete(record.reference);
        }
      }
    }
  }

  if (pending.size > 0) {
    throw new Error(`PTD: replacement reference does not exist: ${pending.keys().next().value}.`);
  }

  const file = new BufferBuilder();
  const sectionOffset = HEADER_SIZE + getRecordsSize(keys);

  file.push(data.subarray(0, 8));
  file.writeUnsignedInt32(0);
  file.writeUnsignedInt32(keys.length);
  file.writeUnsignedInt32(HEADER_SIZE);
  file.writeUnsignedInt32(sections.length);
  file.writeUnsignedInt32(sectionOffset);
  writeRecords(file, keys);

  let cursor = sectionOffset + sections.length * SECTION_SIZE;

  for (const section of sections) {
    const descriptor = file.length;

    file.writeUnsignedInt32(section.hash);
    file.writeUnsignedInt32(section.groups.length);
    file.writeUnsignedInt32(cursor - descriptor);
    cursor +=
      section.groups.length * DESCRIPTOR_SIZE +
      section.groups.reduce((size, group) => size + group.hashes.length, 0);
    file.writeUnsignedInt32(section.tables.length);
    file.writeUnsignedInt32(cursor - descriptor);
    cursor +=
      section.tables.length * DESCRIPTOR_SIZE +
      section.tables.reduce((size, table) => size + getRecordsSize(table.records), 0);
  }

  for (const section of sections) {
    let payload = file.length + section.groups.length * DESCRIPTOR_SIZE;

    for (const group of section.groups) {
      const descriptor = file.length;

      file.writeUnsignedInt32(group.hash);
      file.writeUnsignedInt32(group.hashes.length / 4);
      file.writeUnsignedInt32(payload - descriptor);
      payload += group.hashes.length;
    }

    for (const group of section.groups) {
      file.push(group.hashes);
    }

    payload = file.length + section.tables.length * DESCRIPTOR_SIZE;

    for (const table of section.tables) {
      const descriptor = file.length;

      file.writeUnsignedInt32(table.hash);
      file.writeUnsignedInt32(table.records.length);
      file.writeUnsignedInt32(payload - descriptor);
      payload += getRecordsSize(table.records);
    }

    for (const table of section.tables) {
      writeRecords(file, table.records);
    }
  }

  return file.build();
}
