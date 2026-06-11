import "./aws-config";
import React from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";

function App() {
  return <><Authenticator>
     {({ signOut, user }) => (
 
       <>
         <h2>
           Welcome {user?.username}
         </h2>
 
         <button onClick={signOut}>
           Sign Out
         </button>
       </>
     )}
   </Authenticator>
</>;
}

export default App;
