FROM debian:bookworm-slim
RUN <<EOF
apt-get update
apt-get install -y --no-install-recommends curl ca-certificates
rm -rf /var/lib/apt/lists/*
EOF
RUN <<'CONF'
cat > /etc/app.conf << 'EOC'
debug=false
EOC
CONF
WORKDIR /srv
COPY . .
CMD ["curl","--version"]
