FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=development

# Admin panel
COPY admin/package.json admin/package-lock.json* admin/
RUN cd admin && npm install
COPY admin/ admin/
RUN cd admin && npm run build

# Scoreboard
COPY scoreboard/package.json scoreboard/package-lock.json* scoreboard/
RUN cd scoreboard && npm install
COPY scoreboard/ scoreboard/
RUN cd scoreboard && npm run build

# Verifier
COPY verifier/package.json verifier/package-lock.json* verifier/
RUN cd verifier && npm install
COPY verifier/ verifier/

ENV NODE_ENV=production
EXPOSE 3001

CMD ["npx", "tsx", "verifier/src/live-chain-loop.ts"]
