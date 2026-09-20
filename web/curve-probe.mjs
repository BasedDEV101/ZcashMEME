import { PublicKey } from "@solana/web3.js";
const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const mint = new PublicKey(process.argv[2]);
const RPC = process.argv[3];
for (const seed of ["bonding-curve", "bonding_curve"]) {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from(seed), mint.toBuffer()], PUMP);
  const res = await fetch(RPC, { method: "POST", headers: {"content-type":"application/json"},
    body: JSON.stringify({jsonrpc:"2.0",id:1,method:"getAccountInfo",params:[pda.toBase58(),{encoding:"base64",commitment:"finalized"}]})});
  const j = await res.json();
  const v = j.result?.value;
  console.log(`seed="${seed}" pda=${pda.toBase58().slice(0,12)}… exists=${!!v} owner=${v?.owner?.slice(0,12)} len=${v ? Buffer.from(v.data[0],"base64").length : 0}`);
  if (v) {
    const d = Buffer.from(v.data[0], "base64");
    console.log("  hex:", d.subarray(0, 64).toString("hex"));
    for (let off = 8; off + 8 <= Math.min(d.length, 56); off += 8) {
      console.log(`   u64@${off}: ${d.readBigUInt64LE(off)}`);
    }
    console.log("  byte@48:", d[48], "byte@" + (d.length-33) + ":", d[d.length-33]);
  }
}
