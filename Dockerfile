FROM node:20-slim

WORKDIR /app
ENV PATH="/app/admin/node_modules/.bin:/app/scoreboard/node_modules/.bin:/app/verifier/node_modules/.bin:$PATH"

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

CMD ["npx", "tsx", "verifier/src/live-chain-loop.ts"]
