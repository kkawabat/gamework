resource "google_artifact_registry_repository" "gamework" {
  location      = var.region
  repository_id = "gamework"
  format        = "DOCKER"
  description   = "Docker images for the GameWork signaling server"

  # DELETE selects candidates for cleanup; KEEP exempts versions from it.
  # Without a DELETE policy nothing is ever removed.
  cleanup_policies {
    id     = "delete-all-unkept"
    action = "DELETE"
    condition {
      tag_state = "ANY" # match every version; only the KEEP below survives
    }
  }

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  depends_on = [google_project_service.apis]
}
