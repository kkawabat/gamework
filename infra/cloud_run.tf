resource "google_cloud_run_v2_service" "signaling" {
  name                = "gamework-signaling"
  location            = var.region
  deletion_protection = false

  template {
    service_account = google_service_account.signaling_run.email

    containers {
      # Placeholder for initial creation — CI/CD will deploy the real image
      image = "us-docker.pkg.dev/cloudrun/container/hello:latest"

      ports {
        container_port = 8080
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

    # Cloud Run's maximum; WebSocket connections are dropped at the request
    # timeout and the client reconnects (WebRTCNetworkEngine retry logic).
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
