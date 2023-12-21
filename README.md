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

## Limitations

### No Generator Shape Paths

Currently, this service only supports generators with simple paths in their shape, e.g.

```
ext:mandatarisG a form:Generator;
  form:prototype [
    form:shape [
      a ns:Mandataris
    ]
  ];
  form:dataGenerator form:addMuUuid.
```

This generator's shape only has direct attributes (a ns:Mandataris) without modifiers, like sh:inversePath. Anything more complicated will not be handled by this service yet.

For instance, this shape is **not supported**:

```
ext:mandatarisG a form:Generator;
  form:prototype [
    form:shape [
      a ns:Mandataris
      mandaat:isBestuurlijkeAliasVan / foaf:name "De Grote Smurf"
    ]
  ];
  form:dataGenerator form:addMuUuid.
```

### No Modified Simple Paths in fields or generator scopes

Fields and Generators can each define a scope. This service supports simple paths (e.g. `foaf:name`) and complex paths (e.g. `( [ sh:inversePath mandaat:isAangesteldAls ] foaf:name )`). However, modified simple paths are **not supported** (e.g. `[ sh:inversePath mandaat:isAangesteldAls ]`). Luckily, these can always be written in their complex form, which IS supported: `( [ sh:inversePath mandaat:isAangesteldAls ] )` (note the wrapping brackets in this case, signifying a linked list in RDF).
