const path = require('path');

module.exports = {
  apps: [{
    name: 'gantt-api',
    script: path.join(__dirname, 'backend/src/server.js'),
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
    },
    env_file: path.join(__dirname, 'backend/.env'),
  }],
};
