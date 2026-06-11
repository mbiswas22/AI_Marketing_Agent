import "./aws-config";
import React from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import {
  Box,
  Button,
  Container,
  Typography,
  Paper,
  Avatar,
  Chip,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CampaignIcon from "@mui/icons-material/Campaign";
import InsightsIcon from "@mui/icons-material/Insights";
import LogoutIcon from "@mui/icons-material/Logout";

function WelcomeDashboard({
  username,
  signOut,
}: {
  username: string;
  signOut: () => void;
}) {
  const features = [
    {
      icon: <CampaignIcon fontSize="large" sx={{ color: "#6366f1" }} />,
      title: "Campaign Generator",
      desc: "Create targeted marketing campaigns powered by AI.",
    },
    {
      icon: <InsightsIcon fontSize="large" sx={{ color: "#6366f1" }} />,
      title: "Performance Insights",
      desc: "Analyze results and optimize your strategy in real time.",
    },
    {
      icon: <AutoAwesomeIcon fontSize="large" sx={{ color: "#6366f1" }} />,
      title: "AI Copywriting",
      desc: "Generate compelling ad copy, emails, and social posts instantly.",
    },
  ];

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        py: 6,
        px: 2,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          width: "100%",
          maxWidth: 900,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 6,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AutoAwesomeIcon sx={{ color: "#a78bfa", fontSize: 28 }} />
          <Typography variant="h6" sx={{ color: "#fff", fontWeight: 700 }}>
            MarketingAI
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Avatar sx={{ bgcolor: "#6366f1", width: 36, height: 36, fontSize: 14 }}>
            {username.charAt(0).toUpperCase()}
          </Avatar>
          <Typography sx={{ color: "#c4b5fd", fontSize: 14 }}>
            {username}
          </Typography>
          <Button
            onClick={signOut}
            startIcon={<LogoutIcon />}
            size="small"
            sx={{
              color: "#a78bfa",
              borderColor: "#6366f1",
              textTransform: "none",
              "&:hover": { borderColor: "#a78bfa", color: "#fff" },
            }}
            variant="outlined"
          >
            Sign Out
          </Button>
        </Box>
      </Box>

      {/* Hero */}
      <Container maxWidth="md" sx={{ textAlign: "center", mb: 8 }}>
        <Chip
          label="Powered by AI"
          icon={<AutoAwesomeIcon sx={{ fontSize: "14px !important" }} />}
          sx={{
            mb: 3,
            bgcolor: "rgba(99,102,241,0.2)",
            color: "#a78bfa",
            border: "1px solid #6366f1",
            fontWeight: 600,
          }}
        />
        <Typography
          variant="h3"
          sx={{
            color: "#fff",
            fontWeight: 800,
            mb: 2,
            lineHeight: 1.2,
          }}
        >
          Welcome back,{" "}
          <Box component="span" sx={{ color: "#a78bfa" }}>
            {username}
          </Box>
          .
        </Typography>
        <Typography
          variant="h6"
          sx={{ color: "#94a3b8", fontWeight: 400, mb: 4 }}
        >
          Your AI marketing agent is ready to supercharge your campaigns.
        </Typography>
        <Button
          variant="contained"
          size="large"
          startIcon={<CampaignIcon />}
          sx={{
            bgcolor: "#6366f1",
            px: 4,
            py: 1.5,
            borderRadius: 3,
            textTransform: "none",
            fontWeight: 700,
            fontSize: 16,
            "&:hover": { bgcolor: "#4f46e5" },
          }}
        >
          Start a Campaign
        </Button>
      </Container>

      {/* Feature Cards */}
      <Container maxWidth="md">
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
            gap: 3,
          }}
        >
          {features.map((f) => (
            <Paper
              key={f.title}
              elevation={0}
              sx={{
                p: 3,
                borderRadius: 3,
                bgcolor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(99,102,241,0.3)",
                backdropFilter: "blur(10px)",
                transition: "transform 0.2s, border-color 0.2s",
                "&:hover": {
                  transform: "translateY(-4px)",
                  borderColor: "#6366f1",
                },
              }}
            >
              <Box sx={{ mb: 2 }}>{f.icon}</Box>
              <Typography
                variant="subtitle1"
                sx={{ color: "#fff", fontWeight: 700, mb: 1 }}
              >
                {f.title}
              </Typography>
              <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                {f.desc}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Container>
    </Box>
  );
}

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <WelcomeDashboard
          username={user?.username ?? "User"}
          signOut={signOut ?? (() => {})}
        />
      )}
    </Authenticator>
  );
}

export default App;
