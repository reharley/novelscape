const hi =
  '[\n    {\n        "fullName": "Dursleys",\n        "alias": null,\n        "type": "Character",\n        "description": "The family where Harry Potter\'s nephew lived before going to Hogwarts.",\n    },\n    {\n        "fullName": "Privet Drive",\n        "alias": null,\n        "type": "Building",\n        "description": "The street where the Dursleys lived and where Harry Potter was left as a baby.",\n    },\n    {\n        "fullName": "Harry Potter",\n        "alias": null,\n        "type": "Character",\n        "description": "The famous wizard and nephew of the Dursleys.",\n    },\n    {\n        "fullName": "Vernon Dursley",\n        "alias": "Mr. Dursley",\n        "type": "Character",\n        "description": "The uncle of Harry Potter.",\n    },\n    {\n        "fullName": "Dudley Dursley",\n        "alias": null,\n        "type": "Character",\n        "description": "The son of the Dursleys and cousin of Harry Potter.",\n    }\n]';

// strip the newlines and parse the JSON
const regex = /\,(?=\s*?[\}\]])/g;
let clean = hi.replace(regex, '');
// trim the whitespace between the properties
// clean = clean.replace(/, /g, ',');

// strip the trailing commas for the last property in each object
// clean = clean.replace(/},/g, '}');

const hello = JSON.parse(clean);
console.log(hello);
