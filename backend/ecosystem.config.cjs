module.exports = {
  apps: [
    {
      // HTTP API. Cluster mode forks one worker process per CPU core (or a fixed count, see
      // deployment.md) — each gets its own Prisma connection pool, so check PostgreSQL's
      // max_connections before raising `instances` on a multi-core box.
      name: "gnatsupreme-backend",
      script: "dist/server.js",
      cwd: __dirname,
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      max_memory_restart: "512M",
      kill_timeout: 15000,
      env_production: {
        NODE_ENV: "production",
      },
    },
    {
      // BullMQ job processor (report20 + member-import queues) — a separate process from the API
      // so CPU-bound Excel/CSV parsing never shares an event loop with requests being served.
      // Fork mode, not cluster: BullMQ's own `concurrency` option (WORKER_CONCURRENCY env var)
      // already parallelizes job processing within one process: cluster mode here would just add
      // more independent consumers competing for the same queue, which BullMQ supports but which
      // isn't needed until job throughput, not request throughput, becomes the bottleneck.
      name: "gnatsupreme-worker",
      script: "dist/worker.js",
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
