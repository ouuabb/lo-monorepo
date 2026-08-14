const crypto = require('crypto');

class RidUtils {
  static generate() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `res_${timestamp}_${random}`;
  }

  static validate(rid) {
    return /^res_[a-z0-9]+_[a-f0-9]+$/i.test(rid);
  }
}

module.exports = RidUtils;