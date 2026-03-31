# JARVIS Personal Health OS — Deployment Guide

## Option A: EC2 + rockellstech.com (Recommended AWS Path)

This is the **best AWS option** for this app. AWS Amplify is for static/serverless apps
and won't persist the SQLite database — EC2 gives you a full Linux server with persistent disk.

### 1. Launch EC2 Instance

1. Go to **AWS Console → EC2 → Launch Instance**
2. Choose: **Ubuntu 24.04 LTS** (64-bit x86)
3. Instance type: **t3.micro** (~$8/month) or **t2.micro** (free tier for 1 year)
4. Storage: **20 GB** gp3 SSD (for SQLite + logs)
5. Security Group — open these ports:
   - **22** (SSH) — your IP only
   - **80** (HTTP) — Anywhere
   - **443** (HTTPS) — Anywhere
6. Create or select a key pair, download the `.pem` file
7. Launch → note the **Public IPv4 address**

### 2. Assign an Elastic IP (so IP never changes)

```
EC2 → Elastic IPs → Allocate → Associate with your instance
```

### 3. Point rockellstech.com to your server

In your domain registrar (e.g. Namecheap, GoDaddy, Route 53):
- Add an **A record**: `@` → your Elastic IP
- Add a **CNAME**: `www` → `rockellstech.com`

> DNS propagation takes up to 24h but usually under 1h.

### 4. SSH into your server

```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@YOUR_ELASTIC_IP
```

### 5. Install Docker

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker ubuntu
newgrp docker
```

### 6. Clone and configure

```bash
git clone https://github.com/YOUR_GITHUB/rockshealth.git
cd rockshealth

# Copy your .env
cp .env.example .env
nano .env
# Set: OPENAI_API_KEY=sk-proj-...
# Set: DB_PATH=/data/health.db
# Set: NODE_ENV=production
```

### 7. Start the app

```bash
docker compose up -d
docker compose logs -f   # watch logs
```

App is now running on port 3000.

### 8. Set up Nginx reverse proxy + SSL

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Nginx config
sudo nano /etc/nginx/sites-available/jarvis
```

Paste this config:

```nginx
server {
    server_name rockellstech.com www.rockellstech.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/jarvis /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate (free via Let's Encrypt)
sudo certbot --nginx -d rockellstech.com -d www.rockellstech.com
```

Done — JARVIS is live at **https://rockellstech.com** 🚀

### 9. Auto-start on reboot

Docker Compose already handles this via `restart: unless-stopped`.

To verify:
```bash
sudo systemctl enable docker
docker compose ps
```

### 10. Update the app

```bash
cd ~/rockshealth
git pull
docker compose build --no-cache
docker compose up -d
```

---

## Option B: Railway.app (Easiest — no servers to manage)

Railway automatically deploys from GitHub and supports persistent volumes for SQLite.

1. Push code to GitHub (make sure `.env` is in `.gitignore`)
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo
4. Add environment variables in Railway dashboard:
   - `OPENAI_API_KEY` = your key
   - `DB_PATH` = `/data/health.db`
   - `NODE_ENV` = `production`
5. Add a **Volume**: mount path `/data` (this persists SQLite)
6. Add your custom domain `rockellstech.com` in Railway settings → Domains
7. Point your domain's DNS to Railway's CNAME

Cost: ~$5/month for hobby plan.

---

## Keeping your data backed up

SQLite database lives at `/data/health.db` inside the Docker volume. Back it up regularly:

```bash
# On EC2 — backup to S3
aws s3 cp /var/lib/docker/volumes/rockshealth_jarvis_data/_data/health.db \
  s3://your-bucket/health-backup-$(date +%Y%m%d).db

# Or just download locally
docker cp jarvis-health-os:/data/health.db ./health-backup.db
```

---

## Health Auto Export webhook URL

Once deployed, update your **Health Auto Export** app automation URL from:
```
http://YOUR_LOCAL_IP:3000/api/health
```
to:
```
https://rockellstech.com/api/health
```

This means your Apple Watch data streams to the cloud 24/7.

---

## Why not AWS Amplify?

AWS Amplify runs Node.js backends as **Lambda functions** (serverless). Lambda has no
persistent filesystem — the SQLite database would be wiped after every request.
EC2 gives you a persistent Linux VM where SQLite lives on a real disk. Same AWS,
better fit for this app.
