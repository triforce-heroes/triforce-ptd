import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { Publisher } from "@triforce-heroes/triforce-publisher";

import { extract } from "#/Extract";

const publisher = new Publisher(12);

const languages = new Map<string, string>([
  ["CSzk", "zh-CN"],
  ["EUde", "de"],
  ["EUes", "es-EU"],
  ["EUfr", "fr-EU"],
  ["EUit", "it"],
  ["EUru", "ru"],
  ["JPja", "jp"],
  ["TWzk", "zh-TW"],
  ["USen", "en"],
]);

for (const [name, canonical] of languages) {
  publisher.addLanguage(name, canonical);
}

interface FixtureTask {
  file: string;
  resource: string;
  language: string;
}

const filenamePattern = /^(?<resource>.+)_(?<language>[A-Z]{2}[a-z]{2})\.bin$/v;
const files = await readdir("tests/fixtures");
const tasks: FixtureTask[] = [];

for (const file of files.toSorted()) {
  const groups = filenamePattern.exec(file)?.groups;
  const language = groups?.["language"];

  if (language === undefined || !languages.has(language)) {
    continue;
  }

  tasks.push({ file, resource: groups!["resource"]!, language });
}

const contents = await Promise.all(
  tasks.map(async ({ file }) => readFile(join("tests/fixtures", file))),
);

for (const [index, { resource, language }] of tasks.entries()) {
  for (const [reference, text] of extract(contents[index]!)) {
    publisher.addReference(language, resource, reference, text);
  }
}

await publisher.save("tools/resources");
