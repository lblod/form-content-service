const modifierLookupTable = {
  // only inverse path is supported for now
  'http://www.w3.org/ns/shacl#inversePath': '^',
};

export const modifierLookup = (modifier: string) =>
  modifierLookupTable[modifier];
