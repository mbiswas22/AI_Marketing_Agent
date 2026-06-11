import { useAuthenticator } from "@aws-amplify/ui-react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Button } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at top, #1e0a3c 0%, #0f0f0f 60%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        px: 3,
      }}
    >
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 1,
          bgcolor: "rgba(139,92,246,0.15)",
          border: "1px solid rgba(139,92,246,0.4)",
          borderRadius: 5,
          px: 2,
          py: 0.75,
          mb: 4,
        }}
      >
        <AutoAwesomeIcon sx={{ color: "#a78bfa", fontSize: 16 }} />
        <Typography sx={{ color: "#a78bfa", fontSize: 13, fontWeight: 600 }}>
          AI-Powered Marketing
        </Typography>
      </Box>

      <Typography
        variant="h2"
        sx={{
          color: "#fff",
          fontWeight: 800,
          mb: 2,
          lineHeight: 1.15,
          fontSize: { xs: "2rem", sm: "3rem" },
        }}
      >
        <Box component="span" sx={{ color: "#8b5cf6" }}>
          AI Marketing Agent
        </Box>
      </Typography>

      <Typography
        sx={{
          color: "#64748b",
          fontSize: 18,
          mb: 5,
          maxWidth: 480,
          lineHeight: 1.6,
        }}
      >
        Create stunning marketing content in seconds.
      </Typography>

      <Button
        onClick={() => navigate("/dashboard")}
        variant="contained"
        size="large"
        startIcon={<RocketLaunchIcon />}
        sx={{
          bgcolor: "#7c3aed",
          px: 5,
          py: 1.75,
          borderRadius: 3,
          fontSize: 16,
          fontWeight: 700,
          textTransform: "none",
          boxShadow: "0 0 40px rgba(124,58,237,0.45)",
          "&:hover": { bgcolor: "#6d28d9", boxShadow: "0 0 50px rgba(124,58,237,0.6)" },
        }}
      >
        Get Started
      </Button>
    </Box>
  );
}