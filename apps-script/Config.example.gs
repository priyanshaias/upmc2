// TEMPLATE. Copy to Config.local.gs (kept out of GitHub), fill in, and paste it into Apps Script as a second file.
const LOCAL_CONFIG = {
  ACCOUNTS: {                            // role 'operator' or 'admin'
    // username: { role: 'operator', name: 'Field operator', salt: '<random>', hash: '<sha256(salt + password)>' },
  },
};

/** Helper: run makeHash('newpassword') from the editor; copy the logged salt and hash into ACCOUNTS. */
function makeHash(pw) {
  const salt = Utilities.getUuid().replace(/-/g, '');
  Logger.log(JSON.stringify({ salt, hash: sha256hex_(salt + pw) }));
}
