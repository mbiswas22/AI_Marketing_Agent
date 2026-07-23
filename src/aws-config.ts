import { Amplify } from "aws-amplify";
 
Amplify.configure({
 Auth: {
   Cognito: {
    userPoolId: "us-east-2_lhZuTGjJM",
     userPoolClientId: "3untuo8qkqrnapqvb9kml02mg1",
   }
 }
});

// DEV
// userPoolId: "us-east-2_lhZuTGjJM",
// userPoolClientId: "3untuo8qkqrnapqvb9kml02mg1",


// PROD
// userPoolId: "us-east-2_6NHWemfdZ",
// userPoolClientId: "4kd865mgqkkv0p0jde6f5akq3n",

