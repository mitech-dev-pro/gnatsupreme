# GNAT Supreme Care backend deployment

This deployment does not use Docker. The recommended production layout is Node.js behind Nginx, supervised by systemd, with PostgreSQL installed on the host or supplied as a managed service.

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

A real SMS provider adapter is mandatory in production. The application refuses to start with `SMS_PROVIDER=CONSOLE`.

## 2. Install the systemd service

Update paths in `deploy/gnatsupreme-backend.service` if the application is not installed in `/opt/gnatsupreme/backend`.

```bash
sudo cp deploy/gnatsupreme-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gnatsupreme-backend
sudo systemctl status gnatsupreme-backend
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
sudo systemctl restart gnatsupreme-backend
curl --fail https://api.example.com/api/health
```

Prisma migrations are forward-only. Test migrations against a restored copy of production data before applying significant schema changes.

## Alternative process manager

`ecosystem.config.cjs` is provided for hosts using PM2. Load the production environment before starting it:

```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
```

Use either systemd or PM2, not both.
