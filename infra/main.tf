terraform {
  required_version = ">= 1.5"

  # State tracks the relay VM, its static IP and the TURN secret version, so a
  # lost local file would orphan live infrastructure. The bucket is versioned;
  # it is bootstrap infrastructure created out of band (see CONTEXT.md) rather
  # than managed here, since a bucket cannot sanely hold its own state.
  # `prefix` keeps room for portfolio/infra to share the bucket later.
  backend "gcs" {
    bucket = "kan-kawabata-2026-tfstate"
    prefix = "gamework"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_project" "project" {}

locals {
  project_number = data.google_project.project.number
}

# Also enabled by portfolio/infra; harmless to declare here so this root
# stands alone (disable_on_destroy keeps destroys from breaking portfolio).
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "cloudscheduler.googleapis.com",
    "compute.googleapis.com",
    "secretmanager.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}
