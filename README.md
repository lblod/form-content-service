# Form Content Service

This is a service that manages the contents of instances created through semantic forms. The definitions of forms are not (currently?) managed by this service.

> [!CAUTION]
> This service is under construction and is not ready to be used in a production environment

## Local Development

To build this service, first user docker build, e.g.

```
docker build -t local-form-manager .
```

Then run it by running e.g.:

```
docker run --rm -it -p 9229:9229 -p 8081:80 -e NODE_ENV=development local-form-manager
```

Running it in development mode and exposing port 9229 allows you to connect your debugger to the docker.
