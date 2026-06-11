import { Amplify } from "aws-amplify";
 
Amplify.configure({
 Auth: {
   Cognito: {
     userPoolId: "us-east-2_lhZuTGjJM",
     userPoolClientId: "qjti4kk202o1ircscfl0j93h8",
   }
 }
});
