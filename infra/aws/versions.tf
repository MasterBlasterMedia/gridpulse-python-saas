terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  # Configure an encrypted, access-controlled remote backend before a shared deployment.
  # Leaving backend selection to initialization avoids embedding account-specific state locations.
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "GridPulse", Purpose = "Portfolio demonstration", ManagedBy = "Terraform" }
  }
}
