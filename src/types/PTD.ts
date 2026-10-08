export const HEADER_SIZE = 28;
export const RECORD_SIZE = 16;
export const SECTION_SIZE = 20;
export const DESCRIPTOR_SIZE = 12;

export interface PTDString {
  hash: number;
  value: Buffer;
}

export interface PTDRecord extends PTDString {
  reference: string;
}

export interface PTDGroup {
  hash: number;
  hashes: Buffer;
}

export interface PTDTable {
  hash: number;
  name: string;
  records: PTDRecord[];
}

export interface PTDSection {
  hash: number;
  groups: PTDGroup[];
  tables: PTDTable[];
}

export interface PTD {
  keys: PTDString[];
  sections: PTDSection[];
}
