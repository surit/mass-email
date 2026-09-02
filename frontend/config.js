/*
  Fill these values after CloudFormation deployment.

  These are NOT secrets. Cognito browser app clients intentionally
  use a public client ID with no client secret.
*/
window.WORKVERSE_MAIL_CONFIG = {
  region: "ap-southeast-1",
  userPoolId: "REPLACE_USER_POOL_ID",
  clientId: "REPLACE_USER_POOL_CLIENT_ID"
};
