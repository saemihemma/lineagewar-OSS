# Lineage War — Admin UI

Showrunner admin dashboard for managing the Lineage War. Requires a Sui wallet with `WarAdminCap`.

## Screens

- **War Overview** — Dashboard showing current war state, tribes, and scoring
- **Phase Manager** — Create and manage war phases, configure scoring windows
- **Schedule** — Schedule config changes and phase transitions
- **System Config Editor** — Per-system scoring rules and storage requirements
- **Snapshot** — View and manage on-chain snapshot records
- **Preview** — Transaction preview before signing
- **War Setup** — Initial war creation wizard
- **Debug** — Advanced admin operations (win margin, war switching)

## Setup

```bash
cd frontend
cp admin/.env.example admin/.env.local
pnpm install
pnpm dev:admin
```

## Known Limitation

The admin app uses client-side password gating via `VITE_ADMIN_UNLOCK_PASSWORD`. This is **not real authentication** — it's a UI convenience gate that any developer can bypass by reading the source. The server-side `ADMIN_SECRET` header check (in `frontend/api/`) provides actual access control. Wallet-based authentication is a planned future improvement.
