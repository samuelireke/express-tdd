const User = require('./User');
const bcrypt = require('bcrypt');
// const crypto = require('crypto');
const EmailService = require('../email/EmailService');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const EmailException = require('../email/EmailException');
const InvalidTokenExcepion = require('./InvalidTokenExcepion');
const NotFoundException = require('../error/NotFoundException');
const { randomString } = require('../utils/generator');
const TokenService = require('../auth/TokenService');
const FileService = require('../file/FileService');
// const generateToken = (length) => {
//   return crypto.randomBytes(length).toString('hex').substring(0, length);
// };

const save = async (body) => {
  const { username, email, password } = body;
  const hash = await bcrypt.hash(password, 10);
  const user = {
    username,
    email,
    password: hash,
    activationToken: randomString(16),
  };
  const transaction = await sequelize.transaction();

  await User.create(user, { transaction });
  try {
    await EmailService.sendAccountActivation(email, user.activationToken);
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw new EmailException();
  }
};

const findByEmail = async (email) => {
  return await User.findOne({ where: { email: email } });
};

const activate = async (token) => {
  const user = await User.findOne({ where: { activationToken: token } });
  if (!user) {
    throw new InvalidTokenExcepion();
  }
  user.inactive = false;
  user.activationToken = null;
  await user.save();
};

const getUsers = async (page, size, authenticatedUser) => {
  const usersWithCount = await User.findAndCountAll({
    where: {
      inactive: false,
      id: {
        [Op.not]: authenticatedUser ? authenticatedUser.id : 0,
      },
    },
    attributes: ['id', 'username', 'email', 'image'],
    limit: size,
    offset: page * size,
  });
  return {
    content: usersWithCount.rows,
    page,
    size,
    totalPages: Math.ceil(usersWithCount.count / size),
  };
};

const getUser = async (req, res, next) => {
  try {
    const user = await User.findOne({
      where: {
        id: req.params.id,
        inactive: false,
      },
      attributes: ['id', 'username', 'email', 'image'],
    });
    if (!user) return next(new NotFoundException('User not found'));
    return res.status(200).send(user);
  } catch (err) {
    return res.sendStatus(500);
  }
};

const updateUser = async (id, updatedBody) => {
  const user = await User.findOne({ where: { id: id } });
  user.username = updatedBody.username;

  if (updatedBody.image) {
    if (user.image) {
      await FileService.deleteProfileImage(user.image);
    }
    user.image = await FileService.saveProfileImage(updatedBody.image);
  }
  await user.save();
  return {
    id: id,
    username: user.username,
    email: user.email,
    image: user.image,
  };
};

const deleteUser = async (id) => {
  await User.destroy({ where: { id: id } });
};

const passwordReset = async (email) => {
  const user = await findByEmail(email);
  if (!user) {
    throw new NotFoundException('Email not found');
  }
  user.passwordResetToken = randomString(16);
  await user.save();
  try {
    await EmailService.sendPasswordReset(email, user.passwordResetToken);
  } catch (err) {
    throw new EmailException();
  }
};

const findByPasswordResetToken = (token) => {
  return User.findOne({ where: { passwordResetToken: token } });
};

const updatePassword = async (updateRequest) => {
  const user = await findByPasswordResetToken(updateRequest.passwordResetToken);
  const hash = await bcrypt.hash(updateRequest.password, 10);
  user.password = hash;
  user.passwordResetToken = null;
  user.inactive = false;
  user.activationToken = null;
  await user.save();
  await TokenService.clearTokens(user.id);
};

module.exports = {
  save,
  findByEmail,
  activate,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  passwordReset,
  updatePassword,
  findByPasswordResetToken,
};
