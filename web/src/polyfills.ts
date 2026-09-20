// Must be the first import in main.tsx.
//
// @solana/spl-token and @coral-xyz/anchor (via @pump-fun/pump-sdk) use Node's
// Buffer, and Anchor touches it while being imported. ES imports are hoisted
// and evaluated in order, so assigning the global inside main.tsx ran too
// late: the page died with "Buffer is not defined" before React mounted.
// A side-effect module imported first is evaluated first.
import { Buffer } from "buffer";

globalThis.Buffer ??= Buffer;
