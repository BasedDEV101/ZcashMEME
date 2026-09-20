// Build the burn+memo instructions a holder signs.
//
// Shared by the CLI and (later) the browser UI, so the transaction a user
// signs in a wallet is built by the same code the verifier was written
// against. It never signs or sends: callers supply the signer.

import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { createBurnCheckedInstruction } from "@solana/spl-token";
import { MEMO_V3 } from "./programs.ts";
import { parseTransparentAddress } from "../core/zcash-address.ts";

export interface BurnRequest {
  mint: string;
  tokenProgramId: string;
  tokenAccount: string;   // the holder's associated token account
  owner: string;
  amountRaw: bigint;
  decimals: number;
  zcashAddress: string;
  zcashNetwork: "main" | "test";
  minBurnRaw: bigint;
}

/** Throws with a message fit to show a user if the request could not be a valid burn. */
export function checkBurnRequest(r: BurnRequest): void {
  const addr = parseTransparentAddress(r.zcashAddress);
  if (!addr) throw new Error("That is not a Zcash transparent address. It should start with t1 or t3.");
  if (addr.network !== r.zcashNetwork) {
    throw new Error(`That address is for ${addr.network}net. Use a ${r.zcashNetwork}net address.`);
  }
  if (r.zcashAddress !== addr.address) throw new Error("Remove the surrounding whitespace from the address.");
  if (r.amountRaw < r.minBurnRaw) {
    const min = r.minBurnRaw / 10n ** BigInt(r.decimals);
    throw new Error(`The minimum burn is ${min.toLocaleString()} tokens.`);
  }
}

/**
 * The two instructions, in order. Extra instructions (compute budget, wallet
 * assertions) may be added around them: SPEC §3 tolerates them.
 */
export function buildBurnInstructions(r: BurnRequest): TransactionInstruction[] {
  checkBurnRequest(r);
  const owner = new PublicKey(r.owner);
  return [
    createBurnCheckedInstruction(
      new PublicKey(r.tokenAccount), new PublicKey(r.mint), owner,
      r.amountRaw, r.decimals, [], new PublicKey(r.tokenProgramId),
    ),
    new TransactionInstruction({
      keys: [{ pubkey: owner, isSigner: true, isWritable: false }],
      programId: new PublicKey(MEMO_V3),
      // TextEncoder, not Buffer: this runs in the browser as well as Node.
      data: new TextEncoder().encode(r.zcashAddress) as unknown as Buffer,
    }),
  ];
}
