const crypto = require('crypto');

// Derive 256 bits via PBKDF2-HMAC-SHA256, 100000 iterations, 32-byte random salt.
// output = raw PBKDF2 derived bits (same length as Worker's exportKey('raw')).
async function hashPassword(password) {
  const salt = crypto.randomBytes(32);
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  return { hash: hash.toString('hex'), salt: salt.toString('hex') };
}

(async () => {
  const { hash, salt } = await hashPassword('admin123');
  console.log(JSON.stringify({ hash, salt }));
})().catch(e => { console.error(e); process.exit(1); });
