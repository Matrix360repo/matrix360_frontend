'use strict';
const ROUTES = Object.freeze({lead_pipeline:'/leads', content_creation:'/content', marketing_activation:'/marketing'});
function validate(value, schema, depth = 0) {
  if (depth > 8) throw Error('Response too deep');
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid object');
    if (schema.required.some(key => !Object.hasOwn(value, key))) throw Error('Missing field');
    if (Object.keys(value).some(key => !Object.hasOwn(schema.properties, key))) throw Error('Unknown field');
    for (const key of Object.keys(value)) validate(value[key], schema.properties[key], depth + 1);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > 12) throw Error('Invalid array');
    value.forEach(item => validate(item, schema.items, depth + 1));
  } else {
    if (typeof value !== schema.type || (typeof value === 'string' && value.length > 4000)) throw Error('Invalid value');
    if (schema.enum && !schema.enum.includes(value)) throw Error('Invalid enum');
  }
}
module.exports = {validate, ROUTES};
