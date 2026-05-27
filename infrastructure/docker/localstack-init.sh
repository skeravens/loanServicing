#!/usr/bin/env bash
# LocalStack initialisation — runs on container startup
# Creates all AWS resources needed for local development
set -e

echo "⏳ Waiting for LocalStack to be ready…"
until awslocal s3 ls &>/dev/null; do sleep 1; done
echo "✅ LocalStack ready"

AWS_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

# ── KMS key ───────────────────────────────────────────────────────────────────
echo "🔑 Creating KMS key for PII encryption…"
KEY_ID=$(awslocal kms create-key \
  --description "Loan Platform PII encryption key" \
  --region "$AWS_REGION" \
  --query "KeyMetadata.KeyId" \
  --output text)

awslocal kms create-alias \
  --alias-name alias/loan-platform-pii \
  --target-key-id "$KEY_ID" \
  --region "$AWS_REGION"

echo "  KMS key: $KEY_ID (alias/loan-platform-pii)"

# ── S3 bucket ─────────────────────────────────────────────────────────────────
echo "🪣 Creating S3 exports bucket…"
awslocal s3 mb "s3://loan-platform-exports" --region "$AWS_REGION"
awslocal s3api put-bucket-versioning \
  --bucket loan-platform-exports \
  --versioning-configuration Status=Enabled

echo "  S3: s3://loan-platform-exports"

# ── Cognito User Pool ─────────────────────────────────────────────────────────
echo "👤 Creating Cognito User Pool…"
POOL_ID=$(awslocal cognito-idp create-user-pool \
  --pool-name loan-platform-dev \
  --region "$AWS_REGION" \
  --schema \
    '[{"Name":"tenant_id","AttributeDataType":"String","Mutable":true},
      {"Name":"role","AttributeDataType":"String","Mutable":true}]' \
  --query "UserPool.Id" \
  --output text)

CLIENT_ID=$(awslocal cognito-idp create-user-pool-client \
  --user-pool-id "$POOL_ID" \
  --client-name loan-platform-backend \
  --no-generate-secret \
  --region "$AWS_REGION" \
  --query "UserPoolClient.ClientId" \
  --output text)

echo "  Cognito User Pool ID: $POOL_ID"
echo "  Cognito Client ID:    $CLIENT_ID"

# ── Seed test users ───────────────────────────────────────────────────────────
echo "🌱 Creating seed Cognito users…"

for ROLE in ADMIN OPERATOR VIEWER; do
  EMAIL="dev-${ROLE,,}@example.com"
  awslocal cognito-idp admin-create-user \
    --user-pool-id "$POOL_ID" \
    --username "$EMAIL" \
    --temporary-password "Temp1234!" \
    --user-attributes \
      "Name=email,Value=$EMAIL" \
      "Name=custom:tenant_id,Value=00000000-0000-0000-0000-000000000001" \
      "Name=custom:role,Value=$ROLE" \
    --region "$AWS_REGION" \
    --message-action SUPPRESS \
    2>/dev/null || echo "  User $EMAIL already exists"
done

# ── EventBridge rule (nightly accrual) ───────────────────────────────────────
echo "📅 Creating EventBridge rule for nightly interest accrual…"
awslocal events put-rule \
  --name loan-platform-nightly-accrual \
  --schedule-expression "cron(0 0 * * ? *)" \
  --state ENABLED \
  --region "$AWS_REGION" \
  2>/dev/null || true

# ── Write config to shared volume ────────────────────────────────────────────
cat > /tmp/localstack-outputs.env << EOF
COGNITO_USER_POOL_ID=$POOL_ID
COGNITO_CLIENT_ID=$CLIENT_ID
KMS_KEY_ID=$KEY_ID
AWS_REGION=$AWS_REGION
S3_EXPORTS_BUCKET=loan-platform-exports
EOF

echo ""
echo "✅ LocalStack initialisation complete!"
echo "───────────────────────────────────────"
cat /tmp/localstack-outputs.env
echo "───────────────────────────────────────"
