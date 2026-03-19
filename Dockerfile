FROM node:20-slim

WORKDIR /app

# Admin panel (needs devDeps for tsc + vite build)
COPY admin/package.json admin/package-lock.json* admin/
RUN cd admin && npm install --include=dev
COPY admin/ admin/
RUN cd admin && npm run build

# Scoreboard (needs devDeps for tsc + vite build)
COPY scoreboard/package.json scoreboard/package-lock.json* scoreboard/
RUN cd scoreboard && npm install --include=dev
COPY scoreboard/ scoreboard/
RUN cd scoreboard && npm run build

# Verifier (needs tsx at runtime)
COPY verifier/package.json verifier/package-lock.json* verifier/
RUN cd verifier && npm install --include=dev
COPY verifier/ verifier/

EXPOSE 3001

CMD ["npx", "tsx", "verifier/src/live-chain-loop.ts"]
