#!/bin/bash
# Installs and configures coturn as the TURN relay for the GameWork demos.
# Runs on every boot (GCE re-runs the startup script), so it must be idempotent.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y coturn

metadata() {
  curl -sf -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/$1"
}

ACCESS_TOKEN=$(metadata "instance/service-accounts/default/token" \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

TURN_SECRET=$(curl -sf -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://secretmanager.googleapis.com/v1/projects/${project_id}/secrets/${secret_name}/versions/latest:access" \
  | python3 -c "import sys, json, base64; print(base64.b64decode(json.load(sys.stdin)['payload']['data']).decode())")

PRIVATE_IP=$(metadata "instance/network-interfaces/0/ip")

# The file holds the shared secret, so it must not be world-readable — but
# coturn drops to the unprivileged `turnserver` user and still has to read it.
# At 0600 it cannot, and coturn does not fail: it silently falls back to its
# built-in defaults, which enforce NO AUTHENTICATION and leave an open relay
# that anyone on the internet can bounce traffic through. 0640 root:turnserver
# is the only combination that is both private and readable by the daemon.
touch /etc/turnserver.conf
chown root:turnserver /etc/turnserver.conf
chmod 640 /etc/turnserver.conf
cat > /etc/turnserver.conf <<EOF
listening-port=3478
fingerprint

# Credentials are an HMAC of an expiry timestamp against this secret, minted by
# the signaling server. Nothing long-lived is ever handed to a browser.
use-auth-secret
static-auth-secret=$TURN_SECRET
realm=${realm}

# GCE gives the VM only its private address and 1:1 NATs the public one. Without
# this mapping coturn would advertise the private IP as its relay candidate and
# every relayed connection would fail.
external-ip=${public_ip}/$PRIVATE_IP

min-port=49152
max-port=65535

no-cli
no-tls
no-dtls

# The demos relay data channels between browsers only, so deny the relay any
# route back into private space (including this VPC and the metadata server).
no-multicast-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
EOF

sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
systemctl enable coturn

# Fail closed. coturn treats an unreadable config as "no config" and starts
# anyway with authentication disabled, so a permissions mistake here is an open
# relay rather than an outage — refuse to run it rather than serve one.
if ! runuser -u turnserver -- test -r /etc/turnserver.conf; then
  echo "FATAL: turnserver cannot read /etc/turnserver.conf; it would run unauthenticated" >&2
  systemctl stop coturn || true
  exit 1
fi

systemctl restart coturn
