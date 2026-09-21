import { sha256 } from "@noble/hashes/sha2";

// Only the digest ships. The route segment itself is deliberately absent from
// the repository and production bundle, so it cannot be recovered by grepping
// the public source. This is an obscurity layer; wallet signatures remain the
// authority for every fee claim.
const FEE_ADMIN_ROUTE_DIGEST = "18d007e68bdb1a8ddf1cde3cda2017bc0f53e6187c5fd5b8f371de249209a60c";

function digest(value: string): string {
  return Array.from(sha256(new TextEncoder().encode(value)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isFeeAdminRoute(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 1 || !/^[A-Za-z0-9_-]{32}$/.test(segments[0])) return false;
  return digest(segments[0]) === FEE_ADMIN_ROUTE_DIGEST;
}
