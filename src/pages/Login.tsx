import React, { useEffect } from "react";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import { useNavigate } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

export default function Login() {
  const { authStatus } = useAuthenticator();
  const navigate = useNavigate();

  useEffect(() => {
    if (authStatus === "authenticated") navigate("/welcome");
  }, [authStatus, navigate]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#0f0f0f",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <AutoAwesomeIcon sx={{ color: "#8b5cf6", fontSize: 30 }} />
        <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 22 }}>
          MarketingAI
        </Typography>
      </Box>
      <Authenticator />
    </Box>
  );
}