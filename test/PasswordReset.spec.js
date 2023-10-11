const request = require('supertest');
const app = require('../src/app');
const User = require('../src/user/User');
const sequelize = require('../src/config/database');
const bcrypt = require('bcrypt');
const SMTPServer = require('smtp-server').SMTPServer;
const config = require('config');
const Token = require('../src/auth/Token');

let server, lastMail;
let simulateSmtpFailure = false;

beforeAll(async () => {
  server = new SMTPServer({
    authOptional: true,
    onData(stream, session, callback) {
      let mailBody;
      stream.on('data', (data) => {
        mailBody += data.toString();
      });
      stream.on('end', () => {
        if (simulateSmtpFailure) {
          const err = new Error('Invalid mailbox');
          err.responseCode = 553;
          return callback(err);
        }
        lastMail = mailBody;
        callback();
      });
    },
  });
  server.listen(config.mail.port, 'localhost');

  if (process.env.NODE_ENV === 'test') {
    await sequelize.sync();
  }
  jest.setTimeout(20000);
});
beforeEach(async () => {
  simulateSmtpFailure = false;
  await User.destroy({ truncate: { cascade: true } });
});

afterAll(async () => {
  await server.close();
  jest.setTimeout(5000);
});
const activeUser = {
  username: `user1`,
  email: `user1@email.com`,
  password: 'P4ssword',
  inactive: false,
};
const addUser = async (user = { ...activeUser }) => {
  const hash = await bcrypt.hash(user.password, 10);
  return await User.create({ ...user, password: hash });
};

const postPasswordReset = (email = 'user1@email.com', options = {}) => {
  const agent = request(app).post('/api/1.0/user/password');
  return agent.send({ email: email });
};

const putPasswordUpdate = (body = {}, options = {}) => {
  const agent = request(app).put('/api/1.0/user/password');
  return agent.send(body);
};

describe('Password Reset Request', () => {
  it('returns 404 when password reset is sent for unknown email', async () => {
    const response = await postPasswordReset();
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Email not found');
  });
  it.each`
    field      | value            | expectedMessage
    ${'email'} | ${null}          | ${'Email cannot be null'}
    ${'email'} | ${'user1@email'} | ${'Email is not valid'}
  `(
    'returns 400 with error reponse message $expectedMessage when $field is $value',
    async ({ field, value, expectedMessage }) => {
      const response = await postPasswordReset(value);
      expect(response.status).toBe(400);
      expect(response.body.validationErrors[field]).toBe(expectedMessage);
    },
  );
  it('returns 200 ok when password reset is sent for valid email', async () => {
    const user = await addUser();
    const response = await postPasswordReset(user.email);
    expect(response.status).toBe(200);
  });
  it('returns success response body with message "Password reset has been sent to email" when password reset is sent for valid email', async () => {
    const user = await addUser();
    const response = await postPasswordReset(user.email);
    expect(response.body.message).toBe('Password reset has been sent to email');
  });
  it('creates passwordResetToken when password reset is sent for valid email', async () => {
    const user = await addUser();
    await postPasswordReset(user.email);
    const userInDB = await User.findOne({ where: { email: user.email } });
    expect(userInDB.passwordResetToken).toBeTruthy();
  });
  it('sends a password reset email with passwordResetToken', async () => {
    const user = await addUser();
    await postPasswordReset(user.email);
    const userInDB = await User.findOne({ where: { email: user.email } });
    const passwordResetToken = userInDB.passwordResetToken;
    expect(lastMail).toContain('user1@email.com');
    expect(lastMail).toContain(passwordResetToken);
  });
  it('returns 502 Bad Gateway when sending email fails', async () => {
    simulateSmtpFailure = true;
    const user = await addUser();
    const response = await postPasswordReset(user.email);
    expect(response.status).toBe(502);
  });
});

describe('Password Update', () => {
  it('returns 403 when password update does not have the valid password reset token', async () => {
    const response = await putPasswordUpdate({
      password: 'P4ssword',
      passwordResetToken: 'abcd',
    });
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(
      'You are not authorised to update your password',
    );
  });
  it('returns 403 when password update request with invalid password pattern or the invalid reset token', async () => {
    const response = await putPasswordUpdate({
      password: 'not-valid',
      passwordResetToken: 'abcd',
    });
    expect(response.status).toBe(403);
  });

  it('returns 400 when trying to update password and the rest token is valid', async () => {
    const user = await addUser();
    user.passwordResetToken = 'test-token';
    await user.save();
    const response = await putPasswordUpdate({
      password: 'not-valid',
      passwordResetToken: 'test-token',
    });
    expect(response.status).toBe(400);
  });
  it.each`
    value              | message
    ${null}            | ${'Password cannot be null'}
    ${'P4ss'}          | ${'Password must be atleast 6 characters'}
    ${'alllowercase'}  | ${'Password must be atleast 1 uppercase, 1lowercase and 1 number'}
    ${'ALLUPPERCASE'}  | ${'Password must be atleast 1 uppercase, 1lowercase and 1 number'}
    ${'123456789'}     | ${'Password must be atleast 1 uppercase, 1lowercase and 1 number'}
    ${'lower4nd44444'} | ${'Password must be atleast 1 uppercase, 1lowercase and 1 number'}
    ${'UPPER444444'}   | ${'Password must be atleast 1 uppercase, 1lowercase and 1 number'}
    ${'lowerandUPPER'} | ${'Password must be atleast 1 uppercase, 1lowercase and 1 number'}
  `('returns $message when password is $value', async ({ message, value }) => {
    const user = await addUser();
    user.passwordResetToken = 'test-token';
    await user.save();
    const response = await putPasswordUpdate({
      password: value,
      passwordResetToken: 'test-token',
    });
    expect(response.body.validationErrors.password).toBe(message);
  });
  it('returns 200 when valid password is sent with valid reset token', async () => {
    const user = await addUser();
    user.passwordResetToken = 'test-token';
    await user.save();
    const response = await putPasswordUpdate({
      password: 'N3w-password',
      passwordResetToken: 'test-token',
    });
    expect(response.status).toBe(200);
  });
  it('updates password in database when request is valid', async () => {
    const user = await addUser();
    user.passwordResetToken = 'test-token';
    await user.save();
    await putPasswordUpdate({
      password: 'N3w-password',
      passwordResetToken: 'test-token',
    });
    const userInDB = await User.findOne({
      where: { email: user.email },
    });
    expect(userInDB.password).not.toEqual(user.password);
  });
  it('clears the reset token in database when the request is valid', async () => {
    const user = await addUser();
    user.passwordResetToken = 'test-token';
    await user.save();
    await putPasswordUpdate({
      password: 'N3w-password',
      passwordResetToken: 'test-token',
    });
    const userInDB = await User.findOne({
      where: { email: user.email },
    });
    expect(userInDB.passwordResetToken).toBeFalsy();
  });
  it('activates and clears activation token if  the account is inactive after valid password reset.', async () => {
    const user = await addUser();
    user.passwordResetToken = 'test-token';
    user.activationToken = 'activation-token';
    user.inactive = true;
    await user.save();
    await putPasswordUpdate({
      password: 'N3w-password',
      passwordResetToken: 'test-token',
    });
    const userInDB = await User.findOne({
      where: { email: user.email },
    });
    expect(userInDB.activationToken).toBeFalsy();
    expect(userInDB.inactive).toBe(false);
  });
  it('clears all token of user after valid password reset', async () => {
    const user = await addUser();
    user.passwordResetToken = 'test-token';
    await user.save();
    await Token.create({
      token: 'token-1',
      userId: user.id,
      lastUsedAt: Date.now(),
    });
    await putPasswordUpdate({
      password: 'N3w-password',
      passwordResetToken: 'test-token',
    });
    const tokens = await Token.findAll({
      where: { userId: user.id },
    });
    expect(tokens.length).toBe(0);
  });
});
