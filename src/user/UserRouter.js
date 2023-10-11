const express = require('express');
const router = express.Router();
const UserService = require('./UserService');
const { check, validationResult } = require('express-validator');
const ValidationException = require('../error/ValidationException');
const pagination = require('../middleware/pagination');
const ForbiddenException = require('../error/ForbiddenException');
const FileService = require('../file/FileService');

router.post(
  '/api/1.0/users',
  check('username')
    .notEmpty()
    .withMessage('Username cannot be null')
    .bail()
    .isLength({ min: 4, max: 32 })
    .withMessage('Must have min 4 and max 32 characters'),
  check('email')
    .notEmpty()
    .withMessage('Email cannot be null')
    .bail()
    .isEmail()
    .withMessage('Email is not valid')
    .bail()
    .custom(async (email) => {
      const user = await UserService.findByEmail(email);
      if (user) {
        throw new Error('Email already in use');
      }
    }),
  check('password')
    .notEmpty()
    .withMessage('Password cannot be null')
    .bail()
    .isLength({ min: 6, max: 32 })
    .withMessage('Password must be atleast 6 characters')
    .bail()
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
    .withMessage(
      'Password must be atleast 1 uppercase, 1lowercase and 1 number',
    ),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ValidationException(errors.array()));
    }
    try {
      await UserService.save(req.body);
      return res.send({ message: 'User created' });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/api/1.0/users/token/:token', async (req, res, next) => {
  const token = req.params.token;
  try {
    await UserService.activate(token);
    return res.status(200).send({ message: 'account_activation_successful' });
  } catch (err) {
    next(err);
  }
});
router.get('/api/1.0/users', pagination, async (req, res) => {
  const authenticatedUser = req.authenticatedUser;
  const { page, size } = req.pagination;
  const users = await UserService.getUsers(page, size, authenticatedUser);
  res.send(users);
});

router.get('/api/1.0/users/:id', UserService.getUser);

router.put(
  '/api/1.0/users/:id',
  check('username')
    .notEmpty()
    .withMessage('Username cannot be null')
    .bail()
    .isLength({ min: 4, max: 32 })
    .withMessage('Must have min 4 and max 32 characters'),
  check('image').custom(async (imageAsBaseBase64String) => {
    if (!imageAsBaseBase64String) {
      return true;
    }
    const buffer = Buffer.from(imageAsBaseBase64String, 'base64');
    if (!FileService.isLessThan2MB(buffer)) {
      throw new Error('Profile image cannot exceed 2MB');
    }

    // check filetype
    const supportedType = await FileService.isSupportedFileType(buffer);
    if (!supportedType) {
      throw new Error(
        'Unsupported file type. Image must either be JPEG or PNG',
      );
    }

    return true;
  }),
  async (req, res, next) => {
    const authenticatedUser = req.authenticatedUser;

    if (!authenticatedUser || authenticatedUser.id != req.params.id) {
      return next(
        new ForbiddenException('You are not authorised to update user'),
      );
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ValidationException(errors.array()));
    }

    const user = await UserService.updateUser(req.params.id, req.body);
    return res.send(user);
  },
);

router.delete('/api/1.0/users/:id', async (req, res, next) => {
  const authenticatedUser = req.authenticatedUser;

  if (!authenticatedUser || authenticatedUser.id != req.params.id) {
    return next(
      new ForbiddenException('You are not authorised to delete user'),
    );
  }
  await UserService.deleteUser(req.params.id);
  return res.send();
});

router.post(
  '/api/1.0/user/password',
  check('email')
    .notEmpty()
    .withMessage('Email cannot be null')
    .bail()
    .isEmail()
    .withMessage('Email is not valid'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ValidationException(errors.array()));
    }
    try {
      await UserService.passwordReset(req.body.email);
      return res.send({ message: 'Password reset has been sent to email' });
    } catch (err) {
      return next(err);
    }
  },
);
const passwordResetTokenValidator = async (req, res, next) => {
  const user = await UserService.findByPasswordResetToken(
    req.body.passwordResetToken,
  );
  if (!user) {
    return next(
      new ForbiddenException('You are not authorised to update your password'),
    );
  }
  next();
};

router.put(
  '/api/1.0/user/password',
  passwordResetTokenValidator,
  check('password')
    .notEmpty()
    .withMessage('Password cannot be null')
    .bail()
    .isLength({ min: 6, max: 32 })
    .withMessage('Password must be atleast 6 characters')
    .bail()
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
    .withMessage(
      'Password must be atleast 1 uppercase, 1lowercase and 1 number',
    ),
  async (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return next(new ValidationException(errors.array()));
    }
    await UserService.updatePassword(req.body);
    res.send();
  },
);
module.exports = router;
