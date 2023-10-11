// const jwt = require('jsonwebtoken');
const { randomString } = require('../utils/generator');
const Token = require('./Token');
const { Op } = require('sequelize');

const ONE_WEEK_IN_MILLIS = 7 * 24 * 60 * 60 * 1000;

const createToken = async (user) => {
  const token = randomString(32);
  await Token.create({
    token,
    userId: user.id,
    lastUsedAt: new Date(),
  });
  return token;
};

const verify = async (token) => {
  const oneWeekAgo = new Date(Date.now() - ONE_WEEK_IN_MILLIS);
  const tokenInDB = await Token.findOne({
    where: {
      token: token,
      lastUsedAt: { [Op.gt]: oneWeekAgo },
    },
  });
  tokenInDB.lastUsedAt = new Date();
  await tokenInDB.save();
  const userId = tokenInDB.userId;
  return { id: userId };
};

const deleteToken = async (token) => {
  await Token.destroy({ where: { token: token } });
};

const scheduledCleanup = async () => {
  setInterval(
    async () => {
      await Token.destroy({
        where: {
          lastUsedAt: {
            [Op.lt]: oneWeekAgo,
          },
        },
      });
    },
    60 * 60 * 1000,
  );
  const oneWeekAgo = new Date(Date.now() - ONE_WEEK_IN_MILLIS);
};

const clearTokens = async (userId) => {
  await Token.destroy({ where: { userId: userId } });
};
module.exports = {
  createToken,
  verify,
  deleteToken,
  scheduledCleanup,
  clearTokens,
};
