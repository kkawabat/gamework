# --- TURN relay -------------------------------------------------------------
# Players on cellular sit behind carrier-grade NAT, which maps a different port
# per destination. STUN-discovered addresses are useless to the other peer, so
# without a relay two cellular players cannot connect at all.
#
# This cannot live on Cloud Run: TURN needs UDP and a wide relay port range, and
# must stay reachable at a fixed address — hence a plain always-on VM.
#
# e2-micro in us-west1/us-central1/us-east1 is in GCP's Always Free tier, which
# var.region already defaults to. Changing the region forfeits that.

resource "google_compute_address" "turn" {
  name   = "gamework-turn"
  region = var.region
}

resource "random_password" "turn_secret" {
  length  = 48
  special = false # goes through an HMAC and a shell heredoc; keep it alnum
}

resource "google_secret_manager_secret" "turn_secret" {
  secret_id = "gamework-turn-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "turn_secret" {
  secret      = google_secret_manager_secret.turn_secret.id
  secret_data = random_password.turn_secret.result
}

# --- Relay VM ---------------------------------------------------------------

resource "google_service_account" "turn_vm" {
  account_id   = "gamework-turn-vm"
  display_name = "GameWork coturn relay VM"
}

resource "google_secret_manager_secret_iam_member" "turn_vm_access" {
  secret_id = google_secret_manager_secret.turn_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.turn_vm.email}"
}

# The signaling server mints credentials from the same secret.
resource "google_secret_manager_secret_iam_member" "turn_signaling_access" {
  secret_id = google_secret_manager_secret.turn_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.signaling_run.email}"
}

resource "google_compute_firewall" "turn" {
  name    = "gamework-turn"
  network = "default"

  # TURN control channel.
  allow {
    protocol = "udp"
    ports    = ["3478"]
  }

  # TCP fallback for networks that block UDP outright.
  allow {
    protocol = "tcp"
    ports    = ["3478"]
  }

  # coturn hands each relayed session a port out of this range.
  allow {
    protocol = "udp"
    ports    = ["49152-65535"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["gamework-turn"]
}

resource "google_compute_instance" "turn" {
  name         = "gamework-turn"
  machine_type = "e2-micro" # Always Free tier; do not resize without checking cost
  zone         = "${var.region}-a"
  tags         = ["gamework-turn"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 10
      type  = "pd-standard" # free tier covers standard PD only
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.turn.address
    }
  }

  service_account {
    email  = google_service_account.turn_vm.email
    scopes = ["cloud-platform"]
  }

  metadata_startup_script = templatefile("${path.module}/coturn-startup.sh", {
    project_id  = var.project_id
    secret_name = google_secret_manager_secret.turn_secret.secret_id
    public_ip   = google_compute_address.turn.address
    realm       = "gamework.kankawabata.com"
  })

  allow_stopping_for_update = true

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_version.turn_secret,
    google_secret_manager_secret_iam_member.turn_vm_access,
  ]
}
