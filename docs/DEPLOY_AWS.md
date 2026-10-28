# Deploying BookLeaf Portal on an AWS EC2 VM

A complete, copy-pasteable walkthrough for running the portal on a single Ubuntu VM with
Docker Compose, then putting HTTPS, backups and basic hardening around it.

This is the "one VM, one command" deployment: the same images and `docker-compose.yml` used
locally. It is appropriate for a demo, an assignment review, or a small internal deployment.
For real production traffic, move Postgres to RDS and run more than one backend replica
(see [Scaling beyond one VM](#13-scaling-beyond-one-vm)).

---

## 0. What runs on the VM

```
Internet
   │  :80 / :443
   ▼
frontend container (nginx :80)      ← only published port(s)
   │  serves the built SPA
   │  proxies /api/*  (SSE-friendly: buffering off, 1h read timeout)
   ▼
backend container (uvicorn :8000)   ← bound to 127.0.0.1 only
   │  FastAPI + SQLAlchemy async
   ▼
db container (postgres :5432)       ← never published to the host
   └── named volume: bookleaf_pgdata  (data survives restarts)
```

The backend container entrypoint is:

```
alembic upgrade head && python -m app.seed && uvicorn app.main:app ...
```

so migrations run automatically and the demo data is created on first boot. The seed is
idempotent, but see [Step 10](#10-harden-the-instance) for why you may want to stop it
after the first successful start.

---

## 1. Launch the instance

In the AWS console → **EC2 → Launch instance**:

| Setting | Value |
| --- | --- |
| Name | `bookleaf-portal` |
| AMI | **Ubuntu Server 24.04 LTS (x86_64)** |
| Instance type | **t3.medium** (4 GB) recommended; `t3.small` (2 GB) works with swap — see below |
| Key pair | create/download a new `.pem` (e.g. `bookleaf.pem`) |
| Storage | 20–30 GB **gp3** |
| Security group | inbound `22` from **My IP**, `80` from `0.0.0.0/0`, `443` from `0.0.0.0/0` |

Do **not** open `8000` (API) or `5432` (Postgres). Nothing else is exposed.

Why the sizing matters: the frontend image runs `npm ci && npm run build` (Node 22 + Vite)
during the first build. On a 1 GB `t3.micro` that build can be killed by the OOM killer. 4 GB
is comfortable; 2 GB is fine once swap is enabled.

Then:

1. **Elastic IP** → *Allocate* → *Associate* with the instance. Without this, stopping and
   starting the VM changes the public address and your DNS/`CORS_ORIGINS` break.
2. Note the Elastic IP, e.g. `203.0.113.10`.

---

## 2. Connect and install the basics

```bash
# from your laptop
chmod 400 ~/Downloads/bookleaf.pem
ssh -i ~/Downloads/bookleaf.pem ubuntu@203.0.113.10
```

On the VM:

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl gnupg git unzip
```

### Add swap (needed on t3.small, harmless on t3.medium)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

---

## 3. Install Docker Engine + Compose plugin

Use Docker's official apt repository (the `docker.io` package from Ubuntu is older and lacks
the `docker compose` plugin).

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# run docker without sudo (log out/in or run: newgrp docker)
sudo usermod -aG docker $USER
newgrp docker

docker --version
docker compose version
```

---

## 4. Put the code on the VM

### Option A — clone from your Git host (preferred)

Push this repository to GitHub/GitLab/Bitbucket first, then:

```bash
git clone https://github.com/<you>/<repo>.git ~/bookleaf-portal
cd ~/bookleaf-portal
```

For a private repo use a deploy key or a short-lived token
(`https://<token>@github.com/<you>/<repo>.git`).

### Option B — copy the working tree from your machine

The repo in this workspace has no remote configured, so this is the usual path. Build a clean
archive of the last commit (excludes `.env`, `node_modules/`, `.venv/`, test artefacts):

```powershell
# Windows / PowerShell, from the parent of bookleaf-portal
git -C bookleaf-portal archive --format=tar.gz -o bookleaf-portal.tar.gz HEAD
scp -i $HOME\.ssh\bookleaf.pem bookleaf-portal.tar.gz ubuntu@203.0.113.10:~/
```

```bash
# on the VM
mkdir -p ~/bookleaf-portal
tar -xzf ~/bookleaf-portal.tar.gz -C ~/bookleaf-portal
rm ~/bookleaf-portal.tar.gz
cd ~/bookleaf-portal
ls    # backend  docker-compose.yml  docs  frontend  README.md  WRITEUP.md
```

> If you copy the folder with `scp -r` / `rsync` instead, exclude `node_modules`, `.venv`,
> `.git`, `__pycache__` and `.env` so the image build stays fast.

---

## 5. Create the Compose `.env`

Docker Compose reads `.env` next to `docker-compose.yml` and uses it for `${...}`
interpolation. Only the variables wired into `docker-compose.yml` reach the containers —
this file is not mounted into them.

```bash
cd ~/bookleaf-portal

# generate a strong secret
openssl rand -base64 48

cat > .env <<'EOF'
# --- runtime ---------------------------------------------------------------
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO

# --- secrets (paste the values you generated) ------------------------------
JWT_SECRET=PASTE_OPENSSL_OUTPUT_HERE
SEED_DEFAULT_PASSWORD=PASTE_A_STRONG_DEMO_PASSWORD
ADMIN_EMAIL=admin@bookleaf.com
ADMIN_PASSWORD=PASTE_A_STRONG_ADMIN_PASSWORD
ADMIN_NAME=Aarav Mehta

# --- browser origin (Elastic IP now, domain after Step 9) ------------------
CORS_ORIGINS=http://203.0.113.10

# --- AI provider: mock (no key) | google | openai | anthropic --------------
AI_PROVIDER=mock
AI_API_KEY=
AI_MODEL=

# --- published ports -------------------------------------------------------
# SPA on port 80; API bound to loopback only (reachable via nginx proxy).
FRONTEND_PORT=80
BACKEND_PORT=127.0.0.1:8000
EOF

chmod 600 .env
```

Notes:

- `SEED_DEFAULT_PASSWORD` / `ADMIN_PASSWORD` are applied **when a user is first created**.
  Changing them later does not rotate existing passwords. Set them before the first boot (or
  reseed with `--reset`, which deletes all portal data).
- To use Gemini instead of the rule engine:
  `AI_PROVIDER=google`, `AI_API_KEY=AIza...`, leave `AI_MODEL` empty to get
  `gemini-3.8-flash`, or set `gemini-3.6-flash` / `gemini-3.5-flash-lite` /
  `gemini-3.1-pro-preview`. The AI key lives in this file, so keep the `600` permissions and
  treat the VM as holding a secret.
- `BACKEND_PORT=127.0.0.1:8000` makes the port mapping `127.0.0.1:8000:8000`, so the API is
  not reachable from the internet even if the security group were wrong.

---

## 6. Build and start

```bash
cd ~/bookleaf-portal
docker compose up -d --build
```

First build takes roughly 3–8 minutes depending on instance size. Watch the boot sequence:

```bash
docker compose ps
docker compose logs -f backend     # alembic upgrade head → seed → uvicorn started
```

Expected tail:

```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

`docker compose ps` should show `db` **healthy**, `backend` **healthy** (it has a
`/api/health` healthcheck), and `frontend` **running**.

Both services are `restart: unless-stopped`, so they come back automatically after a reboot
or a Docker daemon restart.

---

## 7. Verify

```bash
# same-origin API through the frontend nginx proxy
curl -s http://127.0.0.1/api/health

# log in with the admin account you configured
curl -s -X POST http://127.0.0.1/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bookleaf.com","password":"YOUR_ADMIN_PASSWORD"}'
```

Then from your browser:

- **Portal:** `http://203.0.113.10/`
- **Login:** `admin@bookleaf.com` + your `ADMIN_PASSWORD`

The interactive API docs (`/docs`) are intentionally **not** proxied. Reach them through an
SSH tunnel when needed:

```bash
# from your laptop
ssh -i ~/Downloads/bookleaf.pem -N -L 8000:127.0.0.1:8000 ubuntu@203.0.113.10
# then open http://localhost:8000/docs
```

---

## 8. Optional but recommended: HTTPS with a domain

You need a domain (or subdomain) with an **A record pointing at the Elastic IP**, e.g.
`portal.example.com`. TLS is terminated by nginx on the host, in front of the container.

### 8.1 Move the container off port 80

```bash
cd ~/bookleaf-portal
sed -i 's|^FRONTEND_PORT=.*|FRONTEND_PORT=127.0.0.1:8080|' .env
sed -i 's|^CORS_ORIGINS=.*|CORS_ORIGINS=https://portal.example.com|' .env
docker compose up -d
```

### 8.2 Install nginx + certbot

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo rm -f /etc/nginx/sites-enabled/default
```

### 8.3 Add the reverse-proxy site

```bash
sudo tee /etc/nginx/sites-available/bookleaf > /dev/null <<'EOF'
server {
    listen 80;
    server_name portal.example.com;

    # SPA + static assets
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API + Server-Sent Events: never buffer
    location /api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/bookleaf /etc/nginx/sites-enabled/bookleaf
sudo nginx -t && sudo systemctl reload nginx
```

### 8.4 Issue the certificate

```bash
sudo certbot --nginx -d portal.example.com
```

Certbot rewrites the config for `listen 443 ssl`, adds the redirect from `:80`, and installs a
renewal timer (`systemctl list-timers | grep certbot`). Test renewal once:

```bash
sudo certbot renew --dry-run
```

Then confirm the browser shows `https://portal.example.com` and that
`curl -N https://portal.example.com/api/stream` stays open instead of hanging after one chunk
(that would mean an outer proxy is buffering).

---

## 9. Backups

The database is a Docker volume (`bookleaf_pgdata`), not a file you can copy comfortably. Use
`pg_dump`:

```bash
mkdir -p ~/backups
cd ~/bookleaf-portal
docker compose exec -T db pg_dump -U bookleaf bookleaf \
  | gzip > ~/backups/bookleaf-$(date +%F-%H%M).sql.gz
```

Nightly cron (note the escaped `\%` — required in crontab):

```bash
crontab -e
```

```cron
0 2 * * * cd /home/ubuntu/bookleaf-portal && docker compose exec -T db pg_dump -U bookleaf bookleaf | gzip > /home/ubuntu/backups/bookleaf-$(date +\%F).sql.gz
```

Restore:

```bash
gunzip -c ~/backups/bookleaf-2026-10-28.sql.gz \
  | docker compose exec -T db psql -U bookleaf -d bookleaf
```

Also enable **EBS snapshots** on the instance volume (AWS Console → EC2 → Volumes → Data
lifecycle manager). Snapshots cover the whole VM, including the volume and `.env`.

---

## 10. Harden the instance

### 10.1 Rotate secrets before the first boot

Already covered in Step 5, but worth stating explicitly:

- `JWT_SECRET` must not be the development default.
- Demo accounts all share `SEED_DEFAULT_PASSWORD`; make it strong, or remove the demo data
  after your review with `docker compose run --rm backend python -m app.seed --reset` only if
  you intend to reset.
- `ENVIRONMENT=production`, `DEBUG=false`, `AUTO_CREATE_TABLES=false` (already set in Compose).

### 10.2 Stop re-seeding demo accounts on every restart

`docker-compose.yml` runs `python -m app.seed` on every container start. It is idempotent, but
it also recreates any missing demo users/tickets. After the first successful boot, drop the
seed step:

```bash
cat > ~/bookleaf-portal/docker-compose.override.yml <<'EOF'
services:
  backend:
    command: >
      sh -c "alembic upgrade head &&
             uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"
EOF

cd ~/bookleaf-portal && docker compose up -d
```

`docker-compose.override.yml` is merged automatically. The demo data already in Postgres stays;
only the re-seeding stops.

### 10.3 Replace the default database password

`docker-compose.yml` ships `bookleaf` / `bookleaf`. Override both services *before the database
volume is initialised* (Postgres only applies `POSTGRES_PASSWORD` when it creates the cluster):

```bash
echo 'POSTGRES_PASSWORD=PASTE_A_STRONG_DB_PASSWORD' >> ~/bookleaf-portal/.env
```

```yaml
# ~/bookleaf-portal/docker-compose.override.yml (add to the file from 10.2)
services:
  db:
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  backend:
    environment:
      DATABASE_URL: postgresql+asyncpg://bookleaf:${POSTGRES_PASSWORD}@db:5432/bookleaf
```

Avoid `@ : / ?` in the password, or URL-encode them in `DATABASE_URL`. If the volume already
exists, resetting requires `docker compose down -v` — **this deletes the database**.

### 10.4 Network and OS

- Security group: `22` only from your IP; `80`/`443` from the world; nothing else.
- Consider AWS Systems Manager Session Manager instead of public SSH.
- Keep the OS patched: `sudo apt-get install -y unattended-upgrades`.
- Terminate the instance when you are done reviewing; the Elastic IP stays allocated (small
  hourly charge while unattached) and the EBS volume keeps your data.

---

## 11. Updating the deployment

```bash
cd ~/bookleaf-portal
git pull                      # or re-upload a new tarball and extract over the folder
docker compose up -d --build  # migrations run automatically on start
docker compose ps
```

Keep `.env` and `docker-compose.override.yml` out of the archive/`git pull` path (they live on
the VM only). Clean old images now and then:

```bash
docker image prune -f
docker builder prune -f
```

Never run `docker system prune -a --volumes` here — it would delete the Postgres volume.

---

## 12. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Bind for 0.0.0.0:80 failed: port is already allocated` | Host nginx is already on `:80`. Set `FRONTEND_PORT=127.0.0.1:8080` and proxy to it. |
| Browser shows `502 Bad Gateway` from host nginx | Container is down or still starting: `docker compose ps`, `docker compose logs backend`. |
| Frontend loads but every API call fails | Check `curl http://127.0.0.1/api/health`. If that fails, the backend container is unhealthy — read its logs. |
| `Alter of extension ... cannot be executed` / migration error | Usually a partially initialised volume. Inspect `docker compose logs backend` before touching the volume. |
| Build killed (`signal: killed`, exit 137) | Out of memory: add swap, use `t3.medium`, or build the images in CI and pull them. |
| SSE updates arrive late / only after refresh | A proxy is buffering `/api/stream`. Disable `proxy_buffering` at **every** hop (host nginx and the container's nginx already do). |
| `401` after changing passwords in `.env` | Passwords are only written when a user is created. Reseed (`--reset`, destructive) or create a new admin. |
| `No space left on device` | `docker system df`, then `docker image prune -f` / `docker builder prune -f`. Do not prune volumes. |
| Instance rebooted and the site is back but data is missing | The `db` volume should have survived; check `docker volume ls | grep bookleaf_pgdata`. Data loss implies the volume was recreated (`down -v`). |
| `docker compose` says `no configuration file provided` | You are not in `~/bookleaf-portal` (the folder containing `docker-compose.yml`). |

---

## 13. Scaling beyond one VM

The single-VM layout is a demo/review topology. For real traffic:

1. **Postgres → RDS** (`db.t4g.micro` is plenty to start). Set `DATABASE_URL` on the backend to
   the RDS endpoint, keep `alembic upgrade head` as a release step, enable automated backups.
2. **Two services, not one compose stack** — deploy `backend/Dockerfile` to ECS/Fargate (or a
   second EC2) and serve `frontend/Dockerfile` from S3 + CloudFront, or keep nginx.
3. **TLS at the edge** — ALB + ACM certificate in front of the backend target group; forward
   `X-Forwarded-*`; set the target group's idle timeout above your SSE heartbeat (15 s default)
   and disable response buffering.
4. **Multiple backend replicas** — the SSE broker is in-process today. Before scaling out,
   move `EventBroker` to Redis pub/sub (see `docs/ARCHITECTURE.md` §16) and make sure sticky
   sessions are not required for `/api/stream`.
5. **Secrets** — move `JWT_SECRET`, `ADMIN_PASSWORD`, `AI_API_KEY` and the DB password to SSM
   Parameter Store / Secrets Manager and inject them as task secrets instead of `.env`.
6. **Observability** — ship container logs to CloudWatch; the app already exposes
   `/api/health` and admin-only `/api/admin/ai/health` (token/latency counters).

---

## 14. Cost sketch

Approximate on-demand pricing in `us-east-1` (verify with the AWS calculator for your region):

| Item | Spec | Rough monthly cost |
| --- | --- | --- |
| EC2 `t3.small` | 2 vCPU burst, 2 GB | ~US$15 |
| EC2 `t3.medium` | 2 vCPU burst, 4 GB | ~US$30 |
| EBS gp3 | 30 GB | ~US$2.50 |
| Elastic IP | attached to a running instance | free |
| Data transfer | light demo traffic | usually < US$2 |

A `t3.small` + 2 GB swap is the cheapest configuration that builds this project reliably.
Stop the instance when you are not using it to cut compute cost; the EBS volume and Elastic IP
allocation remain.
