# Workverse Mail

A standalone email marketing application built on AWS.

## Structure

- `frontend/` — Static HTML/CSS/JS files (upload to S3)
- `infra/template.yaml` — SAM/CloudFormation template

## Deployment

1. Deploy the infrastructure:
   ```bash
   sam build && sam deploy --guided
   ```

2. Update `frontend/config.js` with the Cognito IDs from the stack outputs.

3. Upload the frontend files to the S3 bucket created by the stack.

4. Invalidate the CloudFront distribution if needed.

## Features

- Bulk email campaigns (unlimited recipients via chunked uploads)
- Rich-text HTML editor with inline images
- File attachments (PDF, CSV, TXT, etc.)
- Hyperlinks on text and images
- CSV contact import
- Campaign progress tracking
- Cognito authentication
