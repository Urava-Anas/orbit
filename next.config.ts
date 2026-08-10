import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "64kb",
    },
  },
  async redirects() {
    return [
      { source: "/orbit/privacy", destination: "/privacy", permanent: true },
      { source: "/certificates/:token", destination: "/credentials/:token", permanent: true },
      { source: "/dashboard/cash", destination: "/dashboard/finance", permanent: true },
      { source: "/dashboard/connect", destination: "/dashboard/integrations", permanent: true },

      { source: "/dashboard/leads/finder", destination: "/dashboard/lead-engine#lead-finder", permanent: true },
      { source: "/dashboard/leads", destination: "/dashboard/lead-engine", permanent: true },
      { source: "/dashboard/sales", destination: "/dashboard/lead-engine?view=pipeline", permanent: true },
      { source: "/lead-engine/sources/:source/:asset", destination: "/dashboard/lead-engine/sources/:source/:asset", permanent: true },
      { source: "/lead-engine/sources/:source", destination: "/dashboard/lead-engine/sources/:source", permanent: true },
      { source: "/lead-engine", destination: "/dashboard/lead-engine", permanent: true },

      { source: "/dashboard/foundry/attendance", destination: "/dashboard/development/attendance", permanent: true },
      { source: "/dashboard/foundry/classes", destination: "/dashboard/development/sessions", permanent: true },
      { source: "/dashboard/foundry/integrations", destination: "/dashboard/integrations", permanent: true },
      { source: "/dashboard/foundry/map", destination: "/dashboard/development/journey", permanent: true },
      { source: "/dashboard/foundry/more", destination: "/dashboard/development?panel=settings", permanent: true },
      { source: "/dashboard/foundry/notes", destination: "/dashboard/development/notes", permanent: true },
      { source: "/dashboard/foundry/operations", destination: "/dashboard/development/operations", permanent: true },
      { source: "/dashboard/foundry/progress", destination: "/dashboard/development/journey", permanent: true },
      { source: "/dashboard/foundry/students/:id/notes", destination: "/dashboard/people/:id?tab=notes", permanent: true },
      { source: "/dashboard/foundry/students/:id/portal", destination: "/dashboard/people/:id?view=member", permanent: true },
      { source: "/dashboard/foundry/students/:id", destination: "/dashboard/people/:id", permanent: true },
      { source: "/dashboard/foundry/students", destination: "/dashboard/people", permanent: true },
      { source: "/dashboard/foundry/studio", destination: "/dashboard/projects?view=delivery", permanent: true },
      { source: "/dashboard/foundry/submissions", destination: "/dashboard/reviews", permanent: true },
      { source: "/dashboard/foundry/tasks", destination: "/dashboard/tasks", permanent: true },
      { source: "/dashboard/foundry", destination: "/dashboard/development", permanent: true },

      { source: "/learn/classes", destination: "/portal/sessions", permanent: true },
      { source: "/learn/learn", destination: "/portal/tasks", permanent: true },
      { source: "/learn/notes", destination: "/portal/resources", permanent: true },
      { source: "/learn/profile", destination: "/portal/profile", permanent: true },
      { source: "/learn/progress", destination: "/portal/journey", permanent: true },
      { source: "/learn/resources", destination: "/portal/resources", permanent: true },
      { source: "/learn/studio", destination: "/portal/work", permanent: true },
      { source: "/learn/submit", destination: "/portal/tasks", permanent: true },
      { source: "/learn/tasks", destination: "/portal/tasks", permanent: true },
      { source: "/learn", destination: "/portal", permanent: true },
      { source: "/progression", destination: "/portal/journey", permanent: true },
      { source: "/progression-preview", destination: "/portal/journey", permanent: true },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/privacy", destination: "/orbit/privacy" },
        { source: "/credentials/:token", destination: "/certificates/:token" },
        { source: "/dashboard/finance", destination: "/dashboard/cash" },
        { source: "/dashboard/integrations", destination: "/dashboard/connect" },

        {
          source: "/dashboard/development",
          has: [{ type: "query", key: "panel", value: "settings" }],
          destination: "/dashboard/foundry/more",
        },
        { source: "/dashboard/development/attendance", destination: "/dashboard/foundry/attendance" },
        { source: "/dashboard/development/sessions", destination: "/dashboard/foundry/classes" },
        { source: "/dashboard/development/journey", destination: "/dashboard/foundry/map" },
        { source: "/dashboard/development/notes", destination: "/dashboard/foundry/notes" },
        { source: "/dashboard/development/operations", destination: "/dashboard/foundry/operations" },
        { source: "/dashboard/development", destination: "/dashboard/foundry" },

        {
          source: "/dashboard/people/:id",
          has: [{ type: "query", key: "view", value: "member" }],
          destination: "/dashboard/foundry/students/:id/portal?view=student",
        },
        {
          source: "/dashboard/people/:id",
          has: [{ type: "query", key: "tab", value: "notes" }],
          destination: "/dashboard/foundry/students/:id/notes",
        },
        { source: "/dashboard/people/:id", destination: "/dashboard/foundry/students/:id" },
        { source: "/dashboard/people", destination: "/dashboard/foundry/students" },

        {
          source: "/dashboard/projects",
          has: [{ type: "query", key: "view", value: "delivery" }],
          destination: "/dashboard/foundry/studio",
        },
        { source: "/dashboard/reviews", destination: "/dashboard/foundry/submissions" },
        { source: "/dashboard/tasks", destination: "/dashboard/foundry/tasks" },

        { source: "/portal/sessions", destination: "/learn/classes" },
        { source: "/portal/profile", destination: "/learn/profile" },
        { source: "/portal/journey", destination: "/learn/progress" },
        { source: "/portal/resources", destination: "/learn/resources" },
        { source: "/portal/work", destination: "/learn/studio" },
        { source: "/portal/tasks", destination: "/learn/tasks" },
        { source: "/portal", destination: "/learn" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        ],
      },
    ];
  },
};

export default nextConfig;
