import { Configuration } from "electron-builder";
import { writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { displayName, repository } from "../package.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// owner/repo come from the same field scripts/common.ps1 reads. This file is
// generated (and git-ignored), so the release script cannot treat its
// `publish` block as the source of truth — package.json serves both, so they
// can never point at different repositories.
const repoMatch = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(
  repository.url,
);
if (!repoMatch) {
  throw new Error(
    `Could not extract owner/repo from "repository.url" (${repository.url}).`,
  );
}
const [, owner, repo] = repoMatch;

const config: Configuration = {
  appId: "br.com.saulotarsobc.electron-with-vite",
  productName: displayName,
  files: ["dist/**/*"],
  // Without this block electron-builder never writes the update manifest
  // (latest.yml / latest-mac.yml / latest-linux.yml, which electron-updater
  // downloads from releases/latest/download/) nor embeds app-update.yml in
  // the package — the installed app would have no way to learn a new
  // version exists.
  publish: [
    {
      provider: "github",
      owner,
      repo,
      releaseType: "release",
    },
  ],
  directories: {
    output: "out",
  },
  win: {
    target: ["nsis"],
    artifactName: "${name}-${version}-windows-${arch}.${ext}",
  },
  nsis: {
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    oneClick: false,
  },
  mac: {
    target: "dmg",
    signIgnore: null,
    artifactName: "${productName}-Setup-${version}.${ext}",
  },
  linux: {
    target: ["AppImage", "deb"],
    artifactName: "${name}-${version}-linux-${arch}.${ext}",
  },
};

const outputPath = resolve(__dirname, "..", "electron-builder.json");

writeFileSync(outputPath, JSON.stringify(config, null, 2));

console.log(`✅ JSON generated: ${outputPath}`);
