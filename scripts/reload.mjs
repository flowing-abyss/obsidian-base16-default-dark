import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const OBSIDIAN = "/opt/homebrew/bin/obsidian";
// Several vaults can be open at once. The CLI's implicit target follows
// focus, while the screenshot fixtures belong to this development vault.
export const VAULT_ARG = `vault=${process.env.OBSIDIAN_VAULT || "Obsidian"}`;

// A theme update can replace the development symlink with a regular file.
// Sync the build first, then clear the cache: loadTheme() alone can otherwise
// re-apply either an old installed copy or the cached symlink contents.
export function reload() {
  const themeName = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url))).name;
  const cssPath = fileURLToPath(new URL("../theme.css", import.meta.url));
  const code = `(async()=>{
    const name=${JSON.stringify(themeName)};
    if(app.customCss.theme!==name) throw new Error("Select "+name+" before reloading");
    const css=require("fs").readFileSync(${JSON.stringify(cssPath)},"utf8");
    const target=app.vault.configDir+"/themes/"+name+"/theme.css";
    if(await app.vault.adapter.read(target)!==css) await app.vault.adapter.write(target,css);
    app.customCss.csscache.clear();
    await app.customCss.loadTheme();
    await new Promise(r=>setTimeout(r,400));
    return JSON.stringify("ok");
  })()`;
  const output = execFileSync(OBSIDIAN, [VAULT_ARG, "eval", `code=${code}`], {
    encoding: "utf8",
    timeout: 30_000,
    killSignal: "SIGKILL",
  });
  // CLI eval reports JavaScript errors on stdout with exit code zero.
  if (!/^=>\s*"ok"\s*$/m.test(output)) throw new Error(`Theme reload failed:\n${output}`);
  return output;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(reload());
}
