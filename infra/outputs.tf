output "service_url" {
  description = "HTTPS URL of the signaling service"
  value       = google_cloud_run_v2_service.signaling.uri
}

output "signaling_websocket_url" {
  description = "Value for the SIGNALING_SERVER_URL GitHub secret"
  value       = replace(google_cloud_run_v2_service.signaling.uri, "https://", "wss://")
}

output "wif_provider" {
  description = "Value for the WIF_PROVIDER GitHub secret"
  value       = google_iam_workload_identity_pool_provider.github_gamework.name
}

output "deploy_service_account" {
  description = "Value for the WIF_SERVICE_ACCOUNT GitHub secret"
  value       = google_service_account.gamework_deploy.email
}
