import { useNavigate } from "react-router-dom";
import { Typography, Button, Box } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import BusinessCenterIcon from "@mui/icons-material/BusinessCenter";
import "../styles/welcome.css";

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="welcome-page">
      <div className="welcome-badge">
        <AutoAwesomeIcon sx={{ color: "#a78bfa", fontSize: 16 }} />
        <span className="welcome-badge-text">AI-Powered Marketing</span>
      </div>

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
        <span style={{ color: "#8b5cf6" }}>AI Marketing Agent</span>
      </Typography>

      <p className="welcome-subtitle">
        Create stunning marketing content in seconds.
      </p>

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          gap: 2,
          alignItems: "center",
        }}
      >
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
            "&:hover": {
              bgcolor: "#6d28d9",
              boxShadow: "0 0 50px rgba(124,58,237,0.6)",
            },
          }}
        >
          Get Started
        </Button>

        <Button
          onClick={() => navigate("/onboard")}
          variant="outlined"
          size="large"
          startIcon={<BusinessCenterIcon />}
          sx={{
            borderColor: "rgba(167,139,250,0.5)",
            color: "#a78bfa",
            px: 4,
            py: 1.75,
            borderRadius: 3,
            fontSize: 16,
            fontWeight: 700,
            textTransform: "none",
            backdropFilter: "blur(8px)",
            bgcolor: "rgba(139,92,246,0.08)",
            "&:hover": {
              borderColor: "#a78bfa",
              bgcolor: "rgba(139,92,246,0.18)",
              boxShadow: "0 0 30px rgba(167,139,250,0.25)",
            },
          }}
        >
          Onboard Business
        </Button>
      </Box>
    </div>
  );
}
