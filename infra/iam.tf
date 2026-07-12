# --- Cloud Run runtime service account (no roles needed; server is stateless) ---

resource "google_service_account" "signaling_run" {
  account_id   = "gamework-signaling-run"
  display_name = "GameWork Signaling Cloud Run"
}

# --- GitHub Actions deploy service account ---

resource "google_service_account" "gamework_deploy" {
  account_id   = "gamework-deploy"
  display_name = "GameWork GitHub Actions CI/CD"
}

resource "google_project_iam_member" "gamework_deploy_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.gamework_deploy.email}"
}

resource "google_project_iam_member" "gamework_deploy_ar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.gamework_deploy.email}"
}

resource "google_service_account_iam_member" "gamework_deploy_act_as_run" {
  service_account_id = google_service_account.signaling_run.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.gamework_deploy.email}"
}

# --- Workload Identity Federation ---
# The "github" pool is owned by portfolio/infra; this root only adds a
# provider for the gamework repo inside it (referenced by its plain ID).

resource "google_iam_workload_identity_pool_provider" "github_gamework" {
  workload_identity_pool_id          = "github"
  workload_identity_pool_provider_id = "github-gamework"
  display_name                       = "GitHub gamework"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  attribute_condition = "assertion.repository == '${var.github_repo}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  depends_on = [google_project_service.apis]
}

resource "google_service_account_iam_member" "gamework_deploy_wif" {
  service_account_id = google_service_account.gamework_deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/projects/${local.project_number}/locations/global/workloadIdentityPools/github/attribute.repository/${var.github_repo}"
}
