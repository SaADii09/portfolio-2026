import { execSync } from "node:child_process";

const commands = [
  ["npx", "fallow"],
  ["npx", "fallow", "dead-code"],
  ["npx", "fallow", "health"],
  ["npx", "fallow", "dupes"],
];

async function main() {
  console.log("Running Fallow analyses...\n");

  for (const args of commands) {
    const cmd = args.join(" ");
    console.log(`▸ ${cmd}`);
    try {
      execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
      console.log("  ✓ pass\n");
    } catch {
      console.log("  ⚠ findings reported\n");
    }
  }

  console.log("All Fallow analyses complete.");
}

main().catch(console.error);
