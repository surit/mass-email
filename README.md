# Workverse Mail - standalone minimal email marketing app

## AWS architecture

S3 (private) -> CloudFront (HTTPS) -> browser
API calls -> CloudFront -> API Gateway HTTP API -> Lambda
Lambda -> SES + dedicated DynamoDB table
Authentication -> Cognito User Pool -> API Gateway JWT authorizer

No Amplify, EC2, RDS, VPC, NAT Gateway or existing Workverse backend resources are required.

## Deploy

Region: ap-southeast-1
Stack: workverse-mail

1. Validate/build:
   sam validate --template-file infra/template.yaml --lint
   sam build --template-file infra/template.yaml

2. Deploy:
   sam deploy --template-file .aws-sam/build/template.yaml \
     --stack-name workverse-mail \
     --capabilities CAPABILITY_IAM \
     --parameter-overrides SesFromEmail="marketing@workverse.me" \
     --region ap-southeast-1

3. Get outputs:
   aws cloudformation describe-stacks --stack-name workverse-mail \
     --region ap-southeast-1 --query 'Stacks[0].Outputs' --output table

4. Create the first user (after deployment):
   aws cognito-idp admin-create-user \
     --user-pool-id <USER_POOL_ID> \
     --username surit.aryal@workverse.me \
     --user-attributes Name=email,Value=surit.aryal@workverse.me Name=email_verified,Value=true \
     --temporary-password '<TEMPORARY_PASSWORD>' \
     --region ap-southeast-1

Use a strong temporary password. Cognito will require the user to set a new password at first sign-in.

5. Configure frontend/config.js:
   userPoolId: output UserPoolId
   clientId: output UserPoolClientId

6. Upload:
   aws s3 sync frontend/ s3://<FRONTEND_BUCKET>/ --delete --region ap-southeast-1

7. Open the CloudFrontUrl.

## SES sandbox

Until SES production access is approved, recipients must be verified in SES. The verified sender is marketing@workverse.me because the domain is verified.

## Notes

- Initial send limit is 100 recipients per request.
- Send history is stored in DynamoDB.
- Preview is local and does not send.
- CSV upload extracts email addresses from the file in the browser.
