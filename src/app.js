const express = require('express');
const UserRouter = require('./user/UserRouter');
const AuthenticationRouter = require('./auth/AuthenticationRouter');
const errorHandler = require('./error/ErrorHandler');
const tokenAuthentication = require('./middleware/tokenAuthentication');
const FileService = require('./file/FileService');
const path = require('path');
const config = require('config');

const { uploadDir, profileDir } = config;
const profileFolder = path.join('.', uploadDir, profileDir);

const ONEYEARINMILLIS = 365 * 24 * 60 * 60 * 1000;

FileService.createFolders();
const app = express();

app.use(express.json({ limit: '3mb' }));

app.use('/images', express.static(profileFolder, { maxAge: ONEYEARINMILLIS }));

app.use(tokenAuthentication);

app.use(UserRouter);
app.use(AuthenticationRouter);

app.use(errorHandler);

module.exports = app;
