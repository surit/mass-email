# Workverse Mail — Minimal AWS Deployment

Standalone email marketing app. It does not use or modify the existing Workverse infrastructure.

## Runtime
- S3 private bucket for static frontend
- CloudFront for HTTPS
- API Gateway HTTP API
- One Lambda function
- Dedicated DynamoDB table: `workverse-mail-history`
- Amazon SES for sending

## Before deployment
1. Verify the sender identity in Amazon SES in the same AWS region you deploy the stack to.
2. If SES is still in sandbox, recipients must also be verified. Request production access when ready for real marketing sends.
3. Have AWS CLI and AWS SAM CLI available.

## Deploy
From this directory:

```bash
export AWS_REGION=ap-southeast-1
export SES_FROM_EMAIL='verified-sender@example.com'
export ORIGIN_SECRET="$(openssl rand -hex 32)"

sam build --template-file infra/template.yaml
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name workverse-mail \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides SesFromEmail="$SES_FROM_EMAIL" OriginSecret="$ORIGIN_SECRET" \
  --region "$AWS_REGION"
```

Get outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name workverse-mail \
  --query 'Stacks[0].Outputs' \
  --output table \
  --region "$AWS_REGION"
```

Upload frontend (replace BUCKET with the FrontendBucket output):

```bash
aws s3 sync frontend/ s3://BUCKET/ --delete --region "$AWS_REGION"
```

Invalidate CloudFront after changes:

```bash
aws cloudfront create-invalidation --distribution-id DISTRIBUTION_ID --paths '/*'
```

## Important
The application intentionally limits a single send request to 100 recipients. If the product grows beyond that, add SQS and process recipients asynchronously rather than making the first version more complex.
