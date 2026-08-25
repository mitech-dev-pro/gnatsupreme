# GNAT Supreme Care backend deployment

This deployment does not use Docker. The recommended production layout is Node.js behind Nginx, supervised by systemd, with PostgreSQL installed on the host or supplied as a managed service.

The app requires a running Redis instance (`REDIS_URL` in the env file) — it backs the BullMQ job queue that report/member imports run on. There are **two** processes to run, not one: the API server (`dist/server.js`, this document's main flow) and a separate worker (`dist/worker.js`) that actually consumes those queued jobs — `deploy/gnatsupreme-worker.service` is the systemd unit for it, installed the same way as the API's unit below. Skipping the worker means uploaded imports stay queued forever and never process. See the root `deployment.md` for the full setup including Redis provisioning, and for the PM2 path (recommended — see "Alternative process manager" below), which starts both processes from one `ecosystem.config.cjs`.

## 1. Prepare the application

Install the Node.js version declared by the project, then run:

```bash
npm ci
npm run build
npm run migrate:deploy
```

Copy `.env.production.example` to `/etc/gnatsupreme/backend.env`, restrict it to the service account, and replace every placeholder. Never commit that production file.

```bash
sudo install -d -o gnatsupreme -g gnatsupreme /var/lib/gnatsupreme/uploads
sudo install -d -o gnatsupreme -g gnatsupreme /var/log/gnatsupreme
sudo chmod 750 /etc/gnatsupreme/backend.env
```

## 2. Install the systemd service

Update paths in `deploy/gnatsupreme-backend.service` if the application is not installed in `/opt/gnatsupreme/backend`.

```bash
sudo cp deploy/gnatsupreme-backend.service deploy/gnatsupreme-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gnatsupreme-backend gnatsupreme-worker
sudo systemctl status gnatsupreme-backend gnatsupreme-worker
```

Structured JSON logs are written to stdout and captured by journald:

```bash
journalctl -u gnatsupreme-backend -f
```

They are also appended to the path configured by `LOG_FILE`. Install the supplied rotation policy so the file cannot grow indefinitely:

```bash
sudo cp deploy/logrotate.conf /etc/logrotate.d/gnatsupreme-backend
sudo logrotate --debug /etc/logrotate.d/gnatsupreme-backend
```

## 3. Configure Nginx and TLS

Replace `api.example.com` in `deploy/nginx.conf`, install it as an enabled Nginx site, test the configuration, and reload Nginx. Obtain a TLS certificate using the certificate-management process approved for the server. Redirect HTTP to HTTPS after TLS is active.

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Set `FRONTEND_ORIGIN` to the exact HTTPS frontend origin. Do not use `*` because the application uses credentialed cookies.

## 4. Deploy an update

Back up PostgreSQL and the upload directory, deploy the new source, then run:

```bash
npm ci
npm run build
npm run migrate:deploy
sudo systemctl restart gnatsupreme-backend gnatsupreme-worker
curl --fail https://api.example.com/api/health
```

Prisma migrations are forward-only. Test migrations against a restored copy of production data before applying significant schema changes.

## Alternative process manager

`ecosystem.config.cjs` is provided for hosts using PM2 — it defines both `gnatsupreme-backend` (API, cluster mode) and `gnatsupreme-worker` (the BullMQ queue consumer) as one file, so `pm2 start` launches both. This is the recommended path — see the root `deployment.md` for the full walkthrough, including the required `.env` symlink (PM2 doesn't read `/etc/gnatsupreme/backend.env` the way systemd's `EnvironmentFile=` does):

```bash
ln -s /etc/gnatsupreme/backend.env /opt/gnatsupreme/backend/.env
pm2 start ecosystem.config.cjs --env production
pm2 save
```

Use either systemd or PM2, not both.
