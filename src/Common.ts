import { BufferConsumer } from "@triforce-heroes/triforce-core/BufferConsumer";

import {
  DESCRIPTOR_SIZE,
  HEADER_SIZE,
  RECORD_SIZE,
  SECTION_SIZE,
  type PTD,
  type PTDSection,
  type PTDRecord,
} from "#/types/PTD";

function assertRange(data: Buffer, offset: number, size: number): void {
  if (offset < HEADER_SIZE || offset + size > data.length) {
    throw new Error("PTD: data extends beyond the file.");
  }
}

export function decodeString(data: Buffer): string {
  return data.toString("utf16le", 0, data.length - 2);
}

export function encodeString(text: string): Buffer {
  if (text.includes("\0")) {
    throw new Error("PTD: replacement contains a null character.");
  }

  return Buffer.from(`${text}\0`, "utf16le");
}

function readRecords(data: Buffer, offset: number, count: number, shift: number): PTDRecord[] {
  assertRange(data, offset, count * RECORD_SIZE);

  const reader = new BufferConsumer(data, offset);
  const minimum = offset + count * RECORD_SIZE;
  const records: PTDRecord[] = [];

  for (let index = 0; index < count; index++) {
    const recordOffset = reader.byteOffset;
    const hash = reader.readUnsignedInt32();
    const textOffset = recordOffset + reader.readUnsignedInt32();
    const units = reader.readUnsignedInt32();
    const size = reader.readUnsignedInt32();

    if (size < 2 || size !== units * 2 || textOffset < minimum) {
      throw new Error("PTD: invalid string record.");
    }

    assertRange(data, textOffset, size);

    if (data[textOffset + size - 2] !== shift || data[textOffset + size - 1] !== shift) {
      throw new Error("PTD: missing string terminator.");
    }

    const source = data.subarray(textOffset, textOffset + size);
    const value = shift === 0 ? source : Buffer.from(source);

    if (shift !== 0) {
      for (let byte = value.length - 1; byte >= 0; byte--) {
        value[byte]! -= shift;
      }
    }

    records.push({ hash, value, reference: "" });
  }

  return records;
}

function resolveKey(keys: ReadonlyMap<number, string>, hash: number): string {
  const key = keys.get(hash);

  if (key === undefined) {
    throw new Error(`PTD: unknown key hash: ${hash}.`);
  }

  return key;
}

export function describePTD(data: Buffer): PTD {
  if (data.length < HEADER_SIZE) {
    throw new Error("PTD: invalid or unsupported file.");
  }

  const header = new BufferConsumer(data);

  if (header.readUnsignedInt32() !== 0x00_44_54_50 || header.readUnsignedInt32() !== 2) {
    throw new Error("PTD: invalid or unsupported file.");
  }

  const shift = header.readUnsignedInt32() % 256;
  const keyCount = header.readUnsignedInt32();
  const keyOffset = header.readUnsignedInt32();
  const sectionCount = header.readUnsignedInt32();
  const sectionOffset = header.readUnsignedInt32();
  const keys = readRecords(data, keyOffset, keyCount, shift);
  const names = new Map<number, string>();

  for (const key of keys) {
    names.set(key.hash, decodeString(key.value));
  }

  const sections: PTDSection[] = [];
  const occurrences = new Map<number, number>();

  assertRange(data, sectionOffset, sectionCount * SECTION_SIZE);

  const sectionReader = new BufferConsumer(data, sectionOffset);

  for (let index = 0; index < sectionCount; index++) {
    const offset = sectionReader.byteOffset;
    const hash = sectionReader.readUnsignedInt32();
    const groupCount = sectionReader.readUnsignedInt32();
    const groupOffset = offset + sectionReader.readUnsignedInt32();
    const tableCount = sectionReader.readUnsignedInt32();
    const tableOffset = offset + sectionReader.readUnsignedInt32();
    const section: PTDSection = { hash, groups: [], tables: [] };

    assertRange(data, groupOffset, groupCount * DESCRIPTOR_SIZE);
    assertRange(data, tableOffset, tableCount * DESCRIPTOR_SIZE);

    const groupReader = new BufferConsumer(data, groupOffset);

    for (let group = 0; group < groupCount; group++) {
      const descriptor = groupReader.byteOffset;
      const groupHash = groupReader.readUnsignedInt32();
      const size = groupReader.readUnsignedInt32() * 4;
      const start = descriptor + groupReader.readUnsignedInt32();

      assertRange(data, start, size);
      section.groups.push({
        hash: groupHash,
        hashes: data.subarray(start, start + size),
      });
    }

    const tableReader = new BufferConsumer(data, tableOffset);

    for (let table = 0; table < tableCount; table++) {
      const descriptor = tableReader.byteOffset;
      const tableHash = tableReader.readUnsignedInt32();
      const count = tableReader.readUnsignedInt32();
      const start = descriptor + tableReader.readUnsignedInt32();
      const name = resolveKey(names, tableHash);
      const records = readRecords(data, start, count, shift);

      if (name === "Text") {
        for (const record of records) {
          const key = resolveKey(names, record.hash);
          const occurrence = (occurrences.get(record.hash) ?? 0) + 1;

          occurrences.set(record.hash, occurrence);

          record.reference = occurrence === 1 ? key : `${key}#${occurrence}`;
        }
      }

      section.tables.push({ hash: tableHash, name, records });
    }

    sections.push(section);
  }

  return { keys, sections };
}
