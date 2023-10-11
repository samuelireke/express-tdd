module.exports = {
  database: {
    database: 'express-tdd',
    username: 'my-db-user',
    password: 'db-p4ssw0rd',
    dialect: 'sqlite',
    storage: ':memory:',
    journalMode: 'MEMORY',
    logging: false,
  },
  mail: {
    host: 'localhost',
    port: Math.floor(Math.random() * 2000) + 10000,
    tls: {
      rejectUnauthorized: false,
    },
    debug: true,
  },
  uploadDir: 'uploads-tests',
  profileDir: 'profile',
};
