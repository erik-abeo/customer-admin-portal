# -------------------------------------------------------------------------
# Customer Admin Portal — Terraform skeleton.
#
# This is a *starting point*, not a finished module. It assumes you already
# have a VPC, an internal ALB, and an ECS cluster. The intent is to make the
# additive resources (ECR repo, log group, task definition, service, target
# group) explicit and version-controlled, while leaving network primitives
# to your existing platform module.
#
# Wire your own values in `terraform.tfvars` and run:
#   terraform init
#   terraform plan -out plan.bin
#   terraform apply plan.bin
#
# CI workflow (.github/workflows/ci.yml) builds and pushes the image to ECR;
# this Terraform manages the cluster-side resources.
# -------------------------------------------------------------------------

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.50" }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "ecs_cluster_name" {
  type    = string
}

variable "vpc_id" {
  type    = string
}

variable "private_subnet_ids" {
  type    = list(string)
}

variable "alb_listener_arn" {
  type    = string
}

variable "host_header" {
  type    = string
  default = "admin.example.internal"
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "sentry_dsn_secret_arn" {
  type    = string
  default = ""
}

variable "audit_sink_url_secret_arn" {
  type    = string
  default = ""
}

# ---- ECR ---------------------------------------------------------------

resource "aws_ecr_repository" "this" {
  name                 = "customer-admin-portal"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
  tags = local.tags
}

resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 30 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 30
      }
      action = { type = "expire" }
    }]
  })
}

# ---- Logs --------------------------------------------------------------

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/customer-admin-portal"
  retention_in_days = 30
  tags              = local.tags
}

# ---- Security group ----------------------------------------------------

resource "aws_security_group" "task" {
  name        = "customer-admin-portal-task"
  description = "Customer Admin Portal Fargate task SG"
  vpc_id      = var.vpc_id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = local.tags
}

# ---- IAM ---------------------------------------------------------------

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "customer-admin-portal-execution"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task" {
  name               = "customer-admin-portal-task"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = local.tags
}

# Permit reading the secrets used by the task at startup.
data "aws_iam_policy_document" "secrets" {
  count = (var.sentry_dsn_secret_arn != "" || var.audit_sink_url_secret_arn != "") ? 1 : 0
  statement {
    actions = ["secretsmanager:GetSecretValue"]
    resources = compact([
      var.sentry_dsn_secret_arn,
      var.audit_sink_url_secret_arn,
    ])
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  count  = (var.sentry_dsn_secret_arn != "" || var.audit_sink_url_secret_arn != "") ? 1 : 0
  name   = "secrets-read"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.secrets[0].json
}

# ---- Task definition ---------------------------------------------------

locals {
  tags = {
    app         = "customer-admin-portal"
    environment = var.environment
    managed_by  = "terraform"
  }

  optional_secrets = compact([
    var.sentry_dsn_secret_arn != "" ? jsonencode({
      name = "VITE_SENTRY_DSN", valueFrom = var.sentry_dsn_secret_arn
    }) : "",
    var.audit_sink_url_secret_arn != "" ? jsonencode({
      name = "VITE_AUDIT_SINK_URL", valueFrom = var.audit_sink_url_secret_arn
    }) : "",
  ])
}

resource "aws_ecs_task_definition" "this" {
  family                   = "customer-admin-portal"
  cpu                      = "256"
  memory                   = "512"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "web"
    image     = "${aws_ecr_repository.this.repository_url}:${var.image_tag}"
    essential = true
    user      = "101"
    portMappings = [{ containerPort = 8080, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "TZ", value = "UTC" },
    ]
    secrets = [
      for s in local.optional_secrets : jsondecode(s)
    ]
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 10
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.this.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "web"
      }
    }
  }])

  tags = local.tags
}

# ---- ALB target group + listener rule ----------------------------------

resource "aws_lb_target_group" "this" {
  name        = "cap-tg"
  port        = 8080
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id
  health_check {
    path                = "/healthz"
    matcher             = "200"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
  }
  deregistration_delay = 30
  tags                 = local.tags
}

resource "aws_lb_listener_rule" "this" {
  listener_arn = var.alb_listener_arn
  priority     = 100
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }
  condition {
    host_header { values = [var.host_header] }
  }
}

# ---- Service -----------------------------------------------------------

resource "aws_ecs_service" "this" {
  name            = "customer-admin-portal"
  cluster         = var.ecs_cluster_name
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    assign_public_ip = false
    security_groups  = [aws_security_group.task.id]
    subnets          = var.private_subnet_ids
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = "web"
    container_port   = 8080
  }

  deployment_controller { type = "ECS" }
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200
  enable_execute_command             = false

  lifecycle {
    ignore_changes = [task_definition]  # let CI roll new image tags
  }

  tags = local.tags
}

output "ecr_repo_url" { value = aws_ecr_repository.this.repository_url }
output "log_group"    { value = aws_cloudwatch_log_group.this.name }
output "service_name" { value = aws_ecs_service.this.name }
