import { readdir, readFile } from "node:fs/promises";

interface Fixture {
  file: string;
}

interface StoredTable {
  hashes: number[];
  texts: string[];
}

const directory = new URL("./", import.meta.url);
const names = await readdir(directory);

export const fixtures: Fixture[] = names
  .filter((file) => file.endsWith(".bin"))
  .toSorted()
  .map((file) => ({ file }));

export async function readFixture(file: string): Promise<Buffer> {
  const data = await readFile(new URL(file, directory));

  return data;
}

export function duplicateSections(data: Buffer): Buffer {
  const offset = data.readUInt32LE(24);
  const header = data.subarray(offset, offset + 20);
  const body = data.subarray(offset + 20);
  const result = Buffer.concat([data.subarray(0, offset), header, header, body, body]);

  result.writeUInt32LE(2, 20);
  result.writeUInt32LE(header.readUInt32LE(8) + 20, offset + 8);
  result.writeUInt32LE(header.readUInt32LE(16) + 20, offset + 16);
  result.writeUInt32LE(header.readUInt32LE(8) + body.length, offset + 28);
  result.writeUInt32LE(header.readUInt32LE(16) + body.length, offset + 36);

  return result;
}

export function withShift(data: Buffer, shift: number): Buffer {
  const result = Buffer.from(data);
  const originalShift = data.readUInt32LE(8);
  const tables = [{ offset: data.readUInt32LE(16), count: data.readUInt32LE(12) }];

  for (let section = 0; section < data.readUInt32LE(20); section++) {
    const header = data.readUInt32LE(24) + section * 20;
    const columns = header + data.readUInt32LE(header + 16);

    for (let column = 0; column < data.readUInt32LE(header + 12); column++) {
      const descriptor = columns + column * 12;

      tables.push({
        offset: descriptor + data.readUInt32LE(descriptor + 8),
        count: data.readUInt32LE(descriptor + 4),
      });
    }
  }

  for (const table of tables) {
    for (let index = 0; index < table.count; index++) {
      const record = table.offset + index * 16;
      const offset = record + data.readUInt32LE(record + 4);
      const size = data.readUInt32LE(record + 12);

      for (let byte = offset; byte < offset + size; byte++) {
        result[byte] = (data[byte]! - originalShift + shift + 256) % 256;
      }
    }
  }

  result.writeUInt32LE(shift, 8);

  return result;
}

export function readTables(data: Buffer): StoredTable[] {
  const tables: StoredTable[] = [];
  const shift = data.readUInt32LE(8);

  for (let section = 0; section < data.readUInt32LE(20); section++) {
    const header = data.readUInt32LE(24) + section * 20;
    const columns = header + data.readUInt32LE(header + 16);

    for (let column = 0; column < data.readUInt32LE(header + 12); column++) {
      const descriptor = columns + column * 12;
      const start = descriptor + data.readUInt32LE(descriptor + 8);
      const table: StoredTable = { hashes: [], texts: [] };

      for (let index = 0; index < data.readUInt32LE(descriptor + 4); index++) {
        const record = start + index * 16;
        const offset = record + data.readUInt32LE(record + 4);
        const units = data.readUInt32LE(record + 8);
        const size = data.readUInt32LE(record + 12);
        const bytes = Buffer.alloc(size);

        if (size !== units * 2 || offset + size > data.length) {
          throw new Error("Invalid PTD record");
        }

        for (let byte = 0; byte < size; byte++) {
          bytes[byte] = (data[offset + byte]! - shift + 256) % 256;
        }

        if (bytes.readUInt16LE(size - 2) !== 0) {
          throw new Error("Invalid PTD terminator");
        }

        table.hashes.push(data.readUInt32LE(record));
        table.texts.push(bytes.toString("utf16le", 0, size - 2));
      }

      tables.push(table);
    }
  }

  return tables;
}
