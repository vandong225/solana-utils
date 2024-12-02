"use client";

/**
 * WalletContextProvider.tsx
 * 
 * This is a React functional component that provides a context for Solana wallets.
 * It uses various hooks and components from the @solana/wallet-adapter-react and @solana/wallet-adapter-react-ui libraries.
 * 
 * Props:
 * - children: ReactNode - The child components that will have access to the wallet context.
 * 
 * State:
 * - network: WalletAdapterNetwork - The network to connect to, in this case, it's set to Devnet.
 * - autoConnect: boolean - A value from the useWallet hook that indicates whether to automatically connect to the wallet.
 * - endpoint: string - The RPC endpoint for the network, obtained using the clusterApiUrl function with the network as an argument.
 * - wallets: Wallet[] - An array of wallet adapters that the user can choose from.
 * 
 * Returns:
 * - A ConnectionProvider component that provides the RPC connection context.
 * - A WalletProvider component that provides the wallet context, with the wallets and autoConnect props.
 * - A WalletModalProvider component that provides the context for a modal that allows the user to select and connect to a wallet.
 * 
 * The child components passed to this component will have access to these contexts and can use them to interact with the user's Solana wallet.
 */

import { FC, ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { clusterApiUrl } from "@solana/web3.js";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  MathWalletAdapter,
  TrustWalletAdapter,
  CoinbaseWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { useMemo } from "react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";

const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const network = WalletAdapterNetwork.Mainnet;

  //initiate auto connect
  const { autoConnect } = useWallet();

  // You can also provide a custom RPC endpoint.
  const endpoint = process.env.NEXT_PUBLIC_RPC_ENDPOINT || clusterApiUrl(network);

  //wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new MathWalletAdapter(),
      new TrustWalletAdapter(),
      new CoinbaseWalletAdapter(),
    ],
    [network]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletContextProvider;
