#!/bin/bash
set -e

echo "=========================================="
echo "  K-RECA POS - Droplet Setup"
echo "=========================================="

# --- Config (CHANGE THESE) ---
DOMAIN="tudominio.com"
DB_NAME="kareca_db"
DB_USER="kareca_user"
DB_PASSWORD="$(openssl rand -base64 32)"
JWT_SECRET="$(openssl rand -base64 64)"
APP_DIR="/var/www/kareca"

echo ""
echo "1/8 - System update"
sudo apt update && sudo apt upgrade -y

echo ""
echo "2/8 - Install Node.js 20 LTS"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v

echo ""
echo "3/8 - Install PostgreSQL"
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql

echo ""
echo "4/8 - Configure PostgreSQL"
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo ""
echo "5/8 - Install PM2 and Nginx"
sudo npm install -g pm2
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx

echo ""
echo "6/8 - Configure Firewall"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

echo ""
echo "7/8 - Setup application"
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR
sudo mkdir -p /var/log/kareca
sudo chown -R $USER:$USER /var/log/kareca

echo ""
echo "8/8 - Create .env file"
cat > $APP_DIR/.env <<EOF
DB_USER=$DB_USER
DB_HOST=localhost
DB_NAME=$DB_NAME
DB_PASSWORD=$DB_PASSWORD
DB_PORT=5432
JWT_SECRET=$JWT_SECRET
PORT=3000
NODE_ENV=production
EOF

echo ""
echo "=========================================="
echo "  Setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Copy your code to $APP_DIR"
echo "     rsync -avz --exclude=node_modules ./Kareca/ user@IP:$APP_DIR/"
echo ""
echo "  2. Install dependencies and start"
echo "     cd $APP_DIR && npm install --production"
echo "     pm2 start ecosystem.config.js --env production"
echo "     pm2 save && pm2 startup"
echo ""
echo "  3. Configure Nginx"
echo "     sudo cp deploy/nginx-kareca.conf /etc/nginx/sites-available/kareca"
echo "     sudo ln -s /etc/nginx/sites-available/kareca /etc/nginx/sites-enabled/"
echo "     sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "  4. Setup SSL with Certbot"
echo "     sudo apt install -y certbot python3-certbot-nginx"
echo "     sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
echo "  5. Point your domain to this droplet's IP"
echo ""
echo "  DB_PASSWORD: $DB_PASSWORD"
echo "  JWT_SECRET: $JWT_SECRET"
echo "=========================================="
