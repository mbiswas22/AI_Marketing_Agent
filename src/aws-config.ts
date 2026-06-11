import { Amplify } from "aws-amplify";
 
Amplify.configure({
 Auth: {
   Cognito: {
     userPoolId: "us-east-2_lhZuTGjJM",
     userPoolClientId: "3untuo8qkqrnapqvb9kml02mg1",
   }
 }
});
