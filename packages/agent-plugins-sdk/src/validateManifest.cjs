/**
 * validateManifest —— re-export manifest schema 校验
 *
 * 完整实现见 ./manifest.cjs；此处保持向后兼容的入口。
 */
const {
  validateManifest,
  manifestSchema,
  REQUIRED_FIELDS,
  ID_PATTERN,
  SEMVER_PATTERN,
  CONTRIBUTE_TYPES,
  PERMISSION_LO_CAPABILITIES,
  ACTIVATION_TRIGGER_PREFIXES,
  ACTIVATION_TRIGGER_PATTERN,
} = require('./manifest.cjs');

module.exports = {
  validateManifest,
  manifestSchema,
  REQUIRED_FIELDS,
  ID_PATTERN,
  SEMVER_PATTERN,
  CONTRIBUTE_TYPES,
  PERMISSION_LO_CAPABILITIES,
  ACTIVATION_TRIGGER_PREFIXES,
  ACTIVATION_TRIGGER_PATTERN,
};
