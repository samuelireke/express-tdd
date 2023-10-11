const request = require('supertest');
const app = require('../src/app');
const User = require('../src/user/User');
const sequelize = require('../src/config/database');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const config = require('config');

const { uploadDir, profileDir } = config;
const profileDirectory = path.join('.', uploadDir, profileDir);
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
afterAll(() => {
  const files = fs.readdirSync(profileDirectory);
  for (const file of files) {
    fs.unlinkSync(path.join(profileDirectory, file));
  }
});
const addUser = async (user = { ...activeUser }) => {
  const hash = await bcrypt.hash(user.password, 10);
  return await User.create({ ...user, password: hash });
};
const putUser = async (id = 5, body = null, options = {}) => {
  let agent = request(app);

  let token;
  if (options.auth) {
    const response = await agent.post('/api/1.0/auth').send(options.auth);
    token = response.body.token;
  }

  agent = request(app).put('/api/1.0/users/' + id);
  if (token) {
    agent.set('Authorization', `Bearer ${token}`);
  }
  if (options.token) {
    agent.set('Authorization', `Bearer ${options.token}`);
  }
  return await agent.send(body);
};

const readFileAsBase64 = (file = 'test-png.png') => {
  const filePath = path.join('.', 'test', 'resources', file);
  return fs.readFileSync(filePath, { encoding: 'base64' });
};
describe('User Update', () => {
  it('returns forbidden when request sent without basic authorization', async () => {
    const response = await putUser(5);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('You are not authorised to update user');
  });
  it('returns proper error body when inactive authentication failure', async () => {
    const nowInMills = new Date().getTime();
    const response = await putUser(5);
    const error = response.body;
    expect(error.path).toBe('/api/1.0/users/5');
    expect(error.timestamp).toBeGreaterThan(nowInMills);
    expect(response.status).toBe(403);
    expect(error.message).toBe('You are not authorised to update user');
    expect(Object.keys(error)).toEqual(['path', 'timestamp', 'message']);
  });
  it('returns forbidden when request sent with incorrect email in basic authorisation', async () => {
    await addUser();
    const response = await putUser(5, null, {
      auth: { ...activeUser, email: 'user1000@email.com' },
    });
    expect(response.status).toBe(403);
  });
  it('returns forbidden when request sent with incorrect password in basic authorisation', async () => {
    await addUser();
    const response = await putUser(5, null, {
      auth: { ...activeUser, password: 'Wr0ngP4ssw0rd' },
    });
    expect(response.status).toBe(403);
  });
  it('returns forbidden when update request is sent with correct credential but for different user', async () => {
    await addUser();
    const userToBeUpdated = {
      ...activeUser,
      username: 'user2',
      email: 'user2@email.com',
    };
    const response = await putUser(userToBeUpdated.id, null, {
      auth: { ...activeUser },
    });
    expect(response.status).toBe(403);
  });
  it('returns forbidden when update request is sent by an inactive user with its correct credential', async () => {
    const inactiveUser = await addUser({
      ...activeUser,
      inactive: true,
    });
    const response = await putUser(inactiveUser.id, null, {
      auth: { ...activeUser },
    });
    expect(response.status).toBe(403);
  });
  it('returns 200 ok when valid request is sent from authorised user', async () => {
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated' };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { ...activeUser, username: validUpdate.username },
    });
    expect(response.status).toBe(200);
  });
  it('updates username in database when valid request is sent from authorised user', async () => {
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated' };
    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: 'P4ssword' },
    });

    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    expect(inDBUser.username).toBe(validUpdate.username);
  });
  it('retuns 403 when token is not valid', async () => {
    const response = await putUser(5, null, {
      token: '123',
    });
    expect(response.status).toBe(403);
  });
  it('saves the user image when update contains image as base64', async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated', image: fileInBase64 };
    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: 'P4ssword' },
    });
    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    expect(inDBUser.image).toBeTruthy();
  });
  it('returns success body having bonly id, username, email and image', async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated', image: fileInBase64 };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: 'P4ssword' },
    });
    expect(Object.keys(response.body)).toEqual([
      'id',
      'username',
      'email',
      'image',
    ]);
  });
  it('saves the user image in upload folder and stores filename in user when update has an image', async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated', image: fileInBase64 };
    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: 'P4ssword' },
    });
    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    const profileImagePath = path.join(profileDirectory, inDBUser.image);
    expect(fs.existsSync(profileImagePath)).toBe(true);
  });
  it('removes the old image after user uploads new image', async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated', image: fileInBase64 };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: 'P4ssword' },
    });
    const firstImage = response.body.image;

    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: 'P4ssword' },
    });
    const profileImagePath = path.join(profileDirectory, firstImage);
    expect(fs.existsSync(profileImagePath)).toBe(false);
  });
  it.each`
    value             | message
    ${null}           | ${'Username cannot be null'}
    ${'usr'}          | ${'Must have min 4 and max 32 characters'}
    ${'a'.repeat(33)} | ${'Must have min 4 and max 32 characters'}
  `(
    'returns bad request with $message when username is updated with $value',
    async ({ message, value }) => {
      const savedUser = await addUser();
      const invalidUpdate = { username: value };
      const response = await putUser(savedUser.id, invalidUpdate, {
        auth: { email: savedUser.email, password: 'P4ssword' },
      });
      expect(response.status).toBe(400);
      expect(response.body.validationErrors.username).toBe(message);
    },
  );
  it('returns 200 when image size is exactly 2mb', async () => {
    const testPng = readFileAsBase64();
    const pngByte = Buffer.from(testPng, 'base64').length;
    const twoMB = 1024 * 1024 * 2;
    const filling = 'a'.repeat(twoMB - pngByte);
    const fillBase64 = Buffer.from(filling).toString('base64');
    const savedUser = await addUser();
    const validUpdate = {
      username: 'user1-updated',
      image: testPng + fillBase64,
    };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: 'P4ssword' },
    });
    expect(response.status).toBe(200);
  });
  it('returns 400 and error message when image size exceeds 2mb', async () => {
    const fileExceedingSize2MB = 'a'.repeat(1024 * 1024 * 2) + 'a';
    const fileInBase64 = Buffer.from(fileExceedingSize2MB).toString('base64');
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated', image: fileInBase64 };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: 'P4ssword' },
    });
    expect(response.status).toBe(400);
    expect(response.body.validationErrors.image).toBe(
      'Profile image cannot exceed 2MB',
    );
  });
  it('keeps the old image after user only updates username', async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated', image: fileInBase64 };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: 'P4ssword' },
    });
    const firstImage = response.body.image;

    await putUser(
      savedUser.id,
      { username: 'user1-updated2' },
      {
        auth: { email: savedUser.email, password: 'P4ssword' },
      },
    );
    const profileImagePath = path.join(profileDirectory, firstImage);
    expect(fs.existsSync(profileImagePath)).toBe(true);

    const userInDB = await User.findOne({ where: { id: savedUser.id } });
    expect(userInDB.image).toBe(firstImage);
  });
  it.each`
    file              | status
    ${'test-gif.gif'} | ${400}
    ${'test-pdf.pdf'} | ${400}
    ${'test-txt.txt'} | ${400}
    ${'test-png.png'} | ${200}
    ${'test-jpg.jpg'} | ${200}
  `(
    'returns $status when uploading $file as image',
    async ({ file, status }) => {
      const fileInBase64 = readFileAsBase64(file);
      const savedUser = await addUser();
      const updateBody = { username: 'user1-updated', image: fileInBase64 };
      const response = await putUser(savedUser.id, updateBody, {
        auth: { email: savedUser.email, password: 'P4ssword' },
      });
      expect(response.status).toBe(status);
    },
  );
  it.each`
    file              | message
    ${'test-gif.gif'} | ${'Unsupported file type. Image must either be JPEG or PNG'}
    ${'test-pdf.pdf'} | ${'Unsupported file type. Image must either be JPEG or PNG'}
    ${'test-txt.txt'} | ${'Unsupported file type. Image must either be JPEG or PNG'}
  `(
    'returns $message when uploading unsupported $file as image',
    async ({ file, message }) => {
      const fileInBase64 = readFileAsBase64(file);
      const savedUser = await addUser();
      const updateBody = { username: 'user1-updated', image: fileInBase64 };
      const response = await putUser(savedUser.id, updateBody, {
        auth: { email: savedUser.email, password: 'P4ssword' },
      });
      expect(response.body.validationErrors.image).toBe(message);
    },
  );
});
