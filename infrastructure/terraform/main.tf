terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket         = "loan-platform-tfstate"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "loan-platform-tflock"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "loan-servicing-platform"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ─── Variables ────────────────────────────────────────────────────────────────

variable "aws_region"   { default = "us-east-1" }
variable "environment"  { default = "prod" }
variable "db_password"  { sensitive = true }
variable "domain_name"  { default = "loanplatform.io" }

locals {
  name_prefix = "loan-platform-${var.environment}"
  azs         = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
}

# ─── KMS Keys ─────────────────────────────────────────────────────────────────

resource "aws_kms_key" "rds" {
  description             = "KMS key for RDS at-rest encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_kms_key" "s3" {
  description             = "KMS key for S3 at-rest encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_kms_key" "app" {
  description             = "KMS key for application-level PII field encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

# ─── VPC ──────────────────────────────────────────────────────────────────────

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${local.name_prefix}-vpc"
  cidr = "10.0.0.0/16"

  azs              = local.azs
  private_subnets  = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets   = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  database_subnets = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = var.environment != "prod"
  enable_vpn_gateway     = false
  enable_dns_hostnames   = true
  enable_dns_support     = true
  create_database_subnet_group = true
}

# ─── Security Groups ──────────────────────────────────────────────────────────

resource "aws_security_group" "alb" {
  name   = "${local.name_prefix}-alb-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs" {
  name   = "${local.name_prefix}-ecs-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "rds" {
  name   = "${local.name_prefix}-rds-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
}

# ─── Aurora PostgreSQL (Aurora-compatible, serverless v2) ─────────────────────

resource "aws_rds_cluster" "main" {
  cluster_identifier     = "${local.name_prefix}-aurora"
  engine                 = "aurora-postgresql"
  engine_version         = "15.4"
  database_name          = "loanplatform"
  master_username        = "lpadmin"
  master_password        = var.db_password
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]
  kms_key_id             = aws_kms_key.rds.arn
  storage_encrypted      = true
  deletion_protection    = var.environment == "prod"
  skip_final_snapshot    = var.environment != "prod"
  final_snapshot_identifier = "${local.name_prefix}-final-snapshot"

  backup_retention_period   = 35
  preferred_backup_window   = "03:00-05:00"
  preferred_maintenance_window = "sun:05:00-sun:07:00"

  enabled_cloudwatch_logs_exports = ["postgresql"]

  serverlessv2_scaling_configuration {
    min_capacity = 0.5
    max_capacity = 16
  }
}

resource "aws_rds_cluster_instance" "writer" {
  identifier         = "${local.name_prefix}-writer"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
  publicly_accessible = false
}

resource "aws_rds_cluster_instance" "reader" {
  count              = var.environment == "prod" ? 1 : 0
  identifier         = "${local.name_prefix}-reader-${count.index}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
  publicly_accessible = false
}

# ─── Cognito User Pool ────────────────────────────────────────────────────────

resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-users"

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  mfa_configuration = "OPTIONAL"
  software_token_mfa_configuration {
    enabled = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  schema {
    name                = "tenant_id"
    attribute_data_type = "String"
    mutable             = true
    string_attribute_constraints {
      min_length = 36
      max_length = 36
    }
  }

  schema {
    name                = "role"
    attribute_data_type = "String"
    mutable             = true
    string_attribute_constraints {
      min_length = 1
      max_length = 20
    }
  }
}

resource "aws_cognito_user_pool_client" "api" {
  name         = "${local.name_prefix}-api-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]
  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

# ─── ECS Cluster (Fargate) ────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# ─── S3 Exports Bucket ────────────────────────────────────────────────────────

resource "aws_s3_bucket" "exports" {
  bucket = "${local.name_prefix}-exports"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "exports" {
  bucket = aws_s3_bucket.exports.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3.arn
    }
  }
}

resource "aws_s3_bucket_versioning" "exports" {
  bucket = aws_s3_bucket.exports.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_public_access_block" "exports" {
  bucket                  = aws_s3_bucket.exports.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "exports" {
  bucket = aws_s3_bucket.exports.id
  rule {
    id     = "expire-old-exports"
    status = "Enabled"
    filter { prefix = "exports/" }
    expiration { days = 90 }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
}

# ─── EventBridge for nightly accrual ─────────────────────────────────────────

resource "aws_cloudwatch_event_rule" "nightly_accrual" {
  name                = "${local.name_prefix}-nightly-accrual"
  description         = "Trigger interest accrual engine nightly at midnight UTC"
  schedule_expression = "cron(0 0 * * ? *)"
}

resource "aws_cloudwatch_event_target" "nightly_accrual" {
  rule     = aws_cloudwatch_event_rule.nightly_accrual.name
  arn      = aws_ecs_cluster.main.arn
  role_arn = aws_iam_role.eventbridge_ecs.arn

  ecs_target {
    task_count          = 1
    task_definition_arn = aws_ecs_task_definition.worker.arn
    launch_type         = "FARGATE"
    network_configuration {
      subnets         = module.vpc.private_subnets
      security_groups = [aws_security_group.ecs.id]
    }
  }

  input = jsonencode({
    containerOverrides = [{
      name    = "worker"
      command = ["node", "dist/jobs/nightly-accrual.js"]
    }]
  })
}

# ─── CloudWatch Alarms ────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "api_latency" {
  alarm_name          = "${local.name_prefix}-api-latency-p99"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "p99"
  threshold           = 0.2        # 200ms SLA
  alarm_description   = "API p99 latency exceeded 200ms"
  treat_missing_data  = "notBreaching"
}

# ─── Outputs ──────────────────────────────────────────────────────────────────

output "aurora_endpoint"         { value = aws_rds_cluster.main.endpoint }
output "aurora_reader_endpoint"  { value = aws_rds_cluster.main.reader_endpoint }
output "cognito_user_pool_id"    { value = aws_cognito_user_pool.main.id }
output "cognito_client_id"       { value = aws_cognito_user_pool_client.api.id }
output "s3_exports_bucket"       { value = aws_s3_bucket.exports.bucket }
output "kms_app_key_arn"         { value = aws_kms_key.app.arn }

# ── IAM: ECS task execution role ──────────────────────────────────────────────
resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.prefix}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ── IAM: ECS task role (runtime permissions) ──────────────────────────────────
resource "aws_iam_role" "ecs_task" {
  name = "${local.prefix}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_inline" {
  name = "${local.prefix}-task-policy"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "KMSAccess"
        Effect = "Allow"
        Action = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"]
        Resource = [aws_kms_key.main.arn]
      },
      {
        Sid    = "S3ExportsAccess"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.exports.arn,
          "${aws_s3_bucket.exports.arn}/*"
        ]
      },
      {
        Sid    = "CognitoRead"
        Effect = "Allow"
        Action = ["cognito-idp:GetUser", "cognito-idp:ListUsers"]
        Resource = [aws_cognito_user_pool.main.arn]
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["arn:aws:logs:*:*:*"]
      }
    ]
  })
}

# ── IAM: EventBridge → ECS ───────────────────────────────────────────────────
resource "aws_iam_role" "eventbridge_ecs" {
  name = "${local.prefix}-eventbridge-ecs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "eventbridge_ecs_inline" {
  name = "${local.prefix}-eventbridge-ecs-policy"
  role = aws_iam_role.eventbridge_ecs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ecs:RunTask"]
      Resource = [aws_ecs_task_definition.worker.arn]
      Condition = {
        ArnLike = {
          "ecs:cluster" = aws_ecs_cluster.main.arn
        }
      }
    }, {
      Effect   = "Allow"
      Action   = ["iam:PassRole"]
      Resource = [
        aws_iam_role.ecs_task_execution.arn,
        aws_iam_role.ecs_task.arn
      ]
    }]
  })
}

# ── CloudWatch log group ──────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.prefix}-backend"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.prefix}-worker"
  retention_in_days = 30
}

# ── ECS Task Definition: API (backend) ───────────────────────────────────────
resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.prefix}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "backend"
    image     = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/${local.prefix}-backend:latest"
    essential = true

    portMappings = [{ containerPort = 3000, protocol = "tcp" }]

    environment = [
      { name = "NODE_ENV", value = var.environment },
      { name = "PORT", value = "3000" },
      { name = "DB_HOST", value = aws_rds_cluster.main.endpoint },
      { name = "DB_PORT", value = "5432" },
      { name = "DB_NAME", value = "loan_platform" },
      { name = "DB_SSL", value = "true" },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "S3_EXPORTS_BUCKET", value = aws_s3_bucket.exports.bucket },
      { name = "KMS_KEY_ID", value = aws_kms_key.main.arn },
      { name = "COGNITO_USER_POOL_ID", value = aws_cognito_user_pool.main.id },
    ]

    secrets = [
      {
        name      = "DB_USERNAME"
        valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:username::"
      },
      {
        name      = "DB_PASSWORD"
        valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:password::"
      },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])
}

# ── ECS Task Definition: Worker (nightly accrual) ─────────────────────────────
resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.prefix}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "worker"
    image     = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/${local.prefix}-backend:latest"
    essential = true

    command = ["node", "dist/workers/accrual-worker.js"]

    environment = [
      { name = "NODE_ENV", value = var.environment },
      { name = "DB_HOST", value = aws_rds_cluster.main.endpoint },
      { name = "DB_SSL", value = "true" },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "KMS_KEY_ID", value = aws_kms_key.main.arn },
    ]

    secrets = [
      {
        name      = "DB_USERNAME"
        valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:username::"
      },
      {
        name      = "DB_PASSWORD"
        valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:password::"
      },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

# ── Secrets Manager: DB credentials ──────────────────────────────────────────
resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "${local.prefix}/db-credentials"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = "app_user"
    password = random_password.db_password.result
  })
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

# ── Data sources ──────────────────────────────────────────────────────────────
data "aws_caller_identity" "current" {}

