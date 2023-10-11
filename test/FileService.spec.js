const FileService = require('../src/file/FileService');
const fs = require('fs');
const path = require('path');
const config = require('config');
const { uploadDir, profileDir } = config;

describe('createFolders', () => {
  it('creates upload folder', () => {
    FileService.createFolders();
    const foldername = uploadDir;
    expect(fs.existsSync(foldername)).toBeTruthy();
  });
  it('creates profile sub-folder in upload folder', () => {
    FileService.createFolders();
    const profileFolder = path.join('.', uploadDir, profileDir);
    expect(fs.existsSync(profileFolder)).toBeTruthy();
  });
});
