import { Metaplex } from "@metaplex-foundation/js";
import { Connection } from "@solana/web3.js";

let metaplex: Metaplex | null = null;

export const getMetaplex = () => {
  if (!metaplex) {
    const connection = new Connection(
      process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://api.mainnet-beta.solana.com"
    );
    metaplex = new Metaplex(connection);
  }
  return metaplex;
}; 