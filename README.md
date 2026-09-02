# Workverse Mail

Standalone, minimal email-marketing portal.

## Architecture

- S3: private static frontend origin
- CloudFront: HTTPS frontend and API reverse proxy
- Cognito: authentication
- API Gateway HTTP API: JWT-protected API
- Lambda: email sending and history API
- SES: email delivery
- DynamoDB: dedicated `workverse-mail-history` table

No Amplify, EC2, RDS, VPC, NAT Gateway, ECS or EKS.

## Region

`ap-southeast-1`

## SES

The sender defaults to:

`marketing@workverse.me`

The `workverse.me` domain must be verified in SES in `ap-southeast-1`.

If SES is still in sandbox, recipients must be verified.

## 1. Delete the old stack

Only do this after confirming that `workverse-mail` contains only this standalone project.

```bash
aws cloudformation delete-stack \
  --stack-name workverse-mail \
  --region ap-southeast-1
```

If CloudFormation says the S3 bucket is not empty:

```bash
BUCKET=$(aws cloudformation describe-stack-resources \
  --stack-name workverse-mail \
  --region ap-southeast-1 \
  --query "StackResources[?LogicalResourceId=='MailBucket'].PhysicalResourceId" \
  --output text)

aws s3 rm "s3://$BUCKET" --recursive --region ap-southeast-1

aws cloudformation delete-stack \
  --stack-name workverse-mail \
  --region ap-southeast-1
```

Wait:

```bash
aws cloudformation wait stack-delete-complete \
  --stack-name workverse-mail \
  --region ap-southeast-1
```

## 2. Validate

```bash
sam validate --template-file infra/template.yaml --lint
```

## 3. Build

```bash
sam build --template-file infra/template.yaml
```

## 4. Deploy

```bash
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name workverse-mail \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    SesFromEmail="marketing@workverse.me" \
  --region ap-southeast-1
```

## 5. Get outputs

```bash
aws cloudformation describe-stacks \
  --stack-name workverse-mail \
  --region ap-southeast-1 \
  --query 'Stacks[0].Outputs' \
  --output table
```

Record:

- FrontendBucket
- CloudFrontUrl
- UserPoolId
- UserPoolClientId

## 6. Configure frontend

Edit:

```bash
nano frontend/config.js
```

Set:

```javascript
window.WORKVERSE_MAIL_CONFIG = {
  region: "ap-southeast-1",
  userPoolId: "YOUR_USER_POOL_ID",
  clientId: "YOUR_USER_POOL_CLIENT_ID"
};
```

## 7. Create the first admin user

Use a strong temporary password. Do not commit or publish it.

```bash
aws cognito-idp admin-create-user \
  --user-pool-id YOUR_USER_POOL_ID \
  --username surit.aryal@workverse.me \
  --user-attributes \
    Name=email,Value=surit.aryal@workverse.me \
    Name=email_verified,Value=true \
  --temporary-password 'REPLACE_WITH_STRONG_TEMP_PASSWORD' \
  --message-action SUPPRESS \
  --region ap-southeast-1
```

Because `--message-action SUPPRESS` is used, Cognito will not try to send an invitation. Use the temporary password locally for the first login; the portal will require a new password.

## 8. Upload frontend

```bash
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name workverse-mail \
  --region ap-southeast-1 \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucket'].OutputValue" \
  --output text)

aws s3 sync frontend/ "s3://$BUCKET/" \
  --delete \
  --region ap-southeast-1
```

## 9. Open the portal

Get the URL:

```bash
aws cloudformation describe-stacks \
  --stack-name workverse-mail \
  --region ap-southeast-1 \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue" \
  --output text
```

Open the returned HTTPS URL.

## Security model

The S3 bucket is private.

CloudFront accesses S3 using Origin Access Control.

The API is protected by API Gateway JWT authentication using the Cognito User Pool.

The browser contains only the Cognito public app client ID. It contains no AWS secret.

Self-registration is disabled. Users must be created by an administrator.

The Lambda has no authentication secret of its own; API Gateway rejects unauthenticated requests before Lambda is invoked.

## Application features

- Sign in
- First-login password change
- Sign out
- Manual recipients
- CSV bulk upload
- Recipient count
- Subject
- Plain-text email body
- Preview
- Send confirmation
- Send through SES
- Dedicated DynamoDB history
- Campaign detail / recipient status
- Maximum 100 recipients per send

## Important MVP limitation

This version sends recipients individually through SES. It is intentionally simple.

For large campaigns, later add SQS and SES event handling for bounces, complaints and delivery tracking.

Do not expose this portal publicly until you have confirmed that only intended users exist in the Cognito User Pool.
