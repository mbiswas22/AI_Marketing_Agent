import { Amplify } from "aws-amplify";
 
Amplify.configure({
 Auth: {
   Cognito: {
     userPoolId: "us-east-2_6NHWemfdZ",
     userPoolClientId: "4kd865mgqkkv0p0jde6f5akq3n",
   }
 }
});

