import N3 from 'n3';

const parser = new N3.Parser();

export const ttlToStore = function (ttl: string): Promise<N3.Store> {
  const store = new N3.Store();

  return new Promise((resolve, reject) => {
    parser.parse(ttl, (error, quad) => {
      if (!quad) {
        resolve(store);
        return;
      }
      if (error) {
        console.error(error);
        reject(error);
      }
      store.addQuad(quad);
    });
  });
};
