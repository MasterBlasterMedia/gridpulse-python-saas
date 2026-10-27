variable "region" {
  description = "Region for the approved deployment and its ACM certificate."
  type        = string
  default     = "us-east-1"
}
variable "certificate_arn" {
  description = "Existing ACM certificate for the API hostname in this region."
  type        = string
}
variable "api_image" {
  description = "Immutable image URI with @sha256 digest, pushed after ECR bootstrap."
  type        = string
  validation {
    condition     = can(regex("@sha256:[a-f0-9]{64}$", var.api_image))
    error_message = "Use a digest-pinned image for reproducible rollback."
  }
}
variable "frontend_origin" {
  description = "Exact GitHub Pages origin, without the repository path."
  type        = string
  default     = "https://masterblastermedia.github.io"
  validation {
    condition     = can(regex("^https://[^/]+$", var.frontend_origin))
    error_message = "Supply a single HTTPS origin without a path."
  }
}
variable "github_oidc_provider_arn" {
  description = "Existing token.actions.githubusercontent.com IAM OIDC provider ARN."
  type        = string
}
variable "repository" {
  description = "Only this repository's production environment may assume the deployment role."
  type        = string
  default     = "MasterBlasterMedia/gridpulse-python-saas"
}
variable "desired_count" {
  description = "Leave zero until secrets, migrations, and the approved deployment are ready."
  type        = number
  default     = 0
  validation {
    condition     = contains([0, 1], var.desired_count)
    error_message = "The in-memory limiter supports one task; add a shared limiter before scaling."
  }
}
