const nodemailer = require('nodemailer');
const transporter = require('../config/emailTransporter');
const logger = require('../logger');

const sendAccountActivation = async (email, token) => {
  const info = await transporter.sendMail({
    from: 'My App <info@my-app.com',
    to: email,
    subject: 'Account Activation',
    html: `
      <div>
      <b>Please click the below link to activate your acount</b>
      </div>
      <div>Token is ${token} </div>
      `,
  });
  logger.info('url: ', nodemailer.getTestMessageUrl(info));
};

const sendPasswordReset = async (email, token) => {
  const info = await transporter.sendMail({
    from: 'My App <info@my-app.com',
    to: email,
    subject: 'Password Reset',
    html: `
      <div>
      <b>Please click the below link to reset your password</b>
      </div>
      <div> Token is ${token} </div>
      <a href = "http://localhost:8080/#/password-reset?reset${token}">Reset</a>
      `,
    // client PORT => 8080
  });
  logger.info('url: ', nodemailer.getTestMessageUrl(info));
};

module.exports = { sendAccountActivation, sendPasswordReset };
