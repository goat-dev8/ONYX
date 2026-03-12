// Compute on-chain sale_id from sale parameters
// Replicates: sale_id = BHP256(tag_hash + sale_salt + BHP256(seller_address))
// Usage: node --input-type=module sale-id-worker.mjs <tagHash> <saleSalt> <sellerAddress>

const tagHash = process.argv[2];
const saleSalt = process.argv[3];
const sellerAddress = process.argv[4];

if (!tagHash || !saleSalt || !sellerAddress) {
  process.exit(1);
}

try {
  const sdk = await import('@provablehq/sdk');

  // Step 1: seller_hash = BHP256::hash_to_field(seller_address)
  const addr = sdk.Address.from_string(sellerAddress);
  const addrBits = addr.toBitsLe();
  const hasher = new sdk.BHP256();
  const sellerHash = hasher.hash(addrBits);

  // Step 2: sum = tag_hash + sale_salt + seller_hash (field addition)
  const tagField = sdk.Field.fromString(tagHash.endsWith('field') ? tagHash : `${tagHash}field`);
  const saltField = sdk.Field.fromString(saleSalt.endsWith('field') ? saleSalt : `${saleSalt}field`);
  const sum = tagField.add(saltField).add(sellerHash);

  // Step 3: sale_id = BHP256::hash_to_field(sum)
  const saleId = hasher.hash(sum.toBitsLe());

  process.stdout.write(saleId.toString());
} catch (e) {
  process.stderr.write(String(e));
  process.exit(1);
}
