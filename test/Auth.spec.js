const request = require('supertest');
const app = require('../src/app');
const User = require('../src/user/User');
const sequelize = require('../src/config/database');
const bcrypt = require('bcrypt');
const Token = require('../src/auth/Token');

beforeAll(async () => {
  if (process.env.NODE_ENV === 'test') {
    await sequelize.sync();
  }
});
beforeEach(async () => {
  await User.destroy({ truncate: { cascade: true } });
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
const postAuthentication = async (credentials, options = {}) => {
  return await request(app).post('/api/1.0/auth').send(credentials);
};
const postLogout = (options = {}) => {
  const agent = request(app).post('/api/1.0/logout');
  if (options.token) {
    agent.set('Authorization', `Bearer ${options.token}`);
  }
  return agent.send();
};
const putUser = async (id = 5, body = null, options = {}) => {
  let agent = request(app);
  agent = request(app).put('/api/1.0/users/' + id);
  if (options.token) {
    agent.set('Authorization', `Bearer ${options.token}`);
  }
  return await agent.send(body);
};

describe('Authentication', () => {
  it('returns 200 when credentials are correct', async () => {
    await addUser();
    const response = await postAuthentication({ ...activeUser });
    expect(response.status).toBe(200);
  });
  it('returns only user username, image and token when login success', async () => {
    const user = await addUser();
    const response = await postAuthentication({ ...activeUser });
    expect(response.body.id).toBe(user.id);
    expect(response.body.username).toBe(user.username);
    expect(Object.keys(response.body)).toEqual([
      'id',
      'username',
      'image',
      'token',
    ]);
  });
  it('returns 401 when user does not exist', async () => {
    const response = await postAuthentication({ ...activeUser });
    expect(response.status).toBe(401);
  });
  it('returns proper error body when user not found in database', async () => {
    const nowInMills = new Date().getTime();
    const response = await postAuthentication({ ...activeUser });
    const error = response.body;
    expect(error.path).toBe('/api/1.0/auth');
    expect(error.timestamp).toBeGreaterThan(nowInMills);
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Incorrect credentials');
    expect(Object.keys(error)).toEqual(['path', 'timestamp', 'message']);
  });
  it('returns 401 when password is wrong', async () => {
    await addUser();
    const response = await postAuthentication({
      ...activeUser,
      password: 'Wr0ngP4ssw0rd',
    });
    expect(response.status).toBe(401);
  });
  it('returns 403 when loggin with an inactive account', async () => {
    await addUser({
      ...activeUser,
      inactive: true,
    });
    const response = await postAuthentication({ ...activeUser });
    expect(response.status).toBe(403);
  });
  it('returns proper error body when inactive authentication failure', async () => {
    await addUser({
      ...activeUser,
      inactive: true,
    });
    const nowInMills = new Date().getTime();
    const response = await postAuthentication({ ...activeUser });
    const error = response.body;
    expect(error.path).toBe('/api/1.0/auth');
    expect(error.timestamp).toBeGreaterThan(nowInMills);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Account is inactive');
    expect(Object.keys(error)).toEqual(['path', 'timestamp', 'message']);
  });
  it('returns 401 when email is invalid', async () => {
    const response = await postAuthentication({
      ...activeUser,
      email: '@email',
    });
    expect(response.status).toBe(401);
  });
  it('returns 401 when password is invalid', async () => {
    await addUser();
    const response = await postAuthentication({
      ...activeUser,
      password: 'Wr0ngP4ssw0rd',
    });
    expect(response.status).toBe(401);
  });
  it('returns token in response body when credentials are correct', async () => {
    await addUser();
    const response = await postAuthentication({ ...activeUser });
    expect(response.body.token).not.toBeUndefined();
  });
});

describe('Logout', () => {
  it('returns 200 ok when an unauthorised request is sent for logout', async () => {
    const response = await postLogout();
    expect(response.status).toBe(200);
  });
  it('returns removes token from database', async () => {
    await addUser();
    const response = await postAuthentication({ ...activeUser });
    const token = response.body.token;
    await postLogout({ token: token });
    const storedToken = await Token.findOne({ where: { token: token } });
    expect(storedToken).toBeNull();
  });
});

describe('Token Expiration', () => {
  it('return 403 when token is older than 1 week', async () => {
    const savedUser = await addUser();

    const token = 'test-token';
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1);

    await Token.create({
      token,
      userId: savedUser.id,
      lastUsedAt: oneWeekAgo,
    });
    const validUpdate = { username: 'user1-updated' };
    const response = await putUser(savedUser.id, validUpdate, {
      token: token,
    });
    expect(response.status).toBe(403);
  });

  it('refreshes lastUsedAt when unexpired token is used', async () => {
    const savedUser = await addUser();

    const token = 'test-token';
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

    await Token.create({
      token,
      userId: savedUser.id,
      lastUsedAt: fourDaysAgo,
    });
    const validUpdate = { username: 'user1-updated' };
    const beforeUpdate = new Date();
    await putUser(savedUser.id, validUpdate, {
      token: token,
    });
    const tokenInDB = await Token.findOne({ where: { token: token } });
    expect(tokenInDB.lastUsedAt.getTime()).toBeGreaterThan(
      beforeUpdate.getTime(),
    );
  });
  it('refreshes lastUsedAt when unexpired token is used for unauthenticated endpoint', async () => {
    const savedUser = await addUser();

    const token = 'test-token';
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

    await Token.create({
      token,
      userId: savedUser.id,
      lastUsedAt: fourDaysAgo,
    });
    const beforeUpdate = new Date();
    await request(app)
      .get('/api/1.0/users/5')
      .set('Authorization', `Bearer ${token}`);
    const tokenInDB = await Token.findOne({ where: { token: token } });
    expect(tokenInDB.lastUsedAt.getTime()).toBeGreaterThan(
      beforeUpdate.getTime(),
    );
  });
});
