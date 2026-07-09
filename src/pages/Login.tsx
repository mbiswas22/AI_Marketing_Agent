import { useEffect } from "react";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import { useNavigate } from "react-router-dom";
import { Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import "../styles/login.css";

export default function Login() {
  const { authStatus } = useAuthenticator();
  const navigate = useNavigate();

  useEffect(() => {
    if (authStatus === "authenticated") {
      const redirect =
        sessionStorage.getItem("redirectAfterLogin") || "/welcome";
      sessionStorage.removeItem("redirectAfterLogin");
      navigate(redirect, { replace: true });
    }
  }, [authStatus, navigate]);

  return (
    <div className="login-page">
      <div className="login-brand">
        <AutoAwesomeIcon sx={{ color: "#8b5cf6", fontSize: 30 }} />
        <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 22 }}>
          MarketingAI
        </Typography>
      </div>
      <Authenticator />
    </div>
  );
}
