// Injected before the app loads: a minimal Wallet Standard wallet, enough for
// @solana/wallet-adapter to detect, connect, and hand a transaction to.
// It never broadcasts. It captures the bytes the site asks it to sign, so we
// can decode them and prove the site builds a correct burn.
import { Keypair } from "@solana/web3.js";
// A real ed25519 keypair: a synthetic 32-byte array is off-curve, and
// getAssociatedTokenAddress rejects off-curve owners.
const KEY = Keypair.generate();
export const MOCK_PUBKEY = KEY.publicKey.toBase58();
export const MOCK = `
(() => {
  const bytes = new Uint8Array([${Array.from(KEY.publicKey.toBytes()).join(",")}]);
  const b58 = (u8) => {
    const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let n = 0n; for (const b of u8) n = (n << 8n) | BigInt(b);
    let s = ""; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
    for (const b of u8) { if (b !== 0) break; s = "1" + s; }
    return s;
  };
  const address = b58(bytes);
  window.__captured = [];
  const account = {
    address,
    publicKey: bytes,
    chains: ["solana:mainnet"],
    features: ["solana:signAndSendTransaction", "solana:signTransaction"],
    label: "Mock",
    icon: "data:image/svg+xml;base64,PHN2Zy8+",
  };
  const wallet = {
    version: "1.0.0",
    name: "MockWallet",
    icon: "data:image/svg+xml;base64,PHN2Zy8+",
    chains: ["solana:mainnet"],
    accounts: [],
    features: {
      "standard:connect": {
        version: "1.0.0",
        connect: async () => { wallet.accounts = [account]; return { accounts: wallet.accounts }; },
      },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => { wallet.accounts = []; } },
      "standard:events": { version: "1.0.0", on: () => () => {} },
      "solana:signAndSendTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signAndSendTransaction: async (...inputs) => {
          for (const i of inputs) window.__captured.push(Array.from(i.transaction));
          return [{ signature: new Uint8Array(64) }];
        },
      },
      "solana:signTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signTransaction: async (...inputs) => {
          for (const i of inputs) window.__captured.push(Array.from(i.transaction));
          return inputs.map((i) => ({ signedTransaction: i.transaction }));
        },
      },
    },
  };
  const register = (api) => api.register(wallet);
  window.addEventListener("wallet-standard:app-ready", (e) => register(e.detail));
  window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
})();
`;
