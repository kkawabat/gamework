# Keepalive ping so players rarely hit a cold start when connecting. This only
# stays cheap if Cloud Run is request-based (`cpu_idle = true` on the service):
# a warm-but-idle instance then costs nothing, and we pay milliseconds of
# request time per ping. Instance-based billing (the v2 API default) bills
# 1 vCPU 24/7. Same pattern as portfolio-keepalive.
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
