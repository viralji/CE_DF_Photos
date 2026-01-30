# Deploy to Digital Ocean

This guide gets the CE DF Photos app running on a Digital Ocean Droplet with minimal disruption.

## Prerequisites

- A Digital Ocean Droplet (Ubuntu 22.04 LTS recommended)
- Node.js 20+ on the server
- Domain (optional; can use droplet IP)

## 1. Server setup (one-time)

```bash
# SSH into your droplet
ssh root@your-droplet-ip

# Create app user (recommended)
adduser ceapp
usermod -aG sudo ceapp
su - ceapp

# Install Node.js 20 (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally (process manager)
sudo npm install -g pm2
```

## 2. Deploy the app

```bash
# Clone your repo (replace with your git URL)
git clone https://github.com/viralji/CE_DF_Photos.git
cd CE_DF_Photos

# Install dependencies and build
npm ci
npm run build

# Create .env on the server (never commit this)
nano .env
```

Add to `.env` (fill in your values):

```env
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=https://your-domain.com
ALLOWED_DOMAIN=cloudextel.com

DATABASE_PATH=/home/ceapp/CE_DF_Photos/data/ce_df_photos.db

AZURE_AD_CLIENT_ID=
AZURE_AD_CLIENT_SECRET=
AZURE_AD_TENANT_ID=

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=
AWS_S3_PHOTOS_PREFIX=df-photos
```

## 3. Database and data directory

```bash
mkdir -p data
npm run db:setup
npm run seed:checkpoints
```

## 4. Run with PM2 (no disruption on restart)

```bash
# Start the app
pm2 start npm --name "ce-df-photos" -- start

# Save PM2 process list so it survives reboot
pm2 save
pm2 startup
```

## 5. Nginx reverse proxy (optional, for HTTPS)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/ce-df-photos
```

Add:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ce-df-photos /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

Set `NEXTAUTH_URL=https://your-domain.com` in `.env` and restart:

```bash
pm2 restart ce-df-photos
```

## 6. Updates (zero-downtime style)

```bash
cd CE_DF_Photos
git pull
npm ci
npm run build
pm2 restart ce-df-photos
```

## 7. Verify deployment (run after deploy)

**On the server (SSH):**

```bash
# PM2 and app
pm2 status
pm2 logs ce-df-photos --lines 20
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/
# Expect: 200 or 307
```

**From your machine (browser + optional scripts):**

1. **Quick health check** (no auth):
   ```bash
   ./scripts/verify-server.sh https://your-domain.com
   ```
2. Open **https://your-domain.com** (or **http://your-droplet-ip:3001**) in a browser and sign in (Azure AD or dev-bypass if configured).
3. Manually check: **Dashboard** → **Capture** → **Gallery** (select route/subsection, thumbnails load) → **Review** (click red pending number, photos load) → **Map** (select route, markers and line show) → open a photo (**View full**), image and burned geo show.
4. Optional full API test (server must allow dev-bypass cookie or use real session):
   ```bash
   node scripts/test-api-full.mjs https://your-domain.com
   ```

## Health check

- App: `http://your-droplet-ip:3001` or `https://your-domain.com`
- PM2: `pm2 status` and `pm2 logs ce-df-photos`

## Troubleshooting

- **DB errors:** Ensure `data/` exists and is writable; run `npm run db:setup` again.
- **Auth redirect:** `NEXTAUTH_URL` must match the URL users use (http vs https, domain vs IP).
- **S3/Azure:** Verify env vars; no trailing spaces in `.env`.
