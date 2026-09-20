// Cross-runtime determinism check, served as a page so it runs in a REAL
// browser against the REAL bundle.
//
// The browser and the Node tooling must derive byte-identical addresses from
// the same phrase. If they ever diverge, a user's stamp is delivered to an
// address their recovery phrase does not control, silently and
// irreversibly. A Node test cannot catch that: it never runs the bundle.
//
// Vector: the published BIP39 test phrase, whose expected address is asserted
// in tests/zcash/hd.test.ts.
import { fromMnemonic } from "@protocol/zcash/hd.ts";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const EXPECTED_MAIN = "t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F";
const EXPECTED_TEST = "tmPLGq3RDkLhRcpr4jFXaNZMAHHXiVerN4Z";

const lines: string[] = [];
let ok = true;
try {
  const main = fromMnemonic(PHRASE, "main");
  const test = fromMnemonic(PHRASE, "test");
  ok = main.address === EXPECTED_MAIN && test.address === EXPECTED_TEST && main.path === "m/44'/133'/0'/0/0";
  lines.push(`path     ${main.path}`);
  lines.push(`mainnet  ${main.address}  ${main.address === EXPECTED_MAIN ? "MATCH" : "MISMATCH expected " + EXPECTED_MAIN}`);
  lines.push(`testnet  ${test.address}  ${test.address === EXPECTED_TEST ? "MATCH" : "MISMATCH expected " + EXPECTED_TEST}`);
} catch (e) {
  ok = false;
  lines.push(`threw: ${(e as Error).message}`);
}
lines.push(ok ? "SELFTEST OK" : "SELFTEST FAILED");
document.getElementById("out")!.textContent = lines.join("\n");
