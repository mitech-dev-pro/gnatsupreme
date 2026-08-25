# GNAT Supreme Care — VPS Deployment

End-to-end guide for deploying the full stack (Express/Prisma/PostgreSQL backend, React/Vite frontend, Redis) to a single Ubuntu/Debian VPS behind Nginx. No Docker.

This is the full-stack version of `backend/DEPLOYMENT.md` (backend-only, more detail on systemd/logrotate). Where the two overlap, this document and that one should stay consistent.

## 0. Topology

- One VPS, one Nginx instance, **one hostname** (`fapem.milifeghana.com` in the examples below — swap in your own):
  - `/` serves the built frontend (static files)
  - `/api/` reverse-proxies to the Node backend on `127.0.0.1:4000`, which already mounts every route under `/api/*` (see `backend/src/app.ts`) — same-origin, so no CORS is needed and cookies work without any `SameSite=none` complication.
- PostgreSQL and Redis run on the same host, bound to `127.0.0.1` only (not exposed publicly).
- Redis is not yet wired into the application code. It's provisioned here because it's the intended backing store for the background-job queue (BullMQ) that import processing is expected to move to — see the comment in `backend/src/modules/imports/import.routes.ts`. Provisioning it now means the app can adopt it without a follow-up infra change. If your deployment doesn't need it yet, you can skip section 3 and add it later.

Adjust the hostname, paths, and the `gnatsupreme` service account name to match your environment. (An earlier version of this doc assumed two separate hostnames, `portal.example.com`/`api.example.com` — if you deliberately want that split instead, put the API on its own `server_name` block rather than the `/api/` location in section 6, and set `CORS_ORIGIN`/`VITE_API_URL` to the API's own origin.)

## 1. Base server setup

### 1a. Create a sudo user and disable root SSH login

If you're currently logging in as `root`, create a non-root sudo user first:

```bash
adduser deploy
usermod -aG sudo deploy
```

Copy your SSH key over and confirm you can log in as `deploy` **before** disabling root login — don't skip the verification step, or you can lock yourself out.

Copy your key to `deploy` (run from your local machine):

```bash
ssh-copy-id deploy@your-vps-ip
```

If `ssh-copy-id` isn't available, do it manually while still logged in as root on the VPS:

```bash
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

In a **new** terminal (keep your root session open), confirm login and sudo both work:

```bash
ssh deploy@your-vps-ip
sudo whoami   # should print "root"
```

Only once that's confirmed, edit `/etc/ssh/sshd_config`:

```bash
sudo nano /etc/ssh/sshd_config
```

Set:

```
PermitRootLogin no
PasswordAuthentication no
```

(`PasswordAuthentication no` disables password-based SSH login entirely, not just for root — worth setting if you're only using SSH keys, since it kills brute-force attempts against any account.)

Restart SSH:

```bash
sudo systemctl restart ssh
```

Verify in yet another new terminal: `ssh root@your-vps-ip` should now be refused, while `ssh deploy@your-vps-ip` still works. Keep the original root session open until this check passes, in case you need to revert.

From here on, run every `sudo` command in this guide as `deploy`, not `root`.

### 1b. Install packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx build-essential

# Node.js (use the major version declared in backend/package.json / .nvmrc if present)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Dedicated, unprivileged service account
sudo useradd --system --create-home --shell /usr/sbin/nologin gnatsupreme
```

## 2. PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql <<'SQL'
CREATE USER gnatsupreme WITH PASSWORD 'replace-with-strong-password';
CREATE DATABASE gnatsupreme OWNER gnatsupreme;
SQL
```

Confirm PostgreSQL only listens on localhost (`listen_addresses = 'localhost'` in `postgresql.conf`, the default) — the backend connects over `127.0.0.1`, never over the public interface.

Set up automated backups (pg_dump on a cron/systemd timer, shipped off-host) before going live — see section 7.

## 3. Redis

```bash
sudo apt install -y redis-server
```

Harden `/etc/redis/redis.conf`:

```conf
bind 127.0.0.1 -::1
protected-mode yes
requirepass replace-with-a-strong-redis-password
supervised systemd
```

```bash
sudo systemctl enable --now redis-server
sudo systemctl restart redis-server
redis-cli -a 'replace-with-a-strong-redis-password' ping   # expect PONG
```

Do not expose port 6379 outside localhost — leave it off any firewall allow-list. When the backend adopts Redis (BullMQ, or moving rate-limit state out of process memory), add a `REDIS_URL` to `backend/.env.production.example` and to `/etc/gnatsupreme/backend.env`, e.g.:

```
REDIS_URL="redis://:replace-with-a-strong-redis-password@127.0.0.1:6379"
```

## 4. Backend

```bash
sudo install -d -o gnatsupreme -g gnatsupreme /opt/gnatsupreme/src
sudo install -d -o gnatsupreme -g gnatsupreme /opt/gnatsupreme/backend
sudo install -d -o gnatsupreme -g gnatsupreme /var/lib/gnatsupreme/uploads
sudo install -d -o gnatsupreme -g gnatsupreme /var/log/gnatsupreme
sudo install -d -o root -g gnatsupreme -m 750 /etc/gnatsupreme
```

(`install -d` only applies `-o`/`-g` to the directories named explicitly — not to `/opt/gnatsupreme` itself if it had to be created along the way, which would be `root`-owned since these run via `sudo`. That's fine: `gnatsupreme` only needs write access inside these four leaf directories, not to `/opt/gnatsupreme` itself.)

Clone the monorepo once to a working checkout, owned by `gnatsupreme` — `sudo -u gnatsupreme <command>` runs the command directly rather than through the account's login shell, so the `nologin` shell set in section 1 doesn't block it:

```bash
sudo -u gnatsupreme git clone <your-repo-url> /opt/gnatsupreme/src
```

For a redeploy, `cd /opt/gnatsupreme/src && sudo -u gnatsupreme git pull` instead of cloning again.

The checkout contains the whole monorepo (`backend/` and `frontend/` side by side), but `/opt/gnatsupreme/backend` — the path the systemd unit's `WorkingDirectory` points at — needs to contain the backend app directly, not nested under a `backend/` subfolder. Sync it across, then build at the deploy path:

```bash
sudo -u gnatsupreme rsync -a --delete --exclude node_modules --exclude dist /opt/gnatsupreme/src/backend/ /opt/gnatsupreme/backend/
cd /opt/gnatsupreme/backend
sudo -u gnatsupreme npm ci
sudo -u gnatsupreme npm run build
```

Copy `backend/.env.production.example` to `/etc/gnatsupreme/backend.env`, fill in every placeholder (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `FRONTEND_ORIGIN=https://fapem.milifeghana.com`, `REDIS_URL` once adopted, etc.), then lock it down. Run this as `root` (plain `sudo`, not `sudo -u gnatsupreme`) — `/etc/gnatsupreme` is `750` owned by `root:gnatsupreme`, so `gnatsupreme` can read inside it but not create files there:

```bash
sudo cp /opt/gnatsupreme/backend/.env.production.example /etc/gnatsupreme/backend.env
sudo chown root:gnatsupreme /etc/gnatsupreme/backend.env
sudo chmod 640 /etc/gnatsupreme/backend.env
sudo nano /etc/gnatsupreme/backend.env
```

Run migrations, then install and start the systemd unit. `npm run migrate:deploy` reads `DATABASE_URL` via `prisma.config.ts`'s `dotenv/config`, which loads a `.env` from the current directory — not `/etc/gnatsupreme/backend.env` (only systemd's `EnvironmentFile=` loads that automatically), so source it into the shell manually here:

```bash
cd /opt/gnatsupreme/backend
sudo -u gnatsupreme bash -c 'set -a; source /etc/gnatsupreme/backend.env; set +a; npm run migrate:deploy'

sudo cp deploy/gnatsupreme-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gnatsupreme-backend
sudo systemctl status gnatsupreme-backend
```

Install log rotation:

```bash
sudo cp deploy/logrotate.conf /etc/logrotate.d/gnatsupreme-backend
sudo logrotate --debug /etc/logrotate.d/gnatsupreme-backend
```

Tail logs with `journalctl -u gnatsupreme-backend -f`.

(`ecosystem.config.cjs` is provided as a PM2 alternative to systemd — use one or the other, not both. See `backend/DEPLOYMENT.md` for the PM2 invocation.)

## 5. Frontend

The app reads `VITE_API_URL` (see `frontend/src/lib/api.ts`) — just the origin, no `/api` suffix (the code appends `/api` itself). Vite bakes this in at build time, so it needs to exist *before* `npm run build` runs. Rather than passing it inline on the command every deploy, persist it as `.env.production` in the checkout — Vite auto-loads that file for `vite build` (mode defaults to `production`):

```bash
cd /opt/gnatsupreme/src/frontend
echo 'VITE_API_URL=https://fapem.milifeghana.com' > .env.production
npm ci
npm run build
```

`.env.production` is gitignored (see root `.gitignore`), so this survives `git pull` untouched but never gets committed — set it once per environment, not on every deploy.

If the build fails with `Cannot find module '../lightningcss.linux-x64-gnu.node'` (or a similar native-binary error from `esbuild`/`rolldown`): `package-lock.json` was generated on a non-Linux machine, and `npm ci` sometimes fails to resolve the correct platform-specific optional dependency binary — a known npm bug, not a code issue. Fix by re-resolving instead of trusting the lockfile as-is:

```bash
rm -rf node_modules
npm install
```

(`node_modules` isn't committed, so this is safe.) Then retry the build.

Ship the output (`frontend/dist/`) to a static path the Nginx site serves from, owned by an unprivileged account:

```bash
sudo install -d -o gnatsupreme -g gnatsupreme /var/www/gnatsupreme-portal
sudo rsync -a --delete frontend/dist/ /var/www/gnatsupreme-portal/
```

## 6. Nginx and TLS

Single site, single `server_name` — static frontend at `/`, API reverse-proxied at `/api/`. This supersedes `backend/deploy/nginx.conf` (which assumes the separate-hostname layout) — don't install that file as-is here.

`/etc/nginx/sites-available/fapem.milifeghana.com`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name fapem.milifeghana.com;

    client_max_body_size 10m;

    root /var/www/gnatsupreme-portal;
    index index.html;

    # API — every backend route is already mounted under /api/* (see backend/src/app.ts), so the
    # full incoming path must be forwarded unchanged. NOTE: no trailing slash after the port on
    # proxy_pass — a trailing slash tells Nginx to strip the matched /api/ prefix before forwarding,
    # which would 404 every request unless the client double-prefixed it (e.g. /api/api/members).
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
    }

    # Frontend — static SPA with client-side routing fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/fapem.milifeghana.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Obtain a TLS certificate for the hostname via Let's Encrypt (or your organization's approved process):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d fapem.milifeghana.com
```

Certbot rewrites the Nginx config to add the 443 server block and redirect HTTP → HTTPS, and installs a renewal timer (`systemctl status certbot.timer`).

Set `FRONTEND_ORIGIN` in the backend env file to the exact HTTPS origin (`https://fapem.milifeghana.com`) — the app uses credentialed cookies, so this cannot be `*`.

## 7. Backups

Back up before every deploy that includes a migration, and on a recurring schedule regardless:

```bash
pg_dump -U gnatsupreme -h 127.0.0.1 gnatsupreme | gzip > gnatsupreme-$(date +%F).sql.gz
```

Also back up `/var/lib/gnatsupreme/uploads` (member documents, marriage certificates, etc.) — it is not reproducible from the database. Ship both off-host on a schedule (cron/systemd timer + remote/object storage); Redis in this deployment holds only ephemeral/queue state and does not need backing up.

## 8. Deploying an update

```bash
# Pull the latest source into the working checkout
cd /opt/gnatsupreme/src
sudo -u gnatsupreme git pull   # or your artifact deploy step

# Backend
sudo -u gnatsupreme rsync -a --delete --exclude node_modules --exclude dist /opt/gnatsupreme/src/backend/ /opt/gnatsupreme/backend/
cd /opt/gnatsupreme/backend
sudo -u gnatsupreme npm ci
sudo -u gnatsupreme npm run build
sudo -u gnatsupreme bash -c 'set -a; source /etc/gnatsupreme/backend.env; set +a; npm run migrate:deploy'
sudo systemctl restart gnatsupreme-backend
curl --fail https://fapem.milifeghana.com/api/health

# Frontend (.env.production already sits in the checkout from the first deploy — no need to set it again)
cd /opt/gnatsupreme/src/frontend
npm ci
npm run build
sudo rsync -a --delete dist/ /var/www/gnatsupreme-portal/
```

Prisma migrations are forward-only — test schema changes against a restored copy of production data before applying them live, and take the PostgreSQL backup in section 7 first.

## Reference

- `backend/DEPLOYMENT.md` — backend-specific detail (systemd unit, logrotate, PM2 alternative)
- `backend/deploy/` — `gnatsupreme-backend.service`, `nginx.conf`, `logrotate.conf`
- `backend/.env.production.example` — full list of required backend environment variables
