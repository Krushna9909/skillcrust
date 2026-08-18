# Deployment Guide — Hostinger VPS

Checkpoint 13's deploy-prep notes, per spec1.md's tech stack section
("Hosting: Hostinger VPS," "All traffic over HTTPS (Let's Encrypt/Certbot
on the VPS)"). This is a **guide, not a script** — no deploy automation
was built (out of this checkpoint's "wire loose ends, not new features"
scope); it documents the steps a human runs by hand the first time, and
what a process manager keeps running afterward.

Assumes: a fresh Ubuntu VPS from Hostinger, a domain name already pointed
at the VPS's IP address (an A record — do this before starting, DNS
propagation can take a while), and root or sudo access over SSH.

---

## 1. System prerequisites

```bash
# Node.js 20 LTS (this project was built/tested against Node 22, but 20
# LTS is a safe, well-supported floor — anything 18+ works, since the
# codebase relies on Node 18+'s built-in fetch/test runner)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL (16 was used throughout local development; any recent major
# works — node-pg-migrate and the raw SQL in this project don't rely on
# anything version-specific)
sudo apt-get install -y postgresql postgresql-contrib

# nginx (reverse proxy — see section 3) and Certbot (HTTPS — section 4)
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

## 2. Database setup

```bash
sudo -u postgres psql -c "CREATE USER coursemint WITH PASSWORD 'CHOOSE_A_REAL_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE coursemint_production OWNER coursemint;"
```

Postgres listens on `localhost` only by default — leave it that way. The
app connects to it via `DATABASE_URL` on the same machine; there's no
reason for Postgres's port to ever be reachable from outside the VPS.

## 3. Application setup

```bash
# Clone/copy the project onto the VPS, then:
cd affiliate-course-platform
npm install --production
cp .env.example .env
nano .env   # fill in every REQUIRED var — see .env.example's own
            # "QUICK REFERENCE" comment block at the top for the list,
            # and generate real secrets with the commands that file
            # documents next to each one (never reuse the placeholders)
npm run migrate:up
npm run seed   # idempotent — safe even if run more than once; prints the
               # two admin accounts' placeholder credentials, which you
               # should log in and change immediately after (see section 6)
```

Set `NODE_ENV=production` in `.env` before continuing — this isn't
optional, several safety behaviors are gated on it directly:
- `app.set('trust proxy', ...)` only trusts the reverse-proxy hop in
  production (see `src/app.js`) — required for rate limiting and fraud
  detection to see the real client IP once nginx is in front of the app.
- The mock payment/payout gateways' `simulate` override (dev/test-only)
  is silently ignored outside production — see
  `src/services/payment/mockGateway.js`.
- `src/utils/mailer.js` throws instead of silently swallowing an email
  send if no real provider is configured (see section 7 — this is a
  real gap to close before relying on the forgot-password flow).

## 4. Process management (keep the app running)

Any Node process manager works; `pm2` is a common, simple choice:

```bash
sudo npm install -g pm2
pm2 start src/server.js --name coursemint-api
pm2 save
pm2 startup   # prints a command to run so pm2 restarts the app on reboot — run it
```

`src/server.js` already handles `SIGTERM`/`SIGINT` gracefully (closes the
HTTP server and the DB pool cleanly before exiting) — `pm2 restart`/`pm2
stop` will work correctly with this out of the box.

## 5. nginx reverse proxy + Certbot (HTTPS)

The app listens on `PORT` (`.env`, default `4000`) on `localhost` only —
nginx is what the public internet actually talks to, terminating TLS and
forwarding plain HTTP to the app over `localhost`. This is also exactly
the "exactly one reverse-proxy hop" `app.set('trust proxy', 1)` assumes
in production (see `src/app.js`'s comment) — don't put a second proxy/CDN
in front of nginx without revisiting that setting, or `req.ip` (used by
both rate limiting and fraud detection) will see the wrong address.

Create `/etc/nginx/sites-available/coursemint`:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/coursemint /etc/nginx/sites-enabled/
sudo nginx -t   # check the config before reloading
sudo systemctl reload nginx
```

Now get a real certificate — Certbot's nginx plugin edits the config
above automatically to add the `listen 443 ssl` block and redirect
`:80` to `:443`:

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Certbot's systemd timer (installed automatically on Ubuntu) handles
renewal — confirm it's active:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run   # verify renewal actually works, without waiting for it to matter
```

## 6. Firewall

Only 80/443 (and SSH) need to be reachable from outside the VPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # opens 80 + 443
sudo ufw enable
```

The app's own `PORT` (4000) and Postgres's port should NOT be in this
list — they're only ever reached via `localhost`, from nginx and the app
itself respectively.

## 7. First-login checklist (do this immediately after `npm run seed`)

- [ ] Log into both seeded admin accounts (`admin1@...`/`admin2@...`,
      `ChangeMe123!` — see the seed script's own console output) and
      change their passwords. There's no in-app "change admin password"
      flow yet (not built in any checkpoint so far) — this needs a
      direct database update for now:
      `UPDATE admins SET password_hash = '<new bcrypt hash>' WHERE email = '...'`
      (generate the hash with
      `node -e "require('./src/utils/password').hashPassword('newpass').then(console.log)"`).
      This is a real gap worth a small follow-up checkpoint if an admin
      "change my password" endpoint matters before launch.
- [ ] Complete each admin's TOTP setup by logging in through
      `/admin-login.html` (or `POST /admin/login`) for the first time —
      this is what generates and displays each admin's real QR code.
- [ ] Confirm a real transactional email provider is configured before
      relying on the forgot-password flow — see the "Standing open
      items" list in `checkpoint.md`; `src/utils/mailer.js` currently
      throws in production rather than silently failing, so this will be
      loudly obvious rather than a silent gap, but it does mean forgot-
      password is non-functional until a provider is wired in.
- [ ] Confirm a real CAPTCHA provider is configured (same file, same
      "throws rather than silently no-ops" safety net) if CAPTCHA
      protection is wanted before launch — currently OFF by default.
- [ ] Read `checkpoint.md`'s "Standing open items" section — the refund
      policy and OTP/email-verification gap both need an explicit
      decision before real transactions go live (see
      `docs/PRE_LAUNCH_DECISIONS.md`, also new this checkpoint).

## 8. Ongoing operations

- **Logs**: `pm2 logs coursemint-api`. Morgan logs method/URL/status
  only (never request bodies — see `README.md`'s "Logging & sensitive
  data" section, binding since Checkpoint 4).
- **Backups**: not built or documented by any checkpoint so far — set up
  regular `pg_dump` backups of the production database before real
  transactions go live. This is a genuine gap, flagged here rather than
  quietly assumed handled.
- **Updating the app**: `git pull`, `npm install --production`,
  `npm run migrate:up` (safe to run repeatedly — already-applied
  migrations are skipped), `pm2 restart coursemint-api`.
