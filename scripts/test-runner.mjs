import { run } from "node:test";
import { spec } from "node:test/reporters";
import fs from "node:fs";
import path from "node:path";

const testsDir = path.resolve("dist/tests");
if (!fs.existsSync(testsDir)) {
  console.log("No dist/tests directory found in " + process.cwd());
  process.exit(0);
}

const files = fs
  .readdirSync(testsDir)
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => path.join(testsDir, f));

if (files.length === 0) {
  console.log("No .test.js files found in " + testsDir);
  process.exit(0);
}

const testStream = run({ files });
testStream.compose(new spec()).pipe(process.stdout);

testStream.on("test:fail", () => {
  process.exitCode = 1;
});
