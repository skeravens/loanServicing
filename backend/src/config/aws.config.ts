import { registerAs } from '@nestjs/config';

export default registerAs('aws', () => ({
  region: process.env.AWS_REGION ?? 'us-east-1',
  cognito: {
    userPoolId: process.env.COGNITO_USER_POOL_ID ?? '',
    clientId: process.env.COGNITO_CLIENT_ID ?? '',
    jwksUri: process.env.COGNITO_JWKS_URI ?? '',
  },
  kms: {
    keyId: process.env.KMS_KEY_ID ?? '',
  },
  s3: {
    exportsBucket: process.env.S3_EXPORTS_BUCKET ?? 'loan-platform-exports',
  },
}));
