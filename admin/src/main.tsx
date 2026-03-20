import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { createDAppKit } from "@mysten/dapp-kit-core";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import App from "./App";
import { AdminPortalProvider } from "./lib/admin-context";
import { SUI_RPC_URL } from "./lib/constants";
import "./index.css";

const queryClient = new QueryClient();
const networks = ["testnet", "mainnet"] as const;
const walletLogPrefix = "[lineage-admin/wallet]";

const dAppKit = createDAppKit({
  networks,
  defaultNetwork: "testnet",
  createClient(network) {
    return new SuiJsonRpcClient({
      network,
      url: SUI_RPC_URL || getJsonRpcFullnodeUrl(network),
    });
  },
});

function summarizeWallet(wallet: {
  name?: string;
  chains?: readonly string[];
  features?: readonly string[];
}) {
  return {
    name: wallet.name ?? "unknown",
    chains: [...(wallet.chains ?? [])],
    features: [...(wallet.features ?? [])],
  };
}

function summarizeConnection(connection: {
  status: string;
  wallet: { name?: string } | null;
  account: { address?: string } | null;
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  isDisconnected: boolean;
}) {
  return {
    status: connection.status,
    walletName: connection.wallet?.name ?? null,
    address: connection.account?.address ?? null,
    isConnected: connection.isConnected,
    isConnecting: connection.isConnecting,
    isReconnecting: connection.isReconnecting,
    isDisconnected: connection.isDisconnected,
  };
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    };
  }
  return error;
}

if (typeof window !== "undefined") {
  const originalConnectWallet = dAppKit.connectWallet.bind(dAppKit);
  dAppKit.connectWallet = async (args) => {
    console.info(walletLogPrefix, "connect:start", summarizeWallet(args.wallet));
    try {
      const result = await originalConnectWallet(args);
      console.info(walletLogPrefix, "connect:success", {
        wallet: summarizeWallet(args.wallet),
        accounts: result.accounts.map((account) => account.address),
      });
      return result;
    } catch (error) {
      console.error(walletLogPrefix, "connect:error", {
        wallet: summarizeWallet(args.wallet),
        error: serializeError(error),
      });
      throw error;
    }
  };

  dAppKit.stores.$wallets.subscribe((wallets) => {
    console.info(
      walletLogPrefix,
      "wallets:available",
      wallets.map((wallet) => summarizeWallet(wallet)),
    );
  });

  dAppKit.stores.$connection.subscribe((connection) => {
    console.info(walletLogPrefix, "connection", summarizeConnection(connection));
  });

  (
    window as typeof window & {
      __LINEAGE_ADMIN_WALLET_DEBUG__?: {
        getWallets: () => ReturnType<typeof summarizeWallet>[];
        getConnection: () => ReturnType<typeof summarizeConnection>;
      };
    }
  ).__LINEAGE_ADMIN_WALLET_DEBUG__ = {
    getWallets: () => dAppKit.stores.$wallets.get().map((wallet) => summarizeWallet(wallet)),
    getConnection: () => summarizeConnection(dAppKit.stores.$connection.get()),
  };
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <DAppKitProvider dAppKit={dAppKit}>
        <AdminPortalProvider>
          <App />
        </AdminPortalProvider>
      </DAppKitProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
