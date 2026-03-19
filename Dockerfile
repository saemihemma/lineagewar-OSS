FROM node:22-slim

WORKDIR /app
RUN npm install -g typescript vite tsx

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

CMD ["tsx", "verifier/src/live-chain-loop.ts"]
