const config = require('config');
const SMTPServer = require('smtp-server').SMTPServer;

let server, lastMail;

const getLastMail = () => lastMail;

const getServer = (simulateSmtpFailure = false) => {
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
  return [server, lastMail];
};
const startSMTPServer = async (simulateSmtpFailure = false) => {
  [server, lastMail] = getServer(simulateSmtpFailure);
  await server.listen(config.mail.port, 'localhost');
  console.log(`lastMail is ${lastMail}`);
  return [server, lastMail];
};

const closeSMTPServer = async () => {
  await server.close();
};

module.exports = { startSMTPServer, closeSMTPServer, getServer, getLastMail };
