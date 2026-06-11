import { Amplify } from "aws-amplify";
 
Amplify.configure({
 Auth: {
   Cognito: {
     userPoolId: "USER_POOL_ID",
     userPoolClientId: "CLIENT_ID",
   }
 }
});
