import { useNavigate } from "react-router-dom";
import { Typography, Button } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
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
        sx={{ color: "#fff", fontWeight: 800, mb: 2, lineHeight: 1.15, fontSize: { xs: "2rem", sm: "3rem" } }}
      >
        <span style={{ color: "#8b5cf6" }}>AI Marketing Agent</span>
      </Typography>

      <p className="welcome-subtitle">
        Create stunning marketing content in seconds.
      </p>

      <Button
        onClick={() => navigate("/dashboard")}
        variant="contained"
        size="large"
        startIcon={<RocketLaunchIcon />}
        sx={{
          bgcolor: "#7c3aed", px: 5, py: 1.75, borderRadius: 3,
          fontSize: 16, fontWeight: 700, textTransform: "none",
          boxShadow: "0 0 40px rgba(124,58,237,0.45)",
          "&:hover": { bgcolor: "#6d28d9", boxShadow: "0 0 50px rgba(124,58,237,0.6)" },
        }}
      >
        Get Started
      </Button>
    </div>
  );
}
