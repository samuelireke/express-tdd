const request = require('supertest');
const app = require('../src/app');
const User = require('../src/user/User');
const sequelize = require('../src/config/database');
const EmailService = require('../src/email/EmailService');
const SMTPServer = require('smtp-server').SMTPServer;
// const SMTPServer = require('../src/config/smtpServer');
const config = require('config');
let lastMail, server;
let simulateSmtpFailure = false;
beforeAll(async () => {
  // [server, lastMail] = SMTPServer.getServer(simulateSmtpFailure);
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
const validUser = {
  username: 'user1',
  email: 'user1@email.com',
  password: 'P4ssword',
};
const postUser = (user = validUser) => {
  return request(app).post('/api/1.0/users').send(user);
};
describe('User Registration', () => {
  test('returns 200 OK when signup request is valid', async () => {
    const response = await postUser();
    expect(response.status).toBe(200);
  });

  test('returns success message when signup request is valid', async () => {
    const response = await postUser();
    expect(response.body.message).toBe('User created');
  });

  test('saves the user to database', async () => {
    await postUser();

    // Query user table
    const userList = await User.findAll();
    expect(userList.length).toBe(1);
  });

  test('saves the username and email to database', async () => {
    await postUser();

    // Query user table
    const userList = await User.findAll();
    const savedUser = userList[0];
    expect(savedUser.username).toBe('user1');
    expect(savedUser.email).toBe('user1@email.com');
  });

  test('hashes the password in database', async () => {
    await postUser();

    // Query user table
    const userList = await User.findAll();
    const savedUser = userList[0];
    expect(savedUser.username).toBe('user1');
    expect(savedUser.password).not.toBe('P4ssword');
  });

  it('returns 400 when username is null', async () => {
    const response = await postUser({
      username: null,
      email: 'user1@email.com',
      password: 'P4ssword',
    });
    expect(response.status).toBe(400);
  });

  it('returns ValidationErrors field in reponse body when validation error occurs', async () => {
    const response = await postUser({
      username: null,
      email: 'user1@email.com',
      password: 'P4ssword',
    });
    const body = response.body;
    expect(body.validationErrors).not.toBeUndefined();
  });

  it.each([
    ['username', 'Username cannot be null'],
    ['email', 'Email cannot be null'],
    ['password', 'Password cannot be null'],
  ])('when %s is null %s is received', async (field, expectedMessage) => {
    const user = { ...validUser };
    user[field] = null;
    const response = await postUser(user);
    const body = response.body;
    expect(body.validationErrors[field]).toBe(expectedMessage);
  });
  //alternatively we can do this...
  it.each`
    field         | value              | expectedMessage
    ${'username'} | ${null}            | ${'Username cannot be null'}
    ${'username'} | ${'usr'}           | ${'Must have min 4 and max 32 characters'}
    ${'username'} | ${'a'.repeat(33)}  | ${'Must have min 4 and max 32 characters'}
    ${'email'}    | ${null}            | ${'Email cannot be null'}
    ${'email'}    | ${'user.mail.com'} | ${'Email is not valid'}
    ${'email'}    | ${'user@mail'}     | ${'Email is not valid'}
    ${'password'} | ${null}            | ${'Password cannot be null'}
    ${'password'} | ${'P4ss'}          | ${'Password must be atleast 6 characters'}
    ${'password'} | ${'alllowercase'}  | ${'Password must be atleast 1 uppercase, 1lowercase and 1 number'}
    ${'password'} | ${'ALLUPPERCASE'}  | ${'Password must be atleast 1 uppercase, 1lowercase and 1 number'}
    ${'password'} | ${'123456789'}     | ${'Password must be atleast 1 uppercase, 1lowercase and 1 number'}
    ${'password'} | ${'lower4nd44444'} | ${'Password must be atleast 1 uppercase, 1lowercase and 1 number'}
    ${'password'} | ${'UPPER444444'}   | ${'Password must be atleast 1 uppercase, 1lowercase and 1 number'}
    ${'password'} | ${'lowerandUPPER'} | ${'Password must be atleast 1 uppercase, 1lowercase and 1 number'}
  `(
    'returns $expectedMessage when $field is $value',
    async ({ field, expectedMessage, value }) => {
      const user = { ...validUser };
      user[field] = value;
      const response = await postUser(user);
      const body = response.body;
      expect(body.validationErrors[field]).toBe(expectedMessage);
    },
  );

  it('returns errors when both username, email and password are null', async () => {
    const response = await postUser({
      username: null,
      email: null,
      password: null,
    });
    const body = response.body;
    /**
     * valiationErrors = {
     *  username: "...",
     *  email: "..."}
     */
    expect(Object.keys(body.validationErrors)).toEqual([
      'username',
      'email',
      'password',
    ]);
  });

  it('returns Email in use when same email is already in use', async () => {
    await User.create({ ...validUser });
    const response = await postUser();
    expect(response.body.validationErrors.email).toBe('Email already in use');
  });

  it('returns errors for both username is null and email is in use', async () => {
    await User.create({ ...validUser });
    const response = await postUser({
      username: null,
      email: validUser.email,
      password: 'P4ssword',
    });

    const body = response.body;
    expect(Object.keys(body.validationErrors)).toEqual(['username', 'email']);
  });

  it('creates user in inactive mode', async () => {
    await postUser();
    const users = await User.findAll();
    const savedUser = users[0];
    expect(savedUser.inactive).toBe(true);
  });

  it('creates user in inactive mode even if the request body contains inactive as false', async () => {
    const newUser = { ...validUser, inactive: false };
    await postUser(newUser);
    const users = await User.findAll();
    const savedUser = users[0];
    expect(savedUser.inactive).toBe(true);
  });

  it('creates an activationToken for user', async () => {
    await postUser();
    const users = await User.findAll();
    const savedUser = users[0];
    expect(savedUser.activationToken).toBeTruthy();
  });

  it('sends an Account activation email with activationToken', async () => {
    await postUser();
    const users = await User.findAll();
    const savedUser = users[0];
    expect(lastMail).toContain(validUser.email);
    expect(lastMail).toContain(savedUser.activationToken);
  });

  it('returns 502 bad gateway when sending email fails', async () => {
    simulateSmtpFailure = true;
    const response = await postUser();
    expect(response.status).toBe(502);
  });

  it('returns email failure message when sending email fails', async () => {
    simulateSmtpFailure = true;
    const response = await postUser();
    expect(response.body.message).toBe('Email Failure');
  });

  it('does not save user in database id activation email fails', async () => {
    simulateSmtpFailure = true;
    await postUser();
    const users = await User.findAll();
    expect(users.length).toBe(0);
  });
});

describe('Account Activation', () => {
  it('activates the account when the correct token is sent', async () => {
    await postUser();
    let users = await User.findAll();
    const token = users[0].activationToken;

    await request(app).post('/api/1.0/users/token/' + token);
    users = await User.findAll();
    expect(users[0].inactive).toBe(false);
  });

  it('removes the token from user table after successful activation', async () => {
    await postUser();
    let users = await User.findAll();
    const token = users[0].activationToken;

    await request(app).post('/api/1.0/users/token/' + token);
    users = await User.findAll();
    expect(users[0].inactive).toBeFalsy;
  });

  it('does not activate the account when the token is wrong', async () => {
    await postUser();
    const token = 'this-token-does-not-exist';
    const users = await User.findAll();
    await request(app).post('/api/1.0/users/token/' + token);
    expect(users[0].inactive).toBeTruthy;
  });

  it('returns bad request when token is wrong', async () => {
    await postUser();
    const token = 'this-token-does-not-exist';
    const response = await request(app).post('/api/1.0/users/token/' + token);
    expect(response.status).toBe(400);
  });
  it('returns Validation Failure message in error response body when validation fails', async () => {
    const user = { ...validUser, username: null };
    const response = await postUser(user);
    expect(response.body.message).toBe('Validation Failure');
  });
});

describe('Error Model', () => {
  it('returns path , timestamp, message and validationErrors in response with validation Errors', async () => {
    const response = await postUser({ ...validUser, username: null });
    const body = response.body;
    expect(Object.keys(body)).toEqual([
      'path',
      'timestamp',
      'message',
      'validationErrors',
    ]);
  });

  it('returns path, timestamp and message in response when request fails other than validaion errors', async () => {
    const token = 'this-token-does-not-exist';
    const response = await request(app).post('/api/1.0/users/token/' + token);
    const body = response.body;
    expect(Object.keys(body)).toEqual(['path', 'timestamp', 'message']);
  });

  it('returns path, in error body', async () => {
    const token = 'this-token-does-not-exist';
    const response = await request(app).post('/api/1.0/users/token/' + token);
    const body = response.body;
    expect(body.path).toEqual('/api/1.0/users/token/' + token);
  });
  it('returns timestamp in milliseconds within 5 secs value in error body', async () => {
    const nowInMills = new Date().getTime();
    const fiveSecondsLater = nowInMills + 5 * 1000;
    const token = 'this-token-does-not-exist';
    const response = await request(app).post('/api/1.0/users/token/' + token);
    const body = response.body;
    expect(body.timestamp).toBeGreaterThan(nowInMills);
    expect(body.timestamp).toBeLessThan(fiveSecondsLater);
  });
});
