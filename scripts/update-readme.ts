import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const packageJsonPath = join(__dirname, "../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const nodeVersion = process.version.split("v")[1];

const dependencies = {
  Mantine: packageJson.dependencies["@mantine/core"],
  NodeJS: nodeVersion,
  ElectronJS: packageJson.devDependencies.electron,
  "Electron Builder": packageJson.devDependencies["electron-builder"],
  TypeScript: packageJson.devDependencies.typescript,
  ReactJS: packageJson.dependencies.react,
  Vite: packageJson.devDependencies.vite,
};

const badgeColors = {
  Mantine: "339AF0",
  ElectronJS: "E73D2F",
  ElectronBuilder: "blue",
  NodeJS: "44883e",
  TypeScript: "blue",
  NextJS: "black",
  ReactJS: "61DAFB",
  Vite: "9135FF",
} as Record<string, string>;

// Simple Icons slugs (https://simpleicons.org) used as the `logo` query param
// for shields.io badges (https://shields.io/badges).
const badgeLogos = {
  Mantine: "mantine",
  ElectronJS: "electron",
  "Electron Builder": "electronbuilder",
  NodeJS: "nodedotjs",
  TypeScript: "typescript",
  NextJS: "nextdotjs",
  ReactJS: "react",
  Vite: "vite",
} as Record<string, string>;

const buildBadgeUrl = (name: string, version: string) => {
  const label = name.replace(/ /g, "%20");
  const message = `v${version}`.replace("^", "");
  const params = new URLSearchParams();

  if (badgeLogos[name]) {
    params.set("logo", badgeLogos[name]);
    // Logo uses the same color defined for the badge.
    params.set("logoColor", badgeColors[name]);
  }

  const query = params.toString();
  return `https://img.shields.io/badge/${label}-${message}-${badgeColors[name]}${
    query ? `?${query}` : ""
  }`;
};

const badges = Object.entries(dependencies).map(([name, version]) => {
  const url = buildBadgeUrl(
    name,
    typeof version === "string" ? version : "N/A",
  );
  return ` <img alt="static badge from ${name.toLocaleLowerCase()}" src="${url}">`;
});

const badgesString = `<div align="center">\n${badges.join("\n")}\n</div>`;

console.log(badgesString);

const readmePath = join(__dirname, "../README.md");
const readmeContent = readFileSync(readmePath, "utf-8");

const badgeStart = "<!-- Badge Start -->";
const badgeEnd = "<!-- Badge End -->";

const updatedReadmeContent = readmeContent.replace(
  new RegExp(`${badgeStart}[\\s\\S]*?${badgeEnd}`),
  `${badgeStart}\n${badgesString}\n${badgeEnd}`,
);

writeFileSync(readmePath, updatedReadmeContent, "utf-8");
