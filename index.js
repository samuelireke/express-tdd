const app = require('./src/app');
const sequelize = require('./src/config/database');
const TokenService = require('./src/auth/TokenService');

async function startServer() {
  // Sync database
  await sequelize.sync();
  // cleanup expired tokens
  await TokenService.scheduledCleanup();
  // Start app
  app.listen(3000, () => {
    console.log('App started on port 3000');
  });
}
startServer();
