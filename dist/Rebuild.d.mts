//#region src/Rebuild.d.ts
export type TextReplacements = ReadonlyMap<string, string>;
export declare function rebuild(data: Buffer, replacements?: TextReplacements): Buffer;
//#endregion