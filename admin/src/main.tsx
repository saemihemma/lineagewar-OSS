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
