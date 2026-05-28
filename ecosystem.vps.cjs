module.exports = {
  apps: [
    {
      name: 'wa-backend',
      script: 'src/server.js',
      cwd: '/opt/whatsapp-scheduler/backend',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        ANTHROPIC_API_KEY: 'COLE_SUA_CHAVE_AQUI',
      },
    },
  ],
};
