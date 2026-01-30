module.exports = {
  apps: [{
    name: 'ce-df-photos',
    script: 'npm',
    args: 'start',
    cwd: process.cwd(),
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    autorestart: true,
    max_memory_restart: '1G',
    watch: false
  }]
};
