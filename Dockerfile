#FROM semtech/mu-javascript-template:1.8.0 AS base
FROM local-js-template AS base
LABEL maintainer="karel.kremer@redpencil.io"
FROM base AS test
# added vitest as a dev dependency and since the template builds with NODE_ENV=production it's discarded
# need to run npm i again with NODE_ENV=test
RUN cd /usr/src/app/app/ && NODE_ENV=test npm i
RUN cd /usr/src/app/app/ && NODE_ENV=test npm run test
FROM base AS production
