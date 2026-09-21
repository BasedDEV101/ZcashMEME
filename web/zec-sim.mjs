// Simulate exactly what the site builds, and read pump's own error.
import { Connection, Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { PumpSdk } from "@pump-fun/pump-sdk";
import BN from "bn.js";

const conn = new Connection(process.argv[2], "confirmed");
// The real site compiles against the lookup table; without it the same
// instructions overflow and the failure says nothing about pump.
const LOOKUP = new PublicKey("3zEFdQiMCRF5ew9KuLkeT4XVnRSRJjv58HWv8LSxvzJP");
const sdk = new PumpSdk();
const table = (await conn.getAddressLookupTable(LOOKUP)).value;
const ZEC = new PublicKey("A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS");
const ZEC_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const payer = new PublicKey("mAQdwbg2EUGLgTfCV6Ts6S3PNFSiUW7pCwo1341p5FS");
const operator = new PublicKey("26oK69pYx7R25ULts9hLYF2HpTnZ421jPYMPsds9GtYA");
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

async function trial(label, opts) {
  const mint = Keypair.generate();
  const ixs = [];
  ixs.push(await sdk.createV2Instruction({
    mint: mint.publicKey, name: "Sim Coin", symbol: "SIMC",
    uri: "https://www.zcashstamp.com/m/abc123.json",
    creator: payer, user: payer, mayhemMode: false,
    ...(opts.creatorFeeBps ? { creatorFeeBps: new BN(200) } : {}),
    ...(opts.zec ? { quoteMint: ZEC, quoteTokenProgram: ZEC_PROGRAM } : {}),
  }));
  if (opts.sharing) {
    ixs.push(await sdk.createFeeSharingConfig({ creator: payer, mint: mint.publicKey, pool: null }));
    ixs.push(opts.zec
      ? await sdk.updateFeeSharesV2({ authority: payer, mint: mint.publicKey,
          currentShareholders: [payer], newShareholders: [{ address: operator, shareBps: 10_000 }],
          quoteMint: ZEC, quoteTokenProgram: ZEC_PROGRAM })
      : await sdk.updateFeeShares({ authority: payer, mint: mint.publicKey,
          currentShareholders: [payer], newShareholders: [{ address: operator, shareBps: 10_000 }] }));
  }
  if (opts.feeAndMemo) {
    ixs.push(SystemProgram.transfer({ fromPubkey: payer, toPubkey: operator, lamports: 500_000_000 }));
    ixs.push(new TransactionInstruction({
      keys: [{ pubkey: payer, isSigner: true, isWritable: false }], programId: MEMO,
      data: Buffer.from(`zsam:deploy:1:${mint.publicKey.toBase58()}:SIMC:1000000`, "utf8"),
    }));
  }
  const { blockhash } = await conn.getLatestBlockhash("finalized");
  const msg = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs })
    .compileToV0Message(table ? [table] : []);
  const tx = new VersionedTransaction(msg);
  tx.sign([mint]);
  const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
  const size = tx.serialize().length;
  if (!sim.value.err) { console.log(`${label}: OK (${size} bytes)`); return; }
  console.log(`${label}: FAILS (${size} bytes)`);
  console.log("    err:", JSON.stringify(sim.value.err));
  for (const l of (sim.value.logs ?? []).slice(-6)) console.log("    ", l.slice(0, 150));
}

await trial("SOL, create only            ", { zec: false });
await trial("ZEC, create only            ", { zec: true });
await trial("ZEC, create + sharing       ", { zec: true, sharing: true });
await trial("ZEC, full launch (as shipped)", { zec: true, sharing: true, feeAndMemo: true, creatorFeeBps: true });
