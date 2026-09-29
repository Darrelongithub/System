# Installing & Running Signal Finder Pro on Fedora

Plain-language guide to get this app running on a Fedora machine (Workstation
or Server). No prior setup assumed.

---

## 1. Install Node.js 22

The test suite runs on Node's built-in TypeScript type-stripping
(`--experimental-strip-types`), so **Node 22 or newer is required**.

### Option A — DNF module (simplest)

```bash
sudo dnf install -y nodejs npm
node --version   # must print v22.x or newer
```

If your Fedora release ships an older Node (anything below v22), use Option B.

### Option B — nvm (recommended if dnf Node is too old)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc          # or close & reopen the terminal
nvm install 22
nvm use 22
node --version            # v22.x
```

> **Why not the repo's package manager?** The project's lockfile is a
> `bun.lock`-era artifact, but everything here runs on plain `npm`. Use npm —
> it works and needs no extra toolchain.

## 2. Get the code and install dependencies

```bash
git clone https://github.com/Darrelongithub/System.git signal-finder
cd signal-finder
npm ci
```

`npm ci` installs the exact locked dependency tree. If it ever errors on an
optional platform package, `npm install` is a safe fallback.

## 3. Configure the candle provider (Twelve Data)

Candles come from [Twelve Data](https://twelvedata.com) — get a free API key,
then configure the server:

```bash
cp .env.example .env
nano .env
```

Any ONE of these layouts works (all configured keys are rotated on rate
limits and failures):

```bash
# Single key
TWELVE_DATA_API_KEY=your_key_here

# …or a CSV list
TWELVE_DATA_API_KEYS=key1,key2,key3

# …or numbered singles
TWELVE_DATA_API_KEY_1=aaaa
TWELVE_DATA_API_KEY_2=bbbb
```

Notes:

- **Never commit `.env`.** It is git-ignored; keep it that way.
- Keys live **server-side only** — they are read from the process environment
  at request time and are never sent to the browser.
- Without a key, candle fetches return a clear "No candle provider is
  configured" error (the app never fabricates data).

## 4. Run it

```bash
npm run dev
```

Then open <http://localhost:5173>.

### Exposing on your LAN

The dev server listens on localhost by default. To reach it from another
device on the same network:

```bash
npm run dev -- --host 0.0.0.0
```

Fedora's firewall (firewalld) blocks inbound connections by default. Open the
port for your trusted zone (replace `home` with your zone if different —
check with `firewall-cmd --get-active-zones`):

```bash
sudo firewall-cmd --zone=home --add-port=5173/tcp --permanent
sudo firewall-cmd --reload
```

Only do this on networks you trust; the dev server has no authentication
layer. For anything always-on, put a reverse proxy (Caddy/nginx) with TLS in
front of it instead.

## 5. Page map

| Route          | What it does                                                                          |
| -------------- | ------------------------------------------------------------------------------------- |
| `/`            | Home / landing                                                                        |
| `/generator`   | OHLC data generator — pulls candles (30m/1h/4h) from Twelve Data and builds the CSV   |
| `/analysis`    | Live analyzer — runs the frozen 9 strategies on a CSV; hosts the MT5 automation panel |
| `/backtest`    | Historical replay of the live decision process over a generated series                |

API surface (used by the UI; also handy for checking health):

| Endpoint                 | Purpose                                              |
| ------------------------ | ---------------------------------------------------- |
| `POST /api/market-data`  | Validated candle proxy (Twelve Data, key rotation)   |
| `GET /api/market-data/health` | Provider key configuration check               |
| `GET /api/mt5`           | MT5 engine + daemon status (incl. real candle feed)  |
| `POST /api/mt5/bridge`   | EA bridge — **token-authenticated** order dispatch   |
| `GET /api/mt5/ea?type=bridge\|standalone` | Download the generated .mq5 EA files |

## 6. Useful commands

```bash
npm run dev        # development server (http://localhost:5173)
npm test           # full regression suite (node strip-types; no extra runner)
npm run build      # production build
npm run preview    # serve the production build locally
npm run lint       # eslint
npm run format     # prettier --write .
```

Run a single test family by name filter:

```bash
npm test -- golden     # only tests whose name contains "golden"
```

## 7. Troubleshooting

| Symptom                                              | Fix                                                                                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--experimental-strip-types` unknown flag            | Your Node is too old — install Node 22+ (Option B above).                                                                                                        |
| "No candle provider is configured on the server"      | Create `.env` with a Twelve Data key (step 3) and restart `npm run dev`.                                                                                          |
| Twelve Data rate limit (429)                          | Wait ~60s; add more keys via `TWELVE_DATA_API_KEYS` for rotation. Smaller date windows help too.                                                                  |
| Port 5173 unreachable from another machine            | Pass `--host 0.0.0.0` AND open the firewall port (step 4).                                                                                                        |
| `EADDRINUSE` on startup                               | Another process holds 5173: `sudo lsof -i :5173` to find it, or run `npm run dev -- --port 5174`.                                                                |
| MT5 panel shows "No candle provider key on server"    | Same as above — the 24/7 daemon reads the same `.env`. Restart the dev server after editing it.                                                                   |
| Tests fail after editing strategy code                | That's usually the point — the golden pins detect drift. Read the failing assertion before touching anything; see `README.md` and `PROJECT-CHARTER.md`.            |

## 8. MetaTrader 5 automation

Want the app to execute on a real MT5 account, or run a 24/7 standalone EA?
Read **[`docs/MT5-AUTOMATION.md`](docs/MT5-AUTOMATION.md)** — it covers the two
modes (simulation vs real-trade bridge), the 4-step bridge setup, token
rotation, and the security model.
