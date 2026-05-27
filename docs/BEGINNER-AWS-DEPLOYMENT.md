# Complete Beginner's Guide: Deploying the Loan Platform on AWS

This guide assumes you have **zero AWS experience**. Every step is explained in plain English.
Estimated total time: **3–4 hours** on your first attempt.

---

## What We're Building

By the end of this guide you'll have:
- A **live backend API** at `https://api.yourdomain.com`
- A **live frontend app** at `https://app.yourdomain.com`
- A **private database** that nobody can reach from the internet
- **HTTPS everywhere** with a real SSL certificate
- **Login system** powered by AWS Cognito

Here's how the pieces connect:

```
Your users (browser)
        │  HTTPS only
        ▼
   [CloudFront]          ← serves the React frontend globally
        │
   [Load Balancer]       ← receives API calls, forwards to backend
        │  WAF firewall sits in front
        ▼
   [ECS / Docker]        ← runs your NestJS backend (private, no internet access)
        │
        ▼
   [Aurora PostgreSQL]   ← your database (completely private)
   [Cognito]             ← handles user logins / JWT tokens
   [KMS]                 ← encrypts sensitive data (SSN, Tax IDs)
   [S3]                  ← stores exports and logs
```

---

## Phase 0 — Before You Start (your laptop)

### 0.1 — Create an AWS account

1. Go to https://aws.amazon.com and click **"Create an AWS Account"**
2. Enter your email, choose a root account password
3. Enter a credit card (you won't be charged until you use paid services)
4. Choose the **Basic support plan** (free)
5. Verify your phone number
6. Sign in at https://console.aws.amazon.com

> **Important:** After signing in as root, immediately do this:
> - Click your name (top right) → **Security credentials**
> - Under "Multi-factor authentication" → **Assign MFA device**
> - Use an app like Google Authenticator on your phone
> - This protects your account if your password leaks

### 0.2 — Create an IAM user (don't use root for daily work)

Root account has unlimited power — it's dangerous to use day-to-day.
Create a regular admin user instead:

1. In the AWS Console search bar, type **IAM** and open it
2. Left sidebar → **Users** → **Create user**
3. Username: `deploy-admin`
4. Check **"Provide user access to the AWS Management Console"**
5. Choose **"I want to create an IAM user"**
6. Set a password, uncheck "must reset on first login"
7. Click **Next** → **Attach policies directly**
8. Search for and check: **AdministratorAccess**
9. Click **Next** → **Create user**
10. **Download the CSV file** — it contains your access keys. Save it somewhere safe.

Sign out of root, sign back in as `deploy-admin`.

### 0.3 — Install tools on your Mac/PC

Open your terminal (Terminal on Mac, PowerShell on Windows) and run:

**Mac:**
```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install everything needed
brew install awscli terraform git
brew install --cask docker

# Install Node.js
brew install nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
nvm install 20
nvm use 20
```

**Windows (run in PowerShell as Administrator):**
```powershell
# Install Chocolatey package manager
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install tools
choco install awscli terraform git docker-desktop nodejs-lts -y
```

**Verify everything installed:**
```bash
aws --version        # should show: aws-cli/2.x.x
terraform --version  # should show: Terraform v1.x.x
docker --version     # should show: Docker version 2x.x.x
node --version       # should show: v20.x.x
git --version        # should show: git version 2.x.x
```

### 0.4 — Configure AWS CLI with your credentials

```bash
aws configure
```

It will ask 4 questions:
```
AWS Access Key ID:     [paste from the CSV you downloaded]
AWS Secret Access Key: [paste from the CSV you downloaded]
Default region name:   us-east-1
Default output format: json
```

Test it works:
```bash
aws sts get-caller-identity
```
You should see your account ID printed. If you get an error, double-check the keys.

### 0.5 — Unzip the project

```bash
# Move the zip to a folder and unzip it
mkdir ~/projects
mv ~/Downloads/loan-platform.zip ~/projects/
cd ~/projects
unzip loan-platform.zip
cd loan-platform
ls
# You should see: backend/  frontend/  infrastructure/  docs/  README.md
```

---

## Phase 1 — Register a Domain Name (15 minutes)

You need a domain like `loanplatform.com` or `mycompany.io`.

1. In the AWS Console, search for **Route 53**
2. Left sidebar → **Registered domains** → **Register domain**
3. Type your desired domain name and check availability
4. If available, click **Select** → **Proceed to checkout**
5. Fill in your contact info
6. Click **Submit** and pay (~$12/year for .com)

> The domain usually activates within 10–15 minutes.
> You'll get a confirmation email.

After it's registered:
1. Go to Route 53 → **Hosted zones**
2. Click your domain name
3. **Copy the Hosted Zone ID** (looks like `Z1D633PJN98FT9`) — you'll need it later

---

## Phase 2 — Set Up Terraform State Storage (10 minutes)

Terraform needs a place to save its work so it remembers what it's created.

```bash
# Get your AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Your account ID: $ACCOUNT_ID"

# Create an S3 bucket for Terraform state
# (bucket names must be globally unique — that's why we add the account ID)
aws s3 mb s3://loan-platform-tfstate-$ACCOUNT_ID --region us-east-1

# Turn on versioning (so you can recover if something goes wrong)
aws s3api put-bucket-versioning \
  --bucket loan-platform-tfstate-$ACCOUNT_ID \
  --versioning-configuration Status=Enabled

# Turn on encryption
aws s3api put-bucket-encryption \
  --bucket loan-platform-tfstate-$ACCOUNT_ID \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Block all public access to this bucket
aws s3api put-public-access-block \
  --bucket loan-platform-tfstate-$ACCOUNT_ID \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Create a DynamoDB table to prevent two people running Terraform at the same time
aws dynamodb create-table \
  --table-name loan-platform-tflock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

echo "✅ Terraform state storage ready"
```

---

## Phase 3 — Request an SSL Certificate (10 minutes)

This gives you the padlock 🔒 in the browser.

```bash
# Replace yourdomain.com with your actual domain
DOMAIN="yourdomain.com"

aws acm request-certificate \
  --domain-name "*.${DOMAIN}" \
  --subject-alternative-names "${DOMAIN}" \
  --validation-method DNS \
  --region us-east-1
```

It will output something like:
```json
{
    "CertificateArn": "arn:aws:acm:us-east-1:123456789:certificate/abc-123-def"
}
```

**Copy that CertificateArn** — you need it in Phase 5.

Now validate ownership of your domain:

1. AWS Console → search **ACM** (Certificate Manager)
2. Click your certificate (status: Pending validation)
3. Click **Create records in Route 53**
4. Click **Create records**

AWS will automatically add DNS records to prove you own the domain.
Wait 2–5 minutes, then refresh — status will change to **Issued** ✅

---

## Phase 4 — Create Docker Image Repositories (5 minutes)

AWS needs somewhere to store your Docker images before deploying them.

```bash
REGION=us-east-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Create repository for the backend
aws ecr create-repository \
  --repository-name loan-platform-backend \
  --region $REGION

# Create repository for the frontend
aws ecr create-repository \
  --repository-name loan-platform-frontend \
  --region $REGION

echo "Backend image URL:  ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/loan-platform-backend"
echo "Frontend image URL: ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/loan-platform-frontend"
```

---

## Phase 5 — Configure Terraform

Now we tell Terraform all the settings specific to your deployment.

### 5.1 — Add state backend to Terraform

Open the file `infrastructure/terraform/main.tf` in a text editor.
At the very top of the file, add this block (before anything else):

```hcl
terraform {
  backend "s3" {
    bucket         = "loan-platform-tfstate-YOUR_ACCOUNT_ID"
    key            = "loan-platform/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "loan-platform-tflock"
    encrypt        = true
  }
}
```

Replace `YOUR_ACCOUNT_ID` with the actual number from Phase 2.

### 5.2 — Add missing Terraform variables

At the top of `infrastructure/terraform/main.tf`, find the `variable` blocks and add these if they're not already there:

```hcl
variable "domain_name" {
  description = "Your registered domain"
  type        = string
}

variable "api_subdomain" {
  description = "Subdomain for the API"
  type        = string
  default     = "api"
}

variable "acm_cert_arn" {
  description = "ACM certificate ARN"
  type        = string
}

variable "alarm_email" {
  description = "Email for CloudWatch alerts"
  type        = string
}

variable "backend_desired" {
  description = "Number of backend ECS tasks"
  type        = number
  default     = 2
}

locals {
  prefix = "${var.environment}-loan-platform"
}
```

### 5.3 — Create your variables file

Create a new file at `infrastructure/terraform/terraform.tfvars`:

```bash
cat > ~/projects/loan-platform/infrastructure/terraform/terraform.tfvars << 'EOF'
environment     = "prod"
aws_region      = "us-east-1"
domain_name     = "yourdomain.com"
api_subdomain   = "api"
acm_cert_arn    = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERT_ID"
alarm_email     = "your@email.com"
backend_desired = 2
EOF
```

Edit that file and replace:
- `yourdomain.com` → your actual domain
- `arn:aws:acm:...` → the CertificateArn from Phase 3
- `your@email.com` → your email for alerts

### 5.4 — Add ALB, WAF, Route 53, ECS Service, and Security Groups

Append the following to the end of `infrastructure/terraform/main.tf`:

```hcl
# ── WAF (Web Application Firewall) ───────────────────────────────────────────
resource "aws_wafv2_web_acl" "main" {
  name  = "${local.prefix}-waf"
  scope = "REGIONAL"

  default_action { allow {} }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimit"
    priority = 2
    action { block {} }
    statement {
      rate_based_statement {
        limit              = 500
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.prefix}-waf"
    sampled_requests_enabled   = true
  }
}

# ── Security Groups ───────────────────────────────────────────────────────────
resource "aws_security_group" "alb" {
  name   = "${local.prefix}-alb-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS from internet"
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP (will redirect to HTTPS)"
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${local.prefix}-alb-sg" }
}

resource "aws_security_group" "backend" {
  name   = "${local.prefix}-backend-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "Traffic from ALB only"
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${local.prefix}-backend-sg" }
}

resource "aws_security_group" "db" {
  name   = "${local.prefix}-db-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
    description     = "PostgreSQL from ECS tasks only"
  }
  tags = { Name = "${local.prefix}-db-sg" }
}

# ── Load Balancer ─────────────────────────────────────────────────────────────
resource "aws_lb" "main" {
  name               = "${local.prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets
  enable_deletion_protection = false
  tags = { Name = "${local.prefix}-alb" }
}

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}

resource "aws_lb_target_group" "backend" {
  name        = "${local.prefix}-backend"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }
  tags = { Name = "${local.prefix}-backend-tg" }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_cert_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ── ECS Service ───────────────────────────────────────────────────────────────
resource "aws_ecs_service" "backend" {
  name            = "${local.prefix}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.backend_desired
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.backend.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.https]
}

# ── Route 53 DNS ──────────────────────────────────────────────────────────────
data "aws_route53_zone" "main" {
  name = var.domain_name
}

resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "${var.api_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# ── CloudWatch Log Groups ─────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.prefix}-backend"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.prefix}-worker"
  retention_in_days = 30
}

# ── IAM Roles ─────────────────────────────────────────────────────────────────
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
        Sid      = "KMSAccess"
        Effect   = "Allow"
        Action   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"]
        Resource = [aws_kms_key.main.arn]
      },
      {
        Sid      = "S3Access"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:ListBucket"]
        Resource = [aws_s3_bucket.exports.arn, "${aws_s3_bucket.exports.arn}/*"]
      },
      {
        Sid      = "CloudWatchLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["arn:aws:logs:*:*:*"]
      },
      {
        Sid      = "SecretsManager"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.db_credentials.arn]
      }
    ]
  })
}

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

# ── Secrets Manager ───────────────────────────────────────────────────────────
resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "${local.prefix}/db-credentials"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id     = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = "app_user"
    password = random_password.db_password.result
  })
}

# ── ECS Task Definitions ──────────────────────────────────────────────────────
data "aws_caller_identity" "current" {}

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
    image     = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/loan-platform-backend:latest"
    essential = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV",           value = "production" },
      { name = "PORT",               value = "3000" },
      { name = "DB_HOST",            value = aws_rds_cluster.main.endpoint },
      { name = "DB_PORT",            value = "5432" },
      { name = "DB_NAME",            value = "loan_platform" },
      { name = "DB_SSL",             value = "true" },
      { name = "AWS_REGION",         value = var.aws_region },
      { name = "S3_EXPORTS_BUCKET",  value = aws_s3_bucket.exports.bucket },
      { name = "KMS_KEY_ID",         value = aws_kms_key.main.arn },
      { name = "COGNITO_USER_POOL_ID", value = aws_cognito_user_pool.main.id },
      { name = "ALLOWED_ORIGINS",    value = "https://app.${var.domain_name}" },
    ]
    secrets = [
      { name = "DB_USERNAME", valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:username::" },
      { name = "DB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:password::" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options   = {
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
    image     = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/loan-platform-backend:latest"
    essential = true
    command   = ["node", "dist/workers/accrual-worker.js"]
    environment = [
      { name = "NODE_ENV",   value = "production" },
      { name = "DB_SSL",     value = "true" },
      { name = "AWS_REGION", value = var.aws_region },
    ]
    secrets = [
      { name = "DB_USERNAME", valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:username::" },
      { name = "DB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:password::" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options   = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

# ── Outputs ───────────────────────────────────────────────────────────────────
output "api_url" {
  value = "https://${var.api_subdomain}.${var.domain_name}"
}
output "alb_dns_name" {
  value = aws_lb.main.dns_name
}
output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}
output "cognito_client_id" {
  value = aws_cognito_user_pool_client.main.id
}
output "db_endpoint" {
  value = aws_rds_cluster.main.endpoint
}
output "ecr_backend_url" {
  value = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/loan-platform-backend"
}
```

---

## Phase 6 — Add a Health Check Endpoint to the Backend

The load balancer needs a `/health` endpoint to know the app is running.

Open `loan-platform/backend/src/main.ts` and add this before `await app.listen(port)`:

```typescript
// Health check endpoint (no auth required)
app.getHttpAdapter().get('/health', (_req: any, res: any) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

---

## Phase 7 — Run Terraform (creates all AWS infrastructure)

```bash
cd ~/projects/loan-platform/infrastructure/terraform

# Download the required Terraform providers (~2 minutes)
terraform init

# Preview what will be created (read through this carefully)
terraform plan -var-file=terraform.tfvars

# Create everything in AWS (~15-20 minutes)
terraform apply -var-file=terraform.tfvars
```

When prompted: `Do you want to perform these actions?` type `yes` and press Enter.

Grab a coffee — this takes 15–20 minutes. Aurora PostgreSQL takes the longest.

When it finishes, you'll see outputs like:
```
api_url              = "https://api.yourdomain.com"
cognito_user_pool_id = "us-east-1_XXXXXXXXX"
cognito_client_id    = "1abc2def3ghi"
db_endpoint          = "loan-platform-prod.cluster-xxx.us-east-1.rds.amazonaws.com"
ecr_backend_url      = "123456789.dkr.ecr.us-east-1.amazonaws.com/loan-platform-backend"
```

**Save all of these values** — you'll need them in the next steps.

---

## Phase 8 — Build and Push Docker Images

Open Docker Desktop and make sure it's running (you'll see the whale icon in your taskbar/menu bar).

```bash
REGION=us-east-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Log Docker into ECR
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ECR

# ── Build and push BACKEND ────────────────────────────────────────────────────
cd ~/projects/loan-platform/backend

# Build the image (takes 3-5 minutes on first run)
docker build --platform linux/amd64 -t loan-platform-backend .

# Tag it for ECR
docker tag loan-platform-backend:latest $ECR/loan-platform-backend:latest

# Push to ECR (takes 2-3 minutes)
docker push $ECR/loan-platform-backend:latest

echo "✅ Backend image pushed"

# ── Build and push FRONTEND ───────────────────────────────────────────────────
cd ~/projects/loan-platform/frontend

# Create production environment file
# Replace yourdomain.com with your actual domain
echo "NEXT_PUBLIC_API_URL=https://api.yourdomain.com" > .env.production

# Build the frontend image
docker build --platform linux/amd64 -t loan-platform-frontend .

# Tag and push
docker tag loan-platform-frontend:latest $ECR/loan-platform-frontend:latest
docker push $ECR/loan-platform-frontend:latest

echo "✅ Frontend image pushed"
```

---

## Phase 9 — Run Database Migrations

Your database is running but has no tables yet. We need to run the migration files.

```bash
REGION=us-east-1
CLUSTER="prod-loan-platform"   # or whatever your cluster is named

# First, force ECS to start a task with the latest image
aws ecs update-service \
  --cluster $CLUSTER \
  --service prod-loan-platform-backend \
  --force-new-deployment \
  --region $REGION

# Wait for the service to stabilise (takes 2-3 minutes)
echo "Waiting for service to start..."
aws ecs wait services-stable \
  --cluster $CLUSTER \
  --services prod-loan-platform-backend \
  --region $REGION

echo "✅ Service is running"
```

Now run the migrations using ECS Exec (a built-in terminal into the running container):

```bash
# Enable ECS Exec (required before first use)
aws ecs update-service \
  --cluster $CLUSTER \
  --service prod-loan-platform-backend \
  --enable-execute-command \
  --region $REGION

# Wait a moment for the setting to take effect
sleep 30

# Get the ID of a running task
TASK_ARN=$(aws ecs list-tasks \
  --cluster $CLUSTER \
  --service-name prod-loan-platform-backend \
  --query "taskArns[0]" \
  --output text \
  --region $REGION)

echo "Running task: $TASK_ARN"

# Open a shell inside the running container
aws ecs execute-command \
  --cluster $CLUSTER \
  --task $TASK_ARN \
  --container backend \
  --interactive \
  --command "/bin/sh" \
  --region $REGION
```

You're now inside the container. Run:
```sh
# Run database migrations (creates all tables)
npm run migration:run

# Optional: load sample data
npm run seed

# Exit the container shell
exit
```

---

## Phase 10 — Deploy the Frontend

We'll host the frontend on S3 + CloudFront (fast, cheap, globally distributed).

### 10.1 — Build the frontend locally

```bash
cd ~/projects/loan-platform/frontend

# Make sure this points to your API
echo "NEXT_PUBLIC_API_URL=https://api.yourdomain.com" > .env.production

npm install
npm run build
```

### 10.2 — Create an S3 bucket for the frontend

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET="loan-platform-frontend-${ACCOUNT_ID}"

aws s3 mb s3://$BUCKET --region us-east-1

# Allow CloudFront to read from it (bucket stays private from direct internet)
aws s3api put-public-access-block \
  --bucket $BUCKET \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "Bucket: $BUCKET"
```

### 10.3 — Upload the built frontend

```bash
# Upload the Next.js build output
aws s3 sync ~/projects/loan-platform/frontend/.next/static \
  s3://$BUCKET/_next/static --delete

aws s3 sync ~/projects/loan-platform/frontend/public \
  s3://$BUCKET/public --delete
```

### 10.4 — Create a CloudFront distribution (via AWS Console)

This is easier to do in the console for beginners:

1. AWS Console → search **CloudFront** → **Create distribution**
2. **Origin domain**: click the dropdown and select your S3 bucket
3. **Origin access**: select **"Origin access control settings (recommended)"**
   - Click **Create new OAC** → accept defaults → **Create**
4. **Viewer protocol policy**: **Redirect HTTP to HTTPS**
5. **Allowed HTTP methods**: GET, HEAD
6. **Cache policy**: **CachingOptimized**
7. **Alternate domain names (CNAMEs)**: add `app.yourdomain.com`
8. **Custom SSL certificate**: select the certificate you created in Phase 3
9. **Default root object**: `index.html`
10. Click **Create distribution**

Copy the yellow banner instruction about the S3 bucket policy — click **Copy policy** and then:
- Go to S3 → your bucket → **Permissions** tab → **Bucket policy** → Paste → **Save**

The distribution takes ~15 minutes to deploy globally.

### 10.5 — Point your domain to CloudFront

```bash
# Get your CloudFront distribution domain (looks like d1234abcd.cloudfront.net)
# Find it in: AWS Console → CloudFront → your distribution → "Distribution domain name"
CF_DOMAIN="d1234abcd.cloudfront.net"   # replace with yours

ZONE_ID="YOUR_ROUTE53_ZONE_ID"  # from Phase 1

aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch "{
    \"Changes\": [{
      \"Action\": \"CREATE\",
      \"ResourceRecordSet\": {
        \"Name\": \"app.yourdomain.com\",
        \"Type\": \"A\",
        \"AliasTarget\": {
          \"DNSName\": \"${CF_DOMAIN}\",
          \"EvaluateTargetHealth\": false,
          \"HostedZoneId\": \"Z2FDTNDATAQYW2\"
        }
      }
    }]
  }"
```

> Note: `Z2FDTNDATAQYW2` is AWS's fixed zone ID for all CloudFront distributions — it's not your zone ID.

---

## Phase 11 — Create Your First User

```bash
# Get the Cognito User Pool ID from Terraform output
POOL_ID="us-east-1_XXXXXXXXX"   # replace with your value

# Create a tenant ID (a random UUID)
TENANT_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
echo "Your tenant ID: $TENANT_ID"
# IMPORTANT: Save this — it's the ID of your organisation in the system

# Create the first admin user
aws cognito-idp admin-create-user \
  --user-pool-id $POOL_ID \
  --username admin@yourdomain.com \
  --user-attributes \
    "Name=email,Value=admin@yourdomain.com" \
    "Name=email_verified,Value=true" \
    "Name=custom:tenant_id,Value=${TENANT_ID}" \
    "Name=custom:role,Value=ADMIN" \
  --temporary-password "Welcome123!" \
  --region us-east-1

echo "✅ Admin user created"
echo "   Email: admin@yourdomain.com"
echo "   Temp password: Welcome123!"
echo "   They will be asked to change it on first login"
```

---

## Phase 12 — Verify Everything is Working

```bash
# Test the API health endpoint
curl https://api.yourdomain.com/health
# Expected: {"status":"ok","timestamp":"2024-..."}

# Test the API docs
# Open in browser: https://api.yourdomain.com/api/docs

# Test the frontend
# Open in browser: https://app.yourdomain.com
```

If both load — **you're live!** 🎉

---

## Troubleshooting Common Problems

### "ECS tasks keep stopping / health check failing"

```bash
# View the logs to see what error is happening
aws logs tail /ecs/prod-loan-platform-backend --follow --region us-east-1
```

Common causes:
- Database not reachable → check security group `prod-loan-platform-db-sg` allows port 5432 from the backend security group
- Missing environment variable → check the task definition in ECS console
- Migration hasn't run → go back to Phase 9

### "curl: could not resolve host api.yourdomain.com"

DNS hasn't propagated yet. Wait 5 minutes and try again.
Check with: `nslookup api.yourdomain.com`

### "502 Bad Gateway" from the load balancer

The backend container is running but crashing before serving requests.
Check logs: `aws logs tail /ecs/prod-loan-platform-backend --follow`

### "Certificate not trusted / SSL error"

Your ACM certificate may not be in Issued state yet.
Check: AWS Console → ACM → your cert. If still Pending, the DNS validation records may not have been added. Go back to Phase 3.

### Terraform apply fails with "already exists"

Some resource was partially created. Run:
```bash
terraform apply -var-file=terraform.tfvars -refresh=true
```
Or destroy and recreate: `terraform destroy -var-file=terraform.tfvars`

---

## Cost Summary

| Service | What it does | Monthly cost |
|---|---|---|
| Aurora PostgreSQL | Your database | ~$30-80 |
| ECS Fargate | Runs your app | ~$30-50 |
| Application Load Balancer | Routes traffic | ~$20 |
| WAF | Firewall | ~$10 |
| CloudFront | Frontend CDN | ~$1-10 |
| Route 53 | DNS | ~$1 |
| KMS | Encryption | ~$1-3 |
| Secrets Manager | Secure passwords | ~$1 |
| CloudWatch | Logs & monitoring | ~$5-10 |
| **Total** | | **~$100-185/month** |

**To avoid costs while not using it:**
```bash
# Scale ECS tasks to zero (stops the app, keeps data)
aws ecs update-service \
  --cluster prod-loan-platform \
  --service prod-loan-platform-backend \
  --desired-count 0

# Scale back up when needed
aws ecs update-service \
  --cluster prod-loan-platform \
  --service prod-loan-platform-backend \
  --desired-count 2
```

Note: Aurora Serverless v2 scales to near-zero automatically when idle (~$0.50/day minimum).

---

## What to Do After Going Live

1. **Set up billing alerts** so you're not surprised:
   - AWS Console → Billing → Budgets → Create budget
   - Set a monthly limit (e.g. $200) and get emailed at 80%

2. **Enable GuardDuty** (threat detection, ~$3/month):
   - AWS Console → GuardDuty → Enable

3. **Set up CloudWatch dashboard**:
   - AWS Console → CloudWatch → Dashboards → Create dashboard
   - Add widgets for ECS CPU, DB connections, ALB request count

4. **Backups**: Aurora automatically backs up daily with 35-day retention (already configured)

5. **Updates**: When you change code, rebuild and push the Docker image, then:
   ```bash
   aws ecs update-service \
     --cluster prod-loan-platform \
     --service prod-loan-platform-backend \
     --force-new-deployment
   ```

