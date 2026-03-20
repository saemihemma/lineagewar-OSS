import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { createDAppKit } from "@mysten/dapp-kit-core";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import App from "./App";
import { AdminPortalProvider } from "./lib/admin-context";
import { SUI_RPC_URL } from "./lib/constants";
import "./index.css";

const queryClient = new QueryClient();
const networks = ["testnet", "mainnet"];

const dAppKit = createDAppKit({
  networks,
  defaultNetwork: "testnet",
  createClient(network) {
    const selectedNetwork = network as "testnet" | "mainnet";
    return new SuiJsonRpcClient({
      network: selectedNetwork,
      url:
        selectedNetwork === "testnet" ? SUI_RPC_URL || getJsonRpcFullnodeUrl("testnet") : getJsonRpcFullnodeUrl("mainnet"),
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
        <ReactQueryDevtools initialIsOpen={false} />
      </DAppKitProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
