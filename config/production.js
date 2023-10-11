module.exports = {
  database: {
    database: 'express-tdd',
    username: 'my-db-user',
    password: 'db-p4ssw0rd',
    dialect: 'sqlite',
    storage: './prod-db.sqlite',
    logging: false,
  },
  mail: {
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
      user: 'violette79@ethereal.email',
      pass: 'Fm86PnFPWS15R8s8gx',
    },
  },
  uploadDir: 'uploads',
  profileDir: 'profile',
};
