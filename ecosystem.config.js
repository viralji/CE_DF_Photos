const path = require('path');

module.exports = {
  apps: [{
    name: 'ce-df-photos',
    script: 'npm',
    args: 'run start',
    cwd: path.resolve(__dirname),
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || '3001'
    },
    autorestart: true,
    max_memory_restart: '1G',
    watch: false,
  }]
};
