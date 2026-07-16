resource "google_cloud_run_v2_service" "signaling" {
  name                = "gamework-signaling"
  location            = var.region
  deletion_protection = false

  # Service-level scaling — a different block from the template.scaling below,
  # despite the name. Cloud Run reports it populated whether or not it is
  # declared, and the provider treats these fields as optional-not-computed, so
  # omitting it leaves a phantom removal pending on every plan. Declared here so
  # `plan` comes back clean and a real change actually stands out.
  scaling {
    min_instance_count    = 0
    manual_instance_count = 0
  }

  template {
    service_account = google_service_account.signaling_run.email

    containers {
      # Placeholder for initial creation — CI/CD will deploy the real image
      image = "us-docker.pkg.dev/cloudrun/container/hello:latest"

      ports {
        container_port = 8080
      }

      # The server mints short-lived TURN credentials from this secret with a
      # local HMAC — no call out to the relay or any third party.
      env {
        name  = "TURN_HOST"
        value = google_compute_address.turn.address
      }

      env {
        name = "TURN_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.turn_secret.secret_id
            version = "latest"
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        startup_cpu_boost = true
      }

      startup_probe {
        http_get {
          path = "/health"
        }
        initial_delay_seconds = 0
        period_seconds        = 10
        failure_threshold     = 30
        timeout_seconds       = 5
      }
    }

    scaling {
      # Room state lives in the server's memory, so a second instance would
      # split rooms across instances; max 1 keeps signaling consistent.
      min_instance_count = 0
      max_instance_count = 1
    }

    # Cloud Run's maximum, and a backstop only: clients close their own socket
    # once the game starts (WebRTCNetworkEngine.closeSignaling), so a connection
    # should only live as long as a lobby. Nothing reconnects if this fires —
    # the game itself is unaffected, but the room stops accepting players.
    timeout = "3600s"
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.signaling.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
