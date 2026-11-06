import { watch } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import MonsterTable from "../src/DB/Monsters/MonsterTable.js";

const serverRoot = "/rathena";
const outputPath = "/app/dist/Web/npc-navigation.json";
const renewal = !["false", "0", "no"].includes(
  String(process.env.RENEWAL || "true").toLowerCase(),
);
const scriptsConfig = path.join(
  serverRoot,
  "npc",
  renewal ? "re" : "pre-re",
  "scripts_main.conf",
);
const spriteIds = new Map(
  Object.entries(MonsterTable).map(([id, name]) => [
    String(name).toLowerCase(),
    Number(id),
  ]),
);

function normalizeMapName(value) {
  return value.toLowerCase().replace(/_[a-d]$/, "");
}

async function collectScriptFiles(configPath, visitedConfigs, npcFiles) {
  const resolvedConfig = path.resolve(configPath);
  if (visitedConfigs.has(resolvedConfig)) {
    return;
  }
  visitedConfigs.add(resolvedConfig);

  const config = await readFile(resolvedConfig, "utf8");
  for (const line of config.split(/\r?\n/)) {
    if (/^\s*\/\//.test(line)) {
      continue;
    }

    const importMatch = line.match(/^\s*import:\s*(\S+)/);
    if (importMatch) {
      await collectScriptFiles(
        path.resolve(serverRoot, importMatch[1]),
        visitedConfigs,
        npcFiles,
      );
      continue;
    }

    const npcMatch = line.match(/^\s*npc:\s*(\S+)/);
    if (npcMatch) {
      npcFiles.add(path.resolve(serverRoot, npcMatch[1]));
    }
  }
}

async function generateIndex() {
  const visitedConfigs = new Set();
  const npcFiles = new Set();
  await collectScriptFiles(scriptsConfig, visitedConfigs, npcFiles);

  const namesByLocation = new Map();
  const namesByClassLocation = new Map();

  for (const filePath of npcFiles) {
    const source = await readFile(filePath, "utf8");
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(
        /^\s*([^\s,]+),(\d+),(\d+),\d+\s+(?:script(?:\([^)]*\))?|duplicate\([^)]*\))\s+(.+)\s+([^\s,]+)(?:,\s*\d+\s*,\s*\d+)?\s*,?\s*\{?\s*$/i,
      );
      if (!match) {
        continue;
      }

      const [, mapName, x, y, rawName, className] = match;
      if (mapName === "-") {
        continue;
      }
      const name = rawName.split("::")[0].split("#")[0].trim();
      if (!name) {
        continue;
      }

      const normalizedMapName = normalizeMapName(mapName);
      const location = `${normalizedMapName}|${Number(x)}|${Number(y)}`;
      if (!namesByLocation.has(location)) {
        namesByLocation.set(location, new Set());
      }
      namesByLocation.get(location).add(name);

      const classId = /^\d+$/.test(className)
        ? Number(className)
        : spriteIds.get(className.toLowerCase());
      if (!Number.isInteger(classId) || classId < 0) {
        continue;
      }

      const classLocation = `${location}|${classId}`;
      if (!namesByClassLocation.has(classLocation)) {
        namesByClassLocation.set(classLocation, new Set());
      }
      namesByClassLocation.get(classLocation).add(name);
    }
  }

  const byLocation = Object.fromEntries(
    [...namesByLocation]
      .filter(([, names]) => names.size === 1)
      .map(([location, names]) => [location, names.values().next().value]),
  );
  const byClassLocation = Object.fromEntries(
    [...namesByClassLocation]
      .filter(([, names]) => names.size === 1)
      .map(([location, names]) => [location, names.values().next().value]),
  );
  const entries = Object.entries(byClassLocation).map(([key, name]) => {
    const [mapName, x, y, classId] = key.split("|");
    return {
      mapName,
      x: Number(x),
      y: Number(y),
      classId: Number(classId),
      name,
    };
  });

  const output = {
    version: 1,
    source: renewal
      ? "npc/re/scripts_main.conf"
      : "npc/pre-re/scripts_main.conf",
    byLocation,
    byClassLocation,
    entries,
  };
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(temporaryPath, JSON.stringify(output), "utf8");
  await rename(temporaryPath, outputPath);
  console.info(
    `[NPC navigation] Indexed ${entries.length} active NPC names from ${npcFiles.size} server files.`,
  );
}

if (process.argv[2] === "--once") {
  await generateIndex();
} else if (process.argv[2] === "--watch") {
  const watcher = watch(path.join(serverRoot, "npc"), { recursive: true });
  let debounceTimer;
  watcher.on("change", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      generateIndex().catch((error) => {
        console.error(
          "[NPC navigation] Failed to refresh server NPC names.",
          error,
        );
      });
    }, 500);
  });
  watcher.on("error", (error) => {
    console.error(
      "[NPC navigation] Could not watch server NPC scripts.",
      error,
    );
    process.exitCode = 1;
    watcher.close();
  });
  console.info(
    "[NPC navigation] Watching active server NPC scripts for changes.",
  );
} else {
  throw new Error("Expected --once or --watch.");
}
