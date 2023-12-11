/**
 * This is a naive implementation that will not work for data of the format:
 * <#foo> <#bar> """this text talks about somthing. @prefix is a keyword. if left in text like this, it breaks our implementation""" .
 *
 * The text about prefix will be removed from the text and is a keyword will be interpreted as a prefix statement.
 *
 * We probably don't care.
 */
export const ttlToInsert = function (ttl) {
  const lines = ttl.split(/\.\s/);
  const prefixLines = [] as string[];
  const insertLines = [] as string[];

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine.toLowerCase().startsWith('@prefix')) {
      prefixLines.push(`PREFIX ${trimmedLine.substring(8)}`);
    } else {
      insertLines.push(trimmedLine);
    }
  });

  return `${prefixLines.join('\n')}

  INSERT DATA {
    ${insertLines.join('.\n')}
  }`;
};
