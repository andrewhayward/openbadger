const db = require('./');
const mongoose = require('mongoose');
const env = require('../lib/environment');
const util = require('../lib/util');
const Schema = mongoose.Schema;

const DEFAULT_SECRET_LENGTH = 64;
const NAME_MAX_LENGTH = 128;
const ORG_MAX_LENGTH = 128;

function generateRandomSecret() {
  return util.strongRandomString(DEFAULT_SECRET_LENGTH);
}

function maxLength(field, length) {
  function lengthValidator() {
    if (!this[field]) return true;
    return this[field].length <= length;
  }
  var msg = 'maxLength';
  return [lengthValidator, msg];
}

const regex = {
  email: /[a-z0-9!#$%&'*+\/=?\^_`{|}~\-]+(?:\.[a-z0-9!#$%&'*+\/=?\^_`{|}~\-]+)*@(?:[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?/
};

const ProgramSchema = new Schema({
  name: {
    type: String,
    trim: true,
    required: true,
  },
  badges: [{ type: Schema.Types.ObjectId, ref: 'Badge'}]
});
const AccessUser = new Schema({
  email: {
    type: String,
    trim: true,
    required: true,
    match: regex.email
  },
});
const IssuerSchema = new Schema({
  name: {
    type: String,
    trim: true,
    required: true,
    validate: maxLength('name', NAME_MAX_LENGTH)
  },
  uid: {
    type: String,
    trim: true,
    required: true,
  },
  contact: {
    type: String,
    trim: true,
    required: true,
    match: regex.email
  },
  jwtSecret: {
    type: String,
    trim: true,
    required: true,
    default: generateRandomSecret
  },
  accessList: [AccessUser],
  programs: [ProgramSchema]
});
const Issuer = db.model('Issuer', IssuerSchema);

/**
 * Set a new random secret if one is not already defined.
 * While we already have a `default` set in the schema, that only gets
 * set at instantiation. We want to be able to delete the secret that's
 * already there and get a new one generated for us.
 */

IssuerSchema.pre('validate', function defaultSecret(next) {
  if (this.jwtSecret) return next();
  this.jwtSecret = generateRandomSecret();
  return next();
});

IssuerSchema.pre('validate', function defaultUid(next) {
  if (this.uid) return next();
  this.uid = util.slugify(this.name);
  return next();
});

Issuer.findByAccess = function findByAccess(email, callback) {
  const query = {accessList: {'$elemMatch': {email: email }}};
  return Issuer.find(query, callback);
};

Issuer.prototype.addProgram = function addProgram(props) {
  return this.programs.push(props);
};

Issuer.prototype.hasAccess = function hasAccess(email) {
  return this.accessList.some(function (acl) {
    return acl.email === email;
  });
};

Issuer.prototype.addAccess = function addAccess(emails) {
  if (arguments.length > 1)
    return this.addAccess([].slice.call(arguments));
  if (typeof emails === 'string')
    return this.addAccess([emails]);

  emails = emails.filter(function (email) {
    return !this.hasAccess(email);
  }.bind(this));

  if (emails.length == 0)
    return false;

  emails.forEach(function (email) {
    this.accessList.push({email: email});
  }.bind(this));

  return true;
};

Issuer.prototype.removeAccess = function removeAccess(email) {
  const oldList = this.accessList;
  const newList = oldList.filter(function (acl) {
    return acl.email !== email;
  });
  if (newList.length === oldList.length)
    return false;
  this.accessList = newList;
  return true;
};

// TODO: change this to work with the fact that we now have the concept
// of multiple issuers & multiple organizations for each issuer.
Issuer.getAssertionObject = function getAssertionObject(callback) {
  Issuer.findOne(function (err, issuer) {
    if (err)
      return callback(err);
    if (!issuer)
      return callback(new Error('no issuer in database'));
    var result = {};
    result.name = issuer.name;
    result.contact = issuer.contact;
    if (issuer.org)
      result.org = issuer.org;
    result.origin = env.origin();
    return callback(null, result);
  });
};


module.exports = Issuer;
