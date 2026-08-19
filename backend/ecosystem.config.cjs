module.exports = {
  apps: [
    {
      name: "gnatsupreme-backend",
      script: "dist/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      kill_timeout: 15000,
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
