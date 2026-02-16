// Standalone BHP256 computation script
// Called via: node --input-type=module bhp256-worker.mjs <fieldValue>
// Outputs just the commitment string to stdout

const fieldValue = process.argv[2];
if (!fieldValue) {
  process.exit(1);
}

const input = fieldValue.endsWith('field') ? fieldValue : `${fieldValue}field`;

try {
  const sdk = await import('@provablehq/sdk');
  const field = sdk.Field.fromString(input);
  const bits = field.toBitsLe();
  const hasher = new sdk.BHP256();
  const result = hasher.hash(bits);
  process.stdout.write(result.toString());
} catch (e) {
  process.stderr.write(String(e));
  process.exit(1);
}
