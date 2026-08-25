import { evaluateDeploymentPreflight } from "../src/lib/deployment-preflight";

const result = evaluateDeploymentPreflight(process.env);
console.log(JSON.stringify({
  checked_at: new Date().toISOString(),
  mode: "read_only",
  target: result.target,
  passed: result.passed,
  failures: result.failures,
  warnings: result.warnings,
  secret_values_printed: false,
}, null, 2));
if (!result.passed) process.exitCode = 1;
