variable "project_id" {
  description = "GCP project ID (shared with the portfolio site)"
  type        = string
  default     = "kan-kawabata-2026"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-west1"
}

variable "github_repo" {
  description = "GitHub repository allowed to deploy via WIF"
  type        = string
  default     = "kkawabat/gamework"
}
