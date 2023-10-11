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
  jest.setTimeout(20000);
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
const auth = async (options = {}) => {
  let agent = request(app);
  let token;
  if (options.auth) {
    const response = await agent.post('/api/1.0/auth').send(options.auth);
    token = response.body.token;
  }
  return token;
};
const addUser = async (user = { ...activeUser }) => {
  const hash = await bcrypt.hash(user.password, 10);
  return await User.create({ ...user, password: hash });
};
const deleteUser = async (id = 5, options = {}) => {
  const agent = request(app).delete('/api/1.0/users/' + id);
  if (options.token) {
    agent.set('Authorization', `Bearer ${options.token}`);
  }

  return await agent.send();
};
describe('User Delete', () => {
  it('returns forbidden when request sent is unauthorised', async () => {
    const response = await deleteUser(5);
    expect(response.status).toBe(403);
  });
  it('returns proper error body when inactive authentication failure', async () => {
    const nowInMills = new Date().getTime();
    const response = await deleteUser(5);
    const error = response.body;
    expect(error.path).toBe('/api/1.0/users/5');
    expect(error.timestamp).toBeGreaterThan(nowInMills);
    expect(error.message).toBe('You are not authorised to delete user');
  });
  it('returns forbidden when delete request is sent with correct credential but for different user', async () => {
    await addUser();
    const userToBeDeleted = {
      ...activeUser,
      username: 'user2',
      email: 'user2@email.com',
    };
    const token = await auth({ auth: { ...activeUser } });
    const response = await deleteUser(userToBeDeleted.id, {
      token,
    });
    expect(response.status).toBe(403);
  });
  it('retuns 403 when token is not valid', async () => {
    const response = await deleteUser(5, {
      token: '123',
    });
    expect(response.status).toBe(403);
  });
  it('returns 200 ok when delete request is sent from authorised user', async () => {
    const savedUser = await addUser();
    const token = await auth({ auth: { ...activeUser } });
    const response = await deleteUser(savedUser.id, {
      token,
    });
    expect(response.status).toBe(200);
  });
  it('deletes user from database when request is sent from authorised user', async () => {
    const savedUser = await addUser();
    const token = await auth({ auth: { ...activeUser } });
    await deleteUser(savedUser.id, {
      token,
    });
    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    expect(inDBUser).toBeNull();
  });
  it('deletes token from database when delete user request is sent from authorised user', async () => {
    const savedUser = await addUser();
    const token = await auth({ auth: { ...activeUser } });
    await deleteUser(savedUser.id, {
      token,
    });
    const tokeninDB = await Token.findOne({ where: { token } });
    expect(tokeninDB).toBeNull();
  });
  it('deletes all token from database when delete user request is sent from authorised user', async () => {
    const savedUser = await addUser();
    const token1 = await auth({ auth: { ...activeUser } });
    const token2 = await auth({ auth: { ...activeUser } });
    await deleteUser(savedUser.id, {
      token: token1,
    });
    const tokeninDB = await Token.findOne({ where: { token: token2 } });
    expect(tokeninDB).toBeNull();
  });
});
