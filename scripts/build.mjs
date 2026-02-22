import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const deployDir = path.join(rootDir, "deploy");

const sourceHtmlPath = path.join(rootDir, "index.html");
const sourceCssPath = path.join(rootDir, "src", "style.css");
const sourceJsPath = path.join(distDir, "main.js");

const deployHtmlPath = path.join(deployDir, "index.html");
const deployCssPath = path.join(deployDir, "style.css");
const deployJsPath = path.join(deployDir, "main.js");

async function runTypeScriptBuild() {
  const { execSync } = await import("node:child_process");
  execSync("npm run build:ts", { stdio: "inherit" });
}

async function buildDeployFolder() {
  await rm(deployDir, { recursive: true, force: true });
  await mkdir(deployDir, { recursive: true });

  const html = await readFile(sourceHtmlPath, "utf8");
  const deployHtml = html
    .replace('href="src/style.css"', 'href="style.css"')
    .replace('src="dist/main.js"', 'src="main.js"');
  await writeFile(deployHtmlPath, deployHtml, "utf8");

  await copyFile(sourceCssPath, deployCssPath);
  await copyFile(sourceJsPath, deployJsPath);
}

async function main() {
  await runTypeScriptBuild();
  await buildDeployFolder();
  console.log("Deploy files generated in ./deploy");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
