# Keepalive ping so players rarely hit a cold start when connecting. With
# Cloud Run's default request-based billing, a warm-but-idle instance costs
# nothing; this only pays for milliseconds of request time per ping.
# (Same pattern as portfolio-keepalive in the portfolio repo's Terraform.)
resource "google_cloud_scheduler_job" "signaling_keepalive" {
  name             = "gamework-signaling-keepalive"
  description      = "Ping the signaling server every 10 minutes to keep a Cloud Run instance warm"
  schedule         = "*/10 * * * *"
  time_zone        = "Etc/UTC"
  region           = var.region
  attempt_deadline = "60s"

  http_target {
    http_method = "GET"
    uri         = "${google_cloud_run_v2_service.signaling.uri}/health"
  }

  depends_on = [google_project_service.apis]
}
