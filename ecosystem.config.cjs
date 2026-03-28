module.exports = {
  apps: [
    {
      name: 'wa-backend',
      script: 'src/server.js',
      cwd: 'C:/Users/MKT/Desktop/GIT/whatsapp-scheduler/backend',
      restart_delay: 3000,
      max_restarts: 20,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
    {
      name: 'wa-frontend',
      script: 'C:/Users/MKT/Desktop/GIT/whatsapp-scheduler/frontend/node_modules/vite/bin/vite.js',
      args: 'C:/Users/MKT/Desktop/GIT/whatsapp-scheduler/frontend --port 5173',
      cwd: 'C:/Users/MKT/Desktop/GIT/whatsapp-scheduler/frontend',
      restart_delay: 3000,
      max_restarts: 20,
      autorestart: true,
      watch: false,
    },
  ],
};
