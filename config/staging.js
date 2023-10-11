module.exports = {
  database: {
    database: 'express-tdd',
    username: 'my-db-user', //'postgres'
    password: 'admin123',
    host: 'localhost',
    dialect: 'sqlite', //'postgres'
    storage: './staging-db.sqlite',
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
  uploadDir: 'uploads-staging',
  profileDir: 'profile',
};
