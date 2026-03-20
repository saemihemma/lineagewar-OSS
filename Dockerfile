FROM node:22-slim

WORKDIR /app

# Build args — Railway passes service env vars as build args when declared
ARG VITE_LINEAGE_WAR_PACKAGE_ID
ARG VITE_SUI_RPC
ARG VITE_WAR_REGISTRY_ID
ARG VITE_SUI_GRAPHQL_URL

# Admin panel
COPY admin/ admin/
RUN cd admin && npm install && npm run build

# Scoreboard
COPY scoreboard/ scoreboard/
RUN cd scoreboard && npm install && npm run build

# Verifier
COPY verifier/ verifier/
RUN cd verifier && npm install

EXPOSE 3001

WORKDIR /app/verifier
CMD ["npx", "tsx", "src/live-chain-loop.ts"]
